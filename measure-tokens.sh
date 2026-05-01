#!/usr/bin/env bash
# Measure tools/list payload size for the unified /mcp endpoint and each
# sub-server. Token estimate: bytes / 4 (Anthropic tokenizer rule of thumb).
set -euo pipefail

HOST="${MCP_HOST:-https://mcp.eztexting.com}"
ENDPOINTS=("/mcp" "/mcp/messaging" "/mcp/contacts" "/mcp/workflows" "/mcp/admin")

# Locate the freshest mcp-remote token cache:
# ~/.mcp-auth/mcp-remote-<version>/<hash>_tokens.json
if [[ -z "${TOKENS_FILE:-}" ]]; then
  TOKENS_FILE=$(ls -t "$HOME/.mcp-auth"/mcp-remote-*/*_tokens.json 2>/dev/null | head -1 || true)
fi

if [[ -z "${TOKENS_FILE:-}" || ! -f "$TOKENS_FILE" ]]; then
  echo "no token cache found — run the bridge once to authorize:" >&2
  echo "  node $(dirname "$0")/dist/cli.js" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq required" >&2
  exit 1
fi

TOK=$(jq -r .access_token "$TOKENS_FILE")
if [[ -z "$TOK" || "$TOK" == "null" ]]; then
  echo "no access_token in $TOKENS_FILE" >&2
  exit 1
fi

probe_body() {
  curl -sS -X POST "$HOST$1" \
    -H "Authorization: Bearer $TOK" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json,text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
}

probe_status() {
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$HOST$1" \
    -H "Authorization: Bearer $TOK" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json,text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
}

first_status=$(probe_status "${ENDPOINTS[1]}")
if [[ "$first_status" == "401" ]]; then
  echo "token expired (401) at $TOKENS_FILE. Re-run the bridge to refresh:" >&2
  echo "  rm -f \"$TOKENS_FILE\"" >&2
  echo "  node $(dirname "$0")/dist/cli.js" >&2
  exit 1
fi

echo "using token cache: $TOKENS_FILE"
echo

printf '%-18s %-10s %-8s %s\n' "endpoint" "bytes" "tools" "~tokens"
printf '%-18s %-10s %-8s %s\n' "------------------" "-----" "-----" "-------"

for ep in "${ENDPOINTS[@]}"; do
  status=$(probe_status "$ep")
  if [[ "$status" != "200" ]]; then
    printf '%-18s %-10s %-8s %s\n' "$ep" "—" "—" "HTTP $status"
    continue
  fi
  body=$(probe_body "$ep")
  bytes=$(printf '%s' "$body" | wc -c | tr -d ' ')
  tools=$(printf '%s' "$body" | jq -r '.result.tools | length // 0' 2>/dev/null || echo 0)
  printf '%-18s %-10s %-8s ~%s\n' "$ep" "$bytes" "$tools" "$((bytes / 4))"
done
