#!/usr/bin/env node
// Spec-driven MCP tool generator (PoC).
//
// Coverage source of truth  : out/routes.json  (parsed from micro-open-api Go route table)
// Schema-detail enrichment   : out/openapi.json (readme-v2-bulldozer.yml, the documented subset)
//
// For each route we emit one MCP tool. If the OpenAPI spec documents that
// (method, path) we attach its real request/response schema; otherwise we emit
// an inferred schema (path params + generic body) and flag it so the gap is visible.
//
// Usage: node gen/generate.mjs zones sites   (domains = top-level path segments)

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const routes = JSON.parse(readFileSync(ROOT + "out/routes.json"));
const spec = JSON.parse(readFileSync(ROOT + "out/openapi.json"));
// Go-struct fallback schemas (gen/struct_schema.py) — closes the OpenAPI gap.
let structSchemas = {};
try { structSchemas = JSON.parse(readFileSync(ROOT + "out/struct-schemas.json")); } catch {}
// default: ALL domains ("--all"); pass segment names to restrict.
const argDomains = process.argv.slice(2).filter((a) => a !== "--all");
const ALL = [...new Set(routes.map((r) => r.path.replace(/^\//, "").split("/")[0]))];
const domains = argDomains.length ? argDomains : ALL;

// --- spec index: key = "METHOD <path with param names blanked>" -------------
const blank = (p) =>
  p.replace(/^\/api\/v[12]/, "")          // spec paths carry an /api/v2 prefix
   .replace(/\{[^}]+\}/g, "{}")           // {site_id} -> {}
   .replace(/:[^/]+/g, "{}")              // :domain   -> {}  (Go style)
   .replace(/\/+$/, "");                  // ignore trailing slash
const specIndex = new Map();
for (const [p, item] of Object.entries(spec.paths || {}))
  for (const [m, op] of Object.entries(item))
    if (["get", "post", "put", "patch", "delete"].includes(m))
      specIndex.set(`${m.toUpperCase()} ${blank(p)}`, { op, path: p });

// --- $ref inlining: copy referenced component schemas into $defs ------------
function collectRefs(schema, defs) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => collectRefs(s, defs));
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "$ref" && typeof v === "string" && v.startsWith("#/components/schemas/")) {
      const name = v.split("/").pop();
      out.$ref = `#/$defs/${name}`;
      if (!defs[name]) {
        defs[name] = {};                                   // reserve (cycle guard)
        defs[name] = collectRefs(spec.components.schemas[name], defs);
      }
    } else out[k] = collectRefs(v, defs);
  }
  return out;
}

// --- name + scope helpers ---------------------------------------------------
const toolName = (h) =>
  h.replace(/Handler$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
const pathParams = (p) => [...p.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);

// --- generate ----------------------------------------------------------------
const tools = [];
const report = { enriched: 0, inferred: 0, byDomain: {} };

for (const r of routes) {
  const domain = r.path.replace(/^\//, "").split("/")[0];
  if (!domains.includes(domain)) continue;

  const defs = {};
  const properties = {};
  const required = [];

  // path params -> required string args
  for (const pp of pathParams(r.path)) {
    properties[pp] = { type: "string", description: `Path parameter \`${pp}\`` };
    required.push(pp);
  }

  const hit = specIndex.get(`${r.method} ${blank(r.path)}`);
  let schemaSource = "inferred";
  let description;

  if (hit) {
    schemaSource = "openapi";
    description = hit.op.summary || hit.op.description || "";
    // query params from spec
    for (const prm of hit.op.parameters || []) {
      if (prm.in === "query") {
        properties[prm.name] = collectRefs(prm.schema || { type: "string" }, defs);
        if (prm.description) properties[prm.name].description = prm.description;
        if (prm.required) required.push(prm.name);
      }
    }
    // request body -> `body` object
    const body = hit.op.requestBody?.content?.["application/json"]?.schema;
    if (body) {
      properties.body = collectRefs(body, defs);
      if (r.write) required.push("body");
    }
  } else if (structSchemas[r.handler]) {
    schemaSource = "go-struct";
    properties.body = structSchemas[r.handler].schema;
    properties.body.description = `Request body (derived from Go struct ${structSchemas[r.handler].structName})`;
    if (r.write) required.push("body");
  } else if (r.write) {
    properties.body = { type: "object", description: "Request body (schema not yet in OpenAPI spec — backfill needed)", additionalProperties: true };
    required.push("body");
  }
  description = description || `${r.method} ${r.path} (handler: ${r.handler})`;

  const inputSchema = { type: "object", properties, required: [...new Set(required)] };
  if (Object.keys(defs).length) inputSchema.$defs = defs;

  tools.push({
    name: toolName(r.handler),
    description,
    inputSchema,
    // server-side execution metadata (not sent to the model)
    _meta: {
      method: r.method,
      pathTemplate: r.path,
      apiVersion: r.api_version,
      aclScopes: r.scopes,
      readOnly: !r.write,
      schemaSource,
    },
  });

  const bucket = schemaSource === "openapi" ? "enriched" : schemaSource === "go-struct" ? "gostruct" : "inferred";
  report[bucket] = (report[bucket] || 0) + 1;
  report.byDomain[domain] = report.byDomain[domain] || { enriched: 0, gostruct: 0, inferred: 0 };
  report.byDomain[domain][bucket]++;
}

writeFileSync(ROOT + "out/tools.generated.json", JSON.stringify(tools, null, 2));
console.log(`generated ${tools.length} MCP tools for [${domains.join(", ")}] -> out/tools.generated.json`);
console.log(`  schema from OpenAPI       : ${report.enriched || 0}`);
console.log(`  schema from Go structs    : ${report.gostruct || 0}`);
console.log(`  still inferred (real gap) : ${report.inferred || 0}`);
console.log("  by domain:", JSON.stringify(report.byDomain));
