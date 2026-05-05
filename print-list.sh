#!/usr/bin/env bash
# Print tools/list JSON for the unified /mcp endpoint, pretty-printed.
set -euo pipefail

HOST="${MCP_HOST:-https://mcp.eztexting.com}"
ENDPOINT="${MCP_ENDPOINT:-/mcp}"

if [[ -z "${TOKENS_FILE:-}" ]]; then
  TOKENS_FILE=$(ls -t "$HOME/.mcp-auth"/mcp-remote-*/*_tokens.json 2>/dev/null | head -1 || true)
fi

if [[ -z "${TOKENS_FILE:-}" || ! -f "$TOKENS_FILE" ]]; then
  echo "no token cache found — run the bridge once to authorize:" >&2
  echo "  node $(dirname "$0")/dist/cli.js" >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }

TOK=$(jq -r .access_token "$TOKENS_FILE")
[[ -n "$TOK" && "$TOK" != "null" ]] || { echo "no access_token in $TOKENS_FILE" >&2; exit 1; }

response=$(curl -sS -X POST "$HOST$ENDPOINT" \
  -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json,text/event-stream' \
  -w '\n%{http_code}' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

status=${response##*$'\n'}
body=${response%$'\n'*}

if [[ "$status" == "401" ]]; then
  echo "token expired (401). Re-run the bridge to refresh:" >&2
  echo "  rm -f \"$TOKENS_FILE\"" >&2
  echo "  node $(dirname "$0")/dist/cli.js" >&2
  exit 1
fi

if [[ "$status" != "200" ]]; then
  echo "HTTP $status" >&2
  echo "$body" >&2
  exit 1
fi

# Strip SSE framing if present (server may return event-stream).
echo "$body" | sed -n -E '/^data: /{s/^data: //;p;q;};/^\{/{p;q;}' | jq .
