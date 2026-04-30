# @eztexting/mcp-server

mcp-name: com.eztexting/mcp

Standalone MCP server bridge connecting local MCP clients (Claude Desktop, Claude Code, Cursor, VS Code, Cline, Windsurf, Zed) to the EZTexting MCP service at `https://mcp.eztexting.com`.

Wraps [`mcp-remote`](https://www.npmjs.com/package/mcp-remote): presents stdio MCP locally, proxies to remote Streamable HTTP. OAuth 2.1 with PKCE — browser opens on first run, tokens cached at `~/.mcp-auth/`.

## Sub-servers

EZTexting exposes four MCP sub-servers:

| Sub-server | URL | Tools |
|-----------|-----|-------|
| `messaging` | `https://mcp.eztexting.com/mcp/messaging` | `message_send`, `message_list`, `message_get`, `message_template_*`, `conversation_*`, `message_report_*` |
| `contacts` | `https://mcp.eztexting.com/mcp/contacts` | `contact_*`, `contact_group_*`, `contact_field_*` |
| `workflows` | `https://mcp.eztexting.com/mcp/workflows` | `wf_fetch`, `wf_save`, `wf_status`, `wf_schema`, `wf_templates`, `wf_stat`, `wf_pub_available`, `wf_create_from_template` |
| `admin` | `https://mcp.eztexting.com/mcp/admin` | `account_details`, `buy_credits`, `msg_stat`, `ai_compose_stat`, `webhook_*`, `keyword_list` |

## Install — single entry (recommended)

One MCP entry covers all four sub-servers. Tool names are prefixed: `messaging_message_send`, `contacts_contact_upsert`, `workflows_wf_fetch`, `admin_account_details`, …

`claude_desktop_config.json` (and equivalent in Cursor / VS Code / Cline / Windsurf):

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

**First run:** four browser tabs open for OAuth sign-in, one per sub-server. Authorize each. Tokens cache at `~/.mcp-auth/mcp-remote-<version>/<hash>/`. Subsequent runs reuse the cache.

(v0.2 limitation: 4 separate dances on first run. Single-dance OAuth across all sub-servers is planned for v0.3.)

## Install — per sub-server (advanced)

Use one MCP entry per sub-server. Unprefixed tool names. Useful for keeping the tool catalog narrow:

```json
{
  "mcpServers": {
    "eztexting-messaging": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "messaging"]
    },
    "eztexting-contacts": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "contacts"]
    },
    "eztexting-workflows": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "workflows"]
    },
    "eztexting-admin": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "admin"]
    }
  }
}
```

Omit any sub-server you don't need.

## Native remote support

Clients that speak Streamable HTTP MCP natively can connect direct, no bridge needed:

```
https://mcp.eztexting.com/mcp/messaging
https://mcp.eztexting.com/mcp/contacts
https://mcp.eztexting.com/mcp/workflows
https://mcp.eztexting.com/mcp/admin
```

Use the bridge only for stdio-only clients.

## Build from source

```
git clone https://gitlab.com/eztexting/code/mcp-ez.git
cd mcp-ez
npm install
npm run build

# aggregator (default bin)
node dist/aggregator.js

# per-sub-server
node dist/cli.js --server messaging
```

## Requirements

- Node.js 20+
- EZTexting account
