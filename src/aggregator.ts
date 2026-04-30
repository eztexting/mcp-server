#!/usr/bin/env node
// v0.2 — single-entry aggregator over the 4 EZTexting MCP sub-servers.
//
// Strategy: spawn one `mcp-remote` child per sub-server (each handles its own
// OAuth 2.1 PKCE dance + token cache via ~/.mcp-auth/), open a stdio Client to
// each, and expose one unified stdio Server upstream with prefixed tool names.
//
// First run: user authorizes 4 times (one browser tab per sub-server). Cached
// tokens persist in ~/.mcp-auth/mcp-remote-<version>/<serverUrlHash>/.
//
// Single-dance OAuth across all 4 upstreams is a v0.3 problem — needs either
// a server-side aggregation endpoint or a custom OAuthClientProvider.

import { createRequire } from 'node:module';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const SUB_SERVERS = [
  { prefix: 'messaging', url: 'https://mcp.eztexting.com/mcp/messaging' },
  { prefix: 'contacts',  url: 'https://mcp.eztexting.com/mcp/contacts' },
  { prefix: 'workflows', url: 'https://mcp.eztexting.com/mcp/workflows' },
  { prefix: 'admin',     url: 'https://mcp.eztexting.com/mcp/admin' },
] as const;

const PREFIX_SEP = '_';
const SERVER_INFO = { name: 'eztexting', version: '0.2.0' };

interface UpstreamConn {
  prefix: string;
  client: Client;
  transport: StdioClientTransport;
}

const require = createRequire(import.meta.url);

function resolveMcpRemoteBin(): string {
  const pkg = require('mcp-remote/package.json') as { bin?: string | Record<string, string> };
  const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin['mcp-remote'];
  if (!entry) throw new Error('mcp-remote package.json has no mcp-remote bin entry');
  return require.resolve(`mcp-remote/${entry}`);
}

async function connectAll(): Promise<UpstreamConn[]> {
  const bin = resolveMcpRemoteBin();
  return Promise.all(SUB_SERVERS.map(async ({ prefix, url }) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, url],
    });
    const client = new Client(
      { name: `eztexting-${prefix}-bridge`, version: SERVER_INFO.version },
      { capabilities: {} },
    );
    await client.connect(transport);
    return { prefix, client, transport };
  }));
}

async function main(): Promise<void> {
  const upstreams = await connectAll();
  const byPrefix = new Map(upstreams.map(u => [u.prefix, u]));

  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const lists = await Promise.all(upstreams.map(async ({ prefix, client }) => {
      const { tools } = await client.listTools();
      return tools.map((t): Tool => ({
        ...t,
        name: `${prefix}${PREFIX_SEP}${t.name}`,
        description: t.description ? `[${prefix}] ${t.description}` : `[${prefix}]`,
      }));
    }));
    return { tools: lists.flat() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const sep = name.indexOf(PREFIX_SEP);
    if (sep <= 0) {
      throw new Error(`tool "${name}" missing required "<prefix>${PREFIX_SEP}..." segment`);
    }
    const prefix = name.slice(0, sep);
    const upstream = byPrefix.get(prefix);
    if (!upstream) {
      throw new Error(`unknown tool prefix "${prefix}"; valid: ${[...byPrefix.keys()].join(', ')}`);
    }
    const upstreamName = name.slice(sep + 1);
    return upstream.client.callTool({ name: upstreamName, arguments: args });
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
