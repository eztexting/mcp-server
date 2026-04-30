# @eztexting/mcp-server

mcp-name: com.eztexting/mcp

A standalone MCP server bridge that connects local MCP clients (Claude Desktop, Cursor, VS Code, Cline, Windsurf, Zed) to the EZTexting MCP service deployed at `https://mcp.eztexting.com`.

This package is a thin wrapper around [`mcp-remote`](https://www.npmjs.com/package/mcp-remote): it presents an MCP server over stdio and proxies all traffic to the remote Streamable HTTP server. Authentication uses OAuth 2.1 with PKCE — on first run, your browser opens for sign-in and tokens are cached locally under `~/.mcp-auth/`.

## Sub-servers

EZTexting exposes four MCP sub-servers. Pick one per install entry:

| `--server` | URL | Tools |
|-----------|-----|-------|
| `messaging` (default) | `https://mcp.eztexting.com/mcp/messaging` | `message_send`, `message_list`, `message_get`, `message_template_*`, `conversation_*`, `message_report_*` |
| `contacts` | `https://mcp.eztexting.com/mcp/contacts` | `contact_*`, `contact_group_*`, `contact_field_*` |
| `workflows` | `https://mcp.eztexting.com/mcp/workflows` | `wf_fetch`, `wf_save`, `wf_status`, `wf_schema`, `wf_templates`, `wf_stat`, `wf_pub_available`, `wf_create_from_template` |
| `admin` | `https://mcp.eztexting.com/mcp/admin` | `account_details`, `buy_credits`, `msg_stat`, `ai_compose_stat`, `webhook_*`, `keyword_list` |

## Install — Claude Desktop (v0.1, current release)

v0.1 ships one MCP entry per sub-server. Add to `claude_desktop_config.json`, omitting any you don't need:

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
    },
    "eztexting-workflows": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "--server", "workflows"]
    },
    "eztexting-admin": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "--server", "admin"]
    }
  }
}
```

First launch of each entry opens a browser for OAuth sign-in (one dance per sub-server in v0.1).

## Install — Claude Desktop (v0.2, planned)

v0.2 will collapse all four sub-servers into a single MCP entry. Tool names are prefixed (`messaging_message_send`, `contacts_contact_upsert`, `workflows_wf_fetch`, `admin_account_details`, etc.) and one OAuth dance covers all sub-servers:

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

The single-entry shape will become the documented default once v0.2 is released; v0.1 multi-entry config will keep working via a `--server <name>` flag for power users who want one MCP per sub-domain.

## Install — VS Code / Cursor

Use the same `command` / `args` shape in your client's MCP config (`mcp.json` for VS Code, Cursor settings for Cursor). Both v0.1 (per-sub-server) and v0.2 (single-entry, when released) configurations work the same way in those clients.

## Native remote support

Clients that natively support Streamable HTTP MCP can connect directly without this bridge:

```
https://mcp.eztexting.com/mcp/messaging
```

(Same for `/contacts`, `/workflows`, `/admin`.) Use the bridge only for stdio-only clients.

## Build from source

```
npm install
npm run build
node dist/cli.js --server messaging
```

## Requirements

- Node.js 20 or newer
- An EZTexting account
