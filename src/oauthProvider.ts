import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server as HttpServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import open from 'open';

// Shared on-disk auth state for the EZTexting MCP bridge. All four upstream
// connections use this single provider so one OAuth 2.1 PKCE dance covers them
// all and tokens are reused across upstreams.

const AUTH_DIR = join(homedir(), '.mcp-auth', 'eztexting-mcp-server');
const TOKENS_FILE = join(AUTH_DIR, 'tokens.json');
const CLIENT_FILE = join(AUTH_DIR, 'client_info.json');
const CALLBACK_PATH = '/oauth/callback';

// Stable callback port derived from canonical resource URL — same across runs
// so cached client_info.json (which contains the registered redirect_uri)
// remains valid and Spring AS redirects land on a listener that's actually up.
// Range chosen to avoid common dev ports; 12000 + (hash mod 8000) → 12000–19999.
function deterministicCallbackPort(canonicalResource: string): number {
  const digest = createHash('sha256').update(canonicalResource).digest();
  const slice = digest.readUInt32BE(0);
  return 12000 + (slice % 8000);
}

interface AuthorizationOutcome {
  code: string;
  state: string;
}

export interface SharedOAuthProviderOptions {
  resource: string;
  clientName?: string;
}

export class SharedOAuthProvider {
  readonly clientMetadata: OAuthClientMetadata;
  private readonly resource: string;
  private callbackPort = 0;
  private codeVerifierBuf: string | undefined;
  private callbackServer: HttpServer | undefined;
  private pendingCode: Promise<AuthorizationOutcome> | undefined;
  private pendingResolve: ((outcome: AuthorizationOutcome) => void) | undefined;
  private pendingReject: ((err: Error) => void) | undefined;
  private expectedState: string | undefined;

  constructor(opts: SharedOAuthProviderOptions) {
    this.resource = opts.resource;
    this.callbackPort = deterministicCallbackPort(opts.resource);
    this.clientMetadata = {
      client_name: opts.clientName ?? 'EZTexting MCP Bridge',
      redirect_uris: [`http://localhost:${this.callbackPort}${CALLBACK_PATH}`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    } satisfies OAuthClientMetadata;
    mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
  }

  async start(): Promise<void> {
    await this.ensureCallbackServer();
  }

  get redirectUrl(): string {
    return `http://localhost:${this.callbackPort}${CALLBACK_PATH}`;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return readJson<OAuthClientInformationFull>(CLIENT_FILE);
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await writeJson(CLIENT_FILE, info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return readJson<OAuthTokens>(TOKENS_FILE);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJson(TOKENS_FILE, tokens);
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    const safeUnlink = async (p: string): Promise<void> => {
      try { await unlink(p); } catch { /* missing is fine */ }
    };
    if (scope === 'all' || scope === 'tokens') await safeUnlink(TOKENS_FILE);
    if (scope === 'all' || scope === 'client') await safeUnlink(CLIENT_FILE);
    if (scope === 'all' || scope === 'verifier') this.codeVerifierBuf = undefined;
  }

  state(): string {
    return randomUUID();
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    this.codeVerifierBuf = verifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this.codeVerifierBuf) throw new Error('code verifier not set');
    return this.codeVerifierBuf;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.resource && !authorizationUrl.searchParams.has('resource')) {
      authorizationUrl.searchParams.set('resource', this.resource);
    }
    this.expectedState = authorizationUrl.searchParams.get('state') ?? undefined;
    await this.ensureCallbackServer();
    process.stderr.write(`\nOpening browser for EZTexting sign-in:\n  ${authorizationUrl.toString()}\n\n`);
    await open(authorizationUrl.toString());
  }

  async waitForAuthorizationCode(): Promise<string> {
    if (!this.pendingCode) {
      throw new Error('redirectToAuthorization must be called before waitForAuthorizationCode');
    }
    const outcome = await this.pendingCode;
    this.pendingCode = undefined;
    if (this.expectedState !== undefined && outcome.state !== this.expectedState) {
      throw new Error(`OAuth state mismatch: expected ${this.expectedState}, got ${outcome.state}`);
    }
    return outcome.code;
  }

  async stop(): Promise<void> {
    const server = this.callbackServer;
    this.callbackServer = undefined;
    if (server) await new Promise<void>((res) => server.close(() => res()));
  }

  private async ensureCallbackServer(): Promise<void> {
    if (this.callbackServer) return;
    // Reset state for a fresh dance after token cache miss / explicit invalidate.
    this.expectedState = undefined;
    this.pendingCode = new Promise<AuthorizationOutcome>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
    });
    const server = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end();
        return;
      }
      const requestUrl = new URL(req.url, `http://localhost:${this.callbackPort}`);
      if (requestUrl.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      const errorParam = requestUrl.searchParams.get('error');
      if (errorParam) {
        const description = requestUrl.searchParams.get('error_description') ?? '';
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`OAuth error: ${errorParam}. ${description}`);
        this.pendingReject?.(new Error(`OAuth error: ${errorParam}. ${description}`));
        return;
      }
      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code or state');
        this.pendingReject?.(new Error('OAuth callback missing code or state'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
        .end('<html><body>EZTexting sign-in complete. You can close this tab.</body></html>');
      this.pendingResolve?.({ code, state });
    });
    await new Promise<void>((res, rej) => {
      server.once('error', rej);
      server.listen(this.callbackPort, '127.0.0.1', () => res());
    });
    this.callbackServer = server;
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export function hashCanonicalResource(resource: string): string {
  return createHash('sha256').update(resource).digest('hex').slice(0, 16);
}
