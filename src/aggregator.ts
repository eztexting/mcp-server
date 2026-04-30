// v0.2 DRAFT — single-entry aggregator over the 4 EZTexting MCP sub-servers.
//
// NOT wired into the package bin. v0.1 ships cli.ts (one sub-server per --server flag,
// thin wrapper around mcp-remote). v0.2 will retarget bin to a built variant of this
// file once the open items below are resolved.
//
// Additional dependency needed at v0.2:
//   "@modelcontextprotocol/sdk": "^1.x"
//
// Open items before this draft can ship:
//   1. OAuthClientProvider implementation. Either depend on mcp-remote's
//      NodeOAuthClientProvider, or write a small file-backed provider at
//      ~/.mcp-auth/eztexting/. Single browser dance shared across all 4 upstreams.
//   2. Pre-baked client_id registered in McpRegisteredClientRepository.java so end
//      users skip Dynamic Client Registration.
//   3. Audience-binding: one resource (https://mcp.eztexting.com/mcp) shared across
//      sub-servers, vs. per-sub-server resource. Affects token reuse.
//   4. Tool name conflict policy. With prefix "messaging_" + upstream tool
//      "message_send" -> "messaging_message_send". First underscore splits prefix
//      from upstream name. Verified safe given current tool inventory; revisit if
//      sub-server names ever start to overlap.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
// import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

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
}

async function connectAll(): Promise<UpstreamConn[]> {
  // TODO(v0.2): construct a shared OAuthClientProvider here and pass it into each
  // StreamableHTTPClientTransport so all 4 upstreams reuse one browser dance and
  // one token cache.
  return Promise.all(SUB_SERVERS.map(async ({ prefix, url }) => {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client(
      { name: `eztexting-${prefix}-bridge`, version: SERVER_INFO.version },
      { capabilities: {} },
    );
    await client.connect(transport);
    return { prefix, client };
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
  console.error(`eztexting-mcp aggregator: ${msg}`);
  process.exit(1);
});
