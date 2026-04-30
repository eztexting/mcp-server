#!/usr/bin/env node
// v0.3 — single-entry aggregator with shared OAuth provider.
//
// Strategy: one SharedOAuthProvider instance services all 4 upstream Streamable
// HTTP connections. First connection that needs auth triggers ONE browser dance;
// the resulting tokens are written to ~/.mcp-auth/eztexting-mcp-server/ and the
// remaining 3 upstreams reuse them without further user interaction.
//
// Tool names from each sub-server are exposed unprefixed since EZTexting's
// catalog has no cross-server collisions today; if collisions arise, prefix
// here before constructing the spec.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

import { SharedOAuthProvider } from './oauthProvider.js';

const CANONICAL_RESOURCE = 'https://mcp.eztexting.com/mcp';
const ALL_SUB_SERVERS = [
  { name: 'messaging', url: 'https://mcp.eztexting.com/mcp/messaging' },
  { name: 'contacts',  url: 'https://mcp.eztexting.com/mcp/contacts' },
  { name: 'workflows', url: 'https://mcp.eztexting.com/mcp/workflows' },
  { name: 'admin',     url: 'https://mcp.eztexting.com/mcp/admin' },
] as const;

type SubServer = (typeof ALL_SUB_SERVERS)[number];

const SERVER_INFO = { name: 'eztexting', version: '0.3.0' };

function parseServersFlag(argv: readonly string[]): readonly SubServer[] {
  const idx = argv.indexOf('--servers');
  if (idx < 0) return ALL_SUB_SERVERS;
  const raw = argv[idx + 1];
  if (!raw) {
    process.stderr.write('eztexting-mcp: --servers requires a comma-separated list\n');
    process.exit(2);
  }
  const requested = raw.split(',').map(s => s.trim()).filter(Boolean);
  const valid = new Map<string, SubServer>(ALL_SUB_SERVERS.map(s => [s.name, s]));
  const selected: SubServer[] = [];
  for (const name of requested) {
    const sub = valid.get(name);
    if (!sub) {
      const validNames = [...valid.keys()].join(', ');
      process.stderr.write(`eztexting-mcp: unknown server "${name}"; valid: ${validNames}\n`);
      process.exit(2);
    }
    if (!selected.includes(sub)) selected.push(sub);
  }
  if (selected.length === 0) {
    process.stderr.write('eztexting-mcp: --servers list resolved to zero servers\n');
    process.exit(2);
  }
  return selected;
}

interface UpstreamConn {
  name: string;
  client: Client;
}

async function connectUpstream(
  url: string,
  name: string,
  authProvider: SharedOAuthProvider,
): Promise<Client> {
  const client = new Client(
    { name: `eztexting-${name}-bridge`, version: SERVER_INFO.version },
    { capabilities: {} },
  );
  const makeTransport = (): StreamableHTTPClientTransport =>
    new StreamableHTTPClientTransport(new URL(url), { authProvider });

  try {
    await client.connect(makeTransport());
    return client;
  } catch (err: unknown) {
    if (!(err instanceof UnauthorizedError)) throw err;
  }

  const code = await authProvider.waitForAuthorizationCode();
  const transport = makeTransport();
  await transport.finishAuth(code);
  await client.connect(transport);
  return client;
}

async function main(): Promise<void> {
  const subServers = parseServersFlag(process.argv.slice(2));
  const authProvider = new SharedOAuthProvider({ resource: CANONICAL_RESOURCE });
  await authProvider.start();

  // Connect the first upstream alone so a single OAuth dance covers all of them.
  // Once it succeeds, tokens are saved to disk and the remaining upstreams reuse
  // them in parallel.
  const [first, ...rest] = subServers;
  if (!first) throw new Error('no sub-servers selected');
  const firstConn: UpstreamConn = {
    name: first.name,
    client: await connectUpstream(first.url, first.name, authProvider),
  };
  const restConns: UpstreamConn[] = await Promise.all(rest.map(async ({ name, url }) => ({
    name,
    client: await connectUpstream(url, name, authProvider),
  })));
  const upstreams = [firstConn, ...restConns];
  await authProvider.stop();

  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  const toolOwner = new Map<string, Client>();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const lists = await Promise.all(upstreams.map(async ({ client }) => {
      const { tools } = await client.listTools();
      return tools;
    }));
    toolOwner.clear();
    const flat: Tool[] = [];
    lists.forEach((tools, idx) => {
      const owner = upstreams[idx]?.client;
      if (!owner) return;
      for (const t of tools) {
        toolOwner.set(t.name, owner);
        flat.push(t);
      }
    });
    return { tools: flat };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const owner = toolOwner.get(name);
    if (!owner) throw new Error(`unknown tool "${name}"; call tools/list first`);
    return owner.callTool({ name, arguments: args });
  });

  await server.connect(new StdioServerTransport());

  const shutdown = async (): Promise<void> => {
    await Promise.allSettled(upstreams.map(u => u.client.close()));
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`eztexting-mcp aggregator: ${msg}\n`);
  process.exit(1);
});
