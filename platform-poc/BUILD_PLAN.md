# Platform MCP Server — Build Plan (grounded by PoC)

Goal: one MCP server exposing **all mlytics platform capabilities** via the public
v2 edge, so agents can drive the multi-CDN platform. This plan is validated by a
working proof-of-concept in this directory.

## What the PoC proved (end-to-end, no key needed)

```
micro-open-api Go route table ──parse──▶ out/routes.json (82 endpoints + ACL scopes)
readme-v2-bulldozer.yml        ──parse──▶ out/openapi.json (17 documented ops)
                generate.mjs (merge) ──▶ out/tools.generated.json (MCP tools)
                src/server.mjs ──register──▶ real @modelcontextprotocol/sdk
                src/selftest.mjs ──▶ tools/list = 33, dry-run call builds correct request
```

Run it: `npm install && npm run gen && npm run selftest`

## Findings that shape the plan

1. **The coverage source of truth is the Go route table, NOT the OpenAPI spec.**
   `api/server_handler.go` declares routes as structured literals
   `{method, path, []scopeCodes, handler}` — 82 active endpoints across 9 resources
   (zones 27, accounts 19, wafs 12, decisive 9, sites 6, stream-controller 5, sslcerts,
   powerup). It is trivially parseable and carries the **ACL scope per endpoint**.

2. **The existing OpenAPI spec only covers ~18%.** For the zones+sites slice, 6 of 33
   tools got rich schemas; **27 need schema backfill**. The spec documents
   Sites/Caches/Purges/DNS/SSL only — zones, accounts, wafs, decisive, stream-controller
   are undocumented.

3. **Request/response schemas already exist as Go structs** (`zone_v2_struct.go`,
   `addon_struct.go`, per-handler request types). The backfill does not require
   hand-writing Swagger — it can be derived from code.

4. **Auth is per-tenant `apikey` (Kong key-auth) + `organizationId` scoping.** Not a
   single service key (SERVICE ACL group can't reach OWNER/CLIENT capabilities), not
   interactive login (captcha). Per-tenant keys already exist in `mirco-account`.

## Phases

### Phase 0 — PoC (DONE, this dir)
Route extractor + spec-merge generator + central `MlyticsApiClient` + SDK wiring +
in-memory self-test. One generic dispatch handler drives all tools (the pattern that
scales past bulldozer's 17 hand-written tools).

### Phase 1 — Close the schema gap (DONE — option B shipped)
`gen/struct_schema.py` parses all Go structs in `api/` + `model/` (91 structs,
incl. function-local `type requestBody struct` decls and `model.*` qualified
types), maps all 30 BindJSON handlers to their request structs (30/30), and
emits JSON Schemas consumed by the generator.

**Result on the full 82-route surface:**
- 44 tools with real schemas (19 OpenAPI incl. the v1 spec + 1 borrowed
  purge schema, 25 Go-struct)
- 26 GET tools complete without a body (path/query params are the schema)
- 12 remaining "gap" routes are ALL body-less DELETE/action-POSTs (logout,
  deactivate/reactivate, api-key rotate) — complete as-is.
- **Effective coverage: 82/82. Every write route with a real body now has a
  real schema.** (v1 routes matched against readme-v1-bigmac.yml; the v2
  zone-purge raw-proxy borrows the spec's sites-purge schema via BORROW map.)

Durable end state remains option A (`swag` annotations in micro-open-api) so the
spec becomes a maintained build artifact; the extractor is the bridge until then.

### Phase 2 — Productionize the server
- Central client: DONE (auth, retries, backoff, 401/403 scope-aware errors). Add
  config/env for SIT/UAT/prod base URLs, structured logging + OpenTelemetry.
- Per-tenant credential resolution (apikey + orgId) per request/session.
- Error mapping (upstream status → MCP isError), input validation, test suite.
- Lift bulldozer's working JWT/apikey logic; retire its hardcoded URLs + mock sprawl.

### Phase 3 — Curated workflow tools
A thin hand-written layer on top of generated primitives for common agent tasks:
`provision-site-across-cdns`, `purge-and-verify`, `bundle-edge-report`. Generated tools
give coverage; curated tools give agent UX.

### Phase 4 — Transport + hosting
Add `streamable-http` alongside stdio. Hosted multi-tenant: inject each tenant's
credential per request, secrets in a manager (not env/files). Optional: front multiple
MCP servers with a gateway (e.g. MCPJungle) for central ACL/observability — only if you
end up running several servers.

### Phase 5 — Rollout
Scope per-tenant keys to required ACL groups; use the captured `aclScopes` per tool for
read/write hints + pre-flight permission checks + tool-group filtering. Replace bulldozer.

## Tool-design notes (from the PoC metadata)
Each tool carries `_meta`: `method`, `pathTemplate`, `apiVersion`, `aclScopes`,
`readOnly`, `schemaSource`. That drives: read/write hinting, ACL pre-checks, and a
visible inventory of which tools still need schema backfill (`schemaSource: inferred`).

## Files
```
gen/route_extract.py     Go route-table -> out/routes.json (coverage source)
gen/generate.mjs         merge routes + OpenAPI -> out/tools.generated.json
src/apiClient.mjs        central per-tenant apikey client (auth/retry/scope errors)
src/server.mjs           MCP server: generated tools + one generic dispatch handler
src/selftest.mjs         in-memory Client<->Server proof (tools/list + dry-run call)
out/                     generated artifacts
```
