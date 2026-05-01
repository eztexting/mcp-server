#!/usr/bin/env bash
# Measure tools/list payload size for each EZTexting MCP sub-server.
# Token estimate: bytes / 4 (Anthropic tokenizer rule of thumb).
set -euo pipefail

HOST="${MCP_HOST:-https://mcp.eztexting.com}"
TOKENS_FILE="$HOME/.mcp-auth/eztexting-mcp-server/tokens.json"
SUB_SERVERS=(messaging contacts workflows admin)

if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "no tokens at $TOKENS_FILE — run aggregator once to authorize:" >&2
  echo "  node $(dirname "$0")/dist/aggregator.js" >&2
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

probe() {
  local sub="$1"
  curl -sS -X POST "$HOST/mcp/$sub" \
    -H "Authorization: Bearer $TOK" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json,text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
}

probe_status() {
  local sub="$1"
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$HOST/mcp/$sub" \
    -H "Authorization: Bearer $TOK" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json,text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
}

probe_status_first=$(probe_status "${SUB_SERVERS[0]}")
if [[ "$probe_status_first" == "401" ]]; then
  echo "token expired (401). Re-run aggregator to refresh:" >&2
  echo "  rm -f $TOKENS_FILE" >&2
  echo "  node $(dirname "$0")/dist/aggregator.js" >&2
  exit 1
fi

printf '%-12s %-10s %-8s %s\n' "sub-server" "bytes" "tools" "~tokens"
printf '%-12s %-10s %-8s %s\n' "----------" "-----" "-----" "-------"

total_bytes=0
total_tools=0
for sub in "${SUB_SERVERS[@]}"; do
  body=$(probe "$sub")
  bytes=$(printf '%s' "$body" | wc -c | tr -d ' ')
  tools=$(printf '%s' "$body" | jq -r '.result.tools | length // 0' 2>/dev/null || echo 0)
  printf '%-12s %-10s %-8s ~%s\n' "$sub" "$bytes" "$tools" "$((bytes / 4))"
  total_bytes=$((total_bytes + bytes))
  total_tools=$((total_tools + tools))
done

printf '%-12s %-10s %-8s %s\n' "----------" "-----" "-----" "-------"
printf '%-12s %-10s %-8s ~%s\n' "TOTAL" "$total_bytes" "$total_tools" "$((total_bytes / 4))"
