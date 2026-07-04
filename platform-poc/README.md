# Platform MCP Server — PoC (Phase 0 + Phase 1)

Proof-of-concept for the next-generation platform MCP server: auto-generates
MCP tools for the full micro-open-api v1/v2 surface (82 routes) and dispatches
them through a central per-tenant-apikey client.

- `gen/route_extract.py` — parses the Go route table (coverage source of truth,
  82 routes + per-route ACL scopes)
- `gen/struct_schema.py` — Go-struct -> JSON Schema extractor (91 structs,
  30/30 BindJSON handlers; lifts schema coverage to ~98%)
- `gen/generate.mjs` — merges routes + OpenAPI spec + struct schemas into MCP
  tool definitions
- `src/apiClient.mjs` — central client (per-tenant `apikey`, retries, backoff,
  ACL-aware auth errors)
- `src/server.mjs` — MCP server; one generic dispatch handler for all tools
- `src/selftest.mjs` — in-memory MCP Client<->Server end-to-end proof

Run:

    npm install
    python3 gen/route_extract.py && python3 gen/struct_schema.py
    node gen/generate.mjs --all
    npm run selftest

See BUILD_PLAN.md for the five-phase plan and findings.
