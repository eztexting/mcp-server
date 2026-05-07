# @eztexting/mcp-server

mcp-name: com.eztexting/mcp

Stdio bridge to the EZTexting MCP service at `https://mcp.eztexting.com`. Use this **only** when your client doesn't speak Streamable HTTP MCP natively.

> **Prefer remote.** Most modern MCP clients (Claude.ai, ChatGPT, Claude Desktop, Claude Code, Cursor 0.46+, VS Code 1.99+, Windsurf, Cline 3.0+) connect direct to `https://mcp.eztexting.com/mcp` — no npm, no Node, no child process. See the [onboarding guide](https://mcp.eztexting.com/) for copy-paste configs.

Thin wrapper around [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) targeting the unified `/mcp` endpoint. One stdio MCP entry, all 38 tools (some staticly loaded and others discoverable), one OAuth 2.1 PKCE dance. ~3k tokens of catalog (measured).

## Remote (recommended)

Point your client at:

```
https://mcp.eztexting.com/mcp
```

OAuth 2.1 PKCE auto-discovers via `/.well-known/oauth-authorization-server`. See [https://mcp.eztexting.com/](https://mcp.eztexting.com/) for per-client snippets (Claude Desktop, Claude Code `--transport http`, Cursor, VS Code `type: http`, Windsurf, Cline).

## Local stdio bridge — fallback

Add to `claude_desktop_config.json` (or equivalent — only if your client lacks remote MCP support):

```json
{
  "mcpServers": {
    "eztexting": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server"]
    }
  }
}
```

**First run:** browser opens to `https://mcp.eztexting.com/oauth2/...`. Sign in. Tokens persist to `~/.mcp-auth/mcp-remote-<version>/<hash>/`. Subsequent launches skip the browser.

To force a fresh sign-in, delete that directory.

## Sub-servers

The unified `/mcp` endpoint includes all of these. Use the per-sub-server form below only if you want narrow tool catalogs or separate Claude Code identities.

| Sub-server | URL | Tools |
|-----------|-----|-------|
| `messaging` | `https://mcp.eztexting.com/mcp/messaging` | `message_send`, `message_list`, `message_get`, `message_template_*`, `conversation_*`, `message_report_*` |
| `contacts` | `https://mcp.eztexting.com/mcp/contacts` | `contact_*`, `contact_group_*`, `contact_field_*` |
| `workflows` | `https://mcp.eztexting.com/mcp/workflows` | `wf_list`, `wf_fetch`, `wf_save`, `wf_status`, `wf_schema`, `wf_templates`, `wf_stat`, `wf_create_from_template` |
| `admin` | `https://mcp.eztexting.com/mcp/admin` | `account_details`, `buy_credits`, `stat_get`, `webhook_*`, `keyword_list` |

Tool names are exposed unprefixed; EZTexting's catalog has no cross-sub-server collisions.

## Local bridge — per sub-server (advanced)

Pass `--server <name>` to scope to one sub-server. Each invocation runs its own mcp-remote child. Remote clients should just point at the sub-server URL directly (e.g., `https://mcp.eztexting.com/mcp/messaging`) — no flag needed.

```json
{
  "mcpServers": {
    "eztexting-messaging": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "--server", "messaging"]
    },
    "eztexting-contacts": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "--server", "contacts"]
    }
  }
}
```

Valid names: `messaging`, `contacts`, `workflows`, `admin`.

## Build from source

```
git clone https://github.com/eztexting/mcp-server.git
cd mcp-server
npm install
npm run build
node dist/cli.js                        # unified /mcp endpoint
node dist/cli.js --server messaging     # single sub-server
```

## Files written

mcp-remote owns the auth cache: `~/.mcp-auth/mcp-remote-<version>/<serverUrlHash>/{tokens.json,client_info.json}`. One hash per distinct upstream URL.

## Requirements

- EZTexting account
- Browser available on first connect (OAuth 2.1 PKCE)
- Node.js 20+ — **only** if using the local stdio bridge (remote clients don't need it)
