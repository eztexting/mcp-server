# @eztexting/mcp-server

mcp-name: com.eztexting/mcp

Standalone MCP server bridge connecting local MCP clients (Claude Desktop, Claude Code, Cursor, VS Code, Cline, Windsurf, Zed) to the EZTexting MCP service at `https://mcp.eztexting.com`.

Aggregates EZTexting's four sub-servers (messaging, contacts, workflows, admin) over a single stdio MCP entry with one shared OAuth 2.1 PKCE session. On first run a browser opens **once**; tokens cache at `~/.mcp-auth/eztexting-mcp-server/` (mode 0600) and are reused across all four sub-servers and across runs.

## Sub-servers

| Sub-server | URL | Tools |
|-----------|-----|-------|
| `messaging` | `https://mcp.eztexting.com/mcp/messaging` | `message_send`, `message_list`, `message_get`, `message_template_*`, `conversation_*`, `message_report_*` |
| `contacts` | `https://mcp.eztexting.com/mcp/contacts` | `contact_*`, `contact_group_*`, `contact_field_*` |
| `workflows` | `https://mcp.eztexting.com/mcp/workflows` | `wf_fetch`, `wf_save`, `wf_status`, `wf_schema`, `wf_templates`, `wf_stat`, `wf_pub_available`, `wf_create_from_template` |
| `admin` | `https://mcp.eztexting.com/mcp/admin` | `account_details`, `buy_credits`, `msg_stat`, `ai_compose_stat`, `webhook_*`, `keyword_list` |

Tool names are exposed unprefixed; EZTexting's catalog has no cross-sub-server collisions.

## Install — single entry (recommended)

One MCP entry, all 48 tools, one OAuth dance.

`claude_desktop_config.json` (and equivalent in Claude Code, Cursor, VS Code, Cline, Windsurf):

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

**First run:** browser opens to `https://mcp.eztexting.com/oauth2/...`. Sign in. Browser redirects to `http://localhost:15823/oauth/callback` (deterministic port — same across runs so the registered redirect_uri stays valid). Tokens persist to `~/.mcp-auth/eztexting-mcp-server/{tokens.json,client_info.json}`. Subsequent launches skip the browser.

To force a fresh sign-in, delete that directory.

### Trim the tool catalog with `--servers`

All four sub-servers load by default (~48 tools, ~14k tokens of context). To load only the sub-servers you need, pass a comma-separated whitelist. Tools from other sub-servers are not exposed:

```json
{
  "mcpServers": {
    "eztexting": {
      "command": "npx",
      "args": ["-y", "@eztexting/mcp-server", "--servers", "messaging,contacts"]
    }
  }
}
```

Valid names: `messaging`, `contacts`, `workflows`, `admin`. The OAuth dance still covers the canonical resource, so adding more sub-servers later requires no re-auth.

## Install — per sub-server (advanced)

Use one MCP entry per sub-server when you want narrow tool catalogs or separate Claude Code identities per sub-server. Each invocation runs its own mcp-remote child and its own OAuth dance:

```json
{
  "mcpServers": {
    "eztexting-messaging": {
      "command": "npx",
      "args": ["-y", "-p", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "messaging"]
    },
    "eztexting-contacts": {
      "command": "npx",
      "args": ["-y", "-p", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "contacts"]
    },
    "eztexting-workflows": {
      "command": "npx",
      "args": ["-y", "-p", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "workflows"]
    },
    "eztexting-admin": {
      "command": "npx",
      "args": ["-y", "-p", "@eztexting/mcp-server", "eztexting-mcp-single", "--server", "admin"]
    }
  }
}
```

Omit any sub-server you don't need. `--server <name>` is required (no default).

## Native remote support

Clients that speak Streamable HTTP MCP natively can connect direct, no bridge needed:

```
https://mcp.eztexting.com/mcp/messaging
https://mcp.eztexting.com/mcp/contacts
https://mcp.eztexting.com/mcp/workflows
https://mcp.eztexting.com/mcp/admin
```

Use the bridge only for stdio-only clients.

## Files written

| Path | Purpose |
|------|---------|
| `~/.mcp-auth/eztexting-mcp-server/tokens.json` | Access + refresh tokens (mode 0600) |
| `~/.mcp-auth/eztexting-mcp-server/client_info.json` | Dynamic-client-registration result (mode 0600) |

The `eztexting-mcp-single` bin uses `mcp-remote`'s own cache at `~/.mcp-auth/mcp-remote-<version>/<hash>/` instead.

## Build from source

```
git clone https://gitlab.com/eztexting/code/mcp-ez.git
cd mcp-ez
npm install
npm run build

# aggregator (default bin) — single OAuth dance, all sub-servers
node dist/aggregator.js

# per-sub-server (advanced)
node dist/cli.js --server messaging
```

## Architecture

- `src/oauthProvider.ts` — `SharedOAuthProvider` implementing the SDK's `OAuthClientProvider` interface. Stable callback port derived from canonical resource (SHA-256 → 12000–19999), single localhost HTTP listener bound at `start()`, file-backed token + client_info storage, `open` package for browser launch.
- `src/aggregator.ts` — connects the messaging upstream first (catches `UnauthorizedError`, awaits callback, calls `transport.finishAuth(code)`). Once tokens are saved, the remaining three upstreams connect in parallel reusing the cache. Exposes one stdio `Server` upstream that fans `tools/list` across all four upstream `Client`s and routes `tools/call` to the owner captured at last list.
- `src/cli.ts` — single-sub-server bin. Spawns `mcp-remote` as a child against one of the four sub-server URLs.

## Requirements

- Node.js 20+
- EZTexting account
- Browser available on first run (for the OAuth dance)
