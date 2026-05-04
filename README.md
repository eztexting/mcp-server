# @eztexting/mcp-server

mcp-name: com.eztexting/mcp

Standalone MCP server bridge connecting local MCP clients (Claude Desktop, Claude Code, Cursor, VS Code, Cline, Windsurf, Zed) to the EZTexting MCP service at `https://mcp.eztexting.com`.

Thin wrapper around [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) targeting the unified `/mcp` endpoint. One stdio MCP entry, all 42 tools, one OAuth 2.1 PKCE dance. ~6k tokens of catalog (measured).

## Install — single entry (recommended)

Add to `claude_desktop_config.json` (or equivalent in Claude Code, Cursor, VS Code, Cline, Windsurf):

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
| `workflows` | `https://mcp.eztexting.com/mcp/workflows` | `wf_fetch`, `wf_save`, `wf_status`, `wf_schema`, `wf_templates`, `wf_stat`, `wf_pub_available`, `wf_create_from_template` |
| `admin` | `https://mcp.eztexting.com/mcp/admin` | `account_details`, `buy_credits`, `msg_stat`, `ai_compose_stat`, `webhook_*`, `keyword_list` |

Tool names are exposed unprefixed; EZTexting's catalog has no cross-sub-server collisions.

## Install — per sub-server (advanced)

Pass `--server <name>` to scope to one sub-server. Each invocation runs its own mcp-remote child:

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

## Native remote support

Clients that speak Streamable HTTP MCP natively can connect direct, no bridge needed:

```
https://mcp.eztexting.com/mcp                    # unified, all tools
https://mcp.eztexting.com/mcp/messaging
https://mcp.eztexting.com/mcp/contacts
https://mcp.eztexting.com/mcp/workflows
https://mcp.eztexting.com/mcp/admin
```

Use the bridge only for stdio-only clients.

## Build from source

```
git clone https://gitlab.com/eztexting/mcp-server.git
cd mcp-server
npm install
npm run build
node dist/cli.js                        # unified /mcp endpoint
node dist/cli.js --server messaging     # single sub-server
```

## Files written

mcp-remote owns the auth cache: `~/.mcp-auth/mcp-remote-<version>/<serverUrlHash>/{tokens.json,client_info.json}`. One hash per distinct upstream URL.

## Requirements

- Node.js 20+
- EZTexting account
- Browser available on first run (for the OAuth dance)
