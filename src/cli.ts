#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ENDPOINTS = {
  messaging: 'https://mcp.eztexting.com/mcp/messaging',
  contacts:  'https://mcp.eztexting.com/mcp/contacts',
  workflows: 'https://mcp.eztexting.com/mcp/workflows',
  admin:     'https://mcp.eztexting.com/mcp/admin',
} as const;

type ServerKey = keyof typeof ENDPOINTS;

const require = createRequire(import.meta.url);

function parseArgs(argv: readonly string[]): { server: ServerKey; passthrough: string[] } {
  const args = [...argv];
  let server: ServerKey = 'messaging';
  const idx = args.indexOf('--server');
  if (idx >= 0) {
    const next = args[idx + 1];
    if (next === undefined || !(next in ENDPOINTS)) {
      const valid = Object.keys(ENDPOINTS).join(', ');
      console.error(`eztexting-mcp: unknown --server "${next ?? ''}"; valid: ${valid}`);
      process.exit(2);
    }
    server = next as ServerKey;
    args.splice(idx, 2);
  }
  return { server, passthrough: args };
}

function resolveMcpRemoteBin(): string {
  const pkg = require('mcp-remote/package.json') as { bin?: string | Record<string, string> };
  const entry = typeof pkg.bin === 'string'
    ? pkg.bin
    : pkg.bin && Object.values(pkg.bin)[0];
  if (!entry) throw new Error('mcp-remote package.json has no bin entry');
  return require.resolve(`mcp-remote/${entry}`);
}

const { server, passthrough } = parseArgs(process.argv.slice(2));
const url = ENDPOINTS[server];
const bin = resolveMcpRemoteBin();

const child = spawn(process.execPath, [bin, url, ...passthrough], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
