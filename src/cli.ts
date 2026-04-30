#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const SUB_ENDPOINTS = {
  messaging: 'https://mcp.eztexting.com/mcp/messaging',
  contacts:  'https://mcp.eztexting.com/mcp/contacts',
  workflows: 'https://mcp.eztexting.com/mcp/workflows',
  admin:     'https://mcp.eztexting.com/mcp/admin',
} as const;

type SubKey = keyof typeof SUB_ENDPOINTS;

const require = createRequire(import.meta.url);

function parseArgs(argv: readonly string[]): { url: string; passthrough: string[] } {
  const args = [...argv];
  const valid = Object.keys(SUB_ENDPOINTS).join(', ');
  const idx = args.indexOf('--server');
  if (idx < 0) {
    process.stderr.write(`eztexting-mcp-single: --server <name> is required; valid: ${valid}\n`);
    process.exit(2);
  }
  const next = args[idx + 1];
  if (next === undefined || !(next in SUB_ENDPOINTS)) {
    process.stderr.write(`eztexting-mcp-single: unknown --server "${next ?? ''}"; valid: ${valid}\n`);
    process.exit(2);
  }
  args.splice(idx, 2);
  return { url: SUB_ENDPOINTS[next as SubKey], passthrough: args };
}

function resolveMcpRemoteBin(): string {
  const pkg = require('mcp-remote/package.json') as { bin?: string | Record<string, string> };
  const entry = typeof pkg.bin === 'string'
    ? pkg.bin
    : pkg.bin && (pkg.bin['mcp-remote'] ?? Object.values(pkg.bin)[0]);
  if (!entry) throw new Error('mcp-remote package.json has no bin entry');
  return require.resolve(`mcp-remote/${entry}`);
}

const { url, passthrough } = parseArgs(process.argv.slice(2));
const bin = resolveMcpRemoteBin();

const child = spawn(process.execPath, [bin, url, ...passthrough], { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
