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
// Both public specs: v2 (readme-v2-bulldozer.yml) + v1 (readme-v1-bigmac.yml).
const SPECS = [];
for (const [file, ver] of [["out/openapi.json", "v2"], ["out/openapi-v1.json", "v1"]]) {
  try { SPECS.push({ doc: JSON.parse(readFileSync(ROOT + file)), ver }); } catch {}
}
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
for (const { doc, ver } of SPECS)
  for (const [p, item] of Object.entries(doc.paths || {}))
    for (const [m, op] of Object.entries(item))
      if (["get", "post", "put", "patch", "delete"].includes(m))
        specIndex.set(`${ver} ${m.toUpperCase()} ${blank(p)}`, { op, path: p, doc });

// Raw-proxy handlers whose body passes straight through to the upstream
// service (no local Go struct), but an equivalent spec operation documents
// the same upstream shape — borrow that schema.
const BORROW = {
  createV2ZonePurgeHandler: "v2 POST /sites/{}/purges", // same upstream purge service as sites
};

// --- $ref inlining: copy referenced component schemas into $defs ------------
// `doc` is the spec document the schema came from ($refs resolve within it).
function collectRefs(schema, defs, doc) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => collectRefs(s, defs, doc));
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "$ref" && typeof v === "string" && v.startsWith("#/components/schemas/")) {
      const name = v.split("/").pop();
      out.$ref = `#/$defs/${name}`;
      if (!defs[name]) {
        defs[name] = {};                                   // reserve (cycle guard)
        defs[name] = collectRefs(doc.components.schemas[name], defs, doc);
      }
    } else out[k] = collectRefs(v, defs, doc);
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

  let hit = specIndex.get(`${r.api_version} ${r.method} ${blank(r.path)}`);
  let schemaSource = "inferred";
  if (!hit && BORROW[r.handler]) {
    hit = specIndex.get(BORROW[r.handler]);
    if (hit) schemaSource = "openapi-borrowed";
  }
  let description;

  if (hit) {
    if (schemaSource === "inferred") schemaSource = "openapi";
    description = hit.op.summary || hit.op.description || "";
    // query params from spec
    for (const prm of hit.op.parameters || []) {
      if (prm.in === "query") {
        properties[prm.name] = collectRefs(prm.schema || { type: "string" }, defs, hit.doc);
        if (prm.description) properties[prm.name].description = prm.description;
        if (prm.required) required.push(prm.name);
      }
    }
    // request body -> `body` object
    const body = hit.op.requestBody?.content?.["application/json"]?.schema;
    if (body) {
      properties.body = collectRefs(body, defs, hit.doc);
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

  const bucket = schemaSource.startsWith("openapi") ? "enriched" : schemaSource === "go-struct" ? "gostruct" : "inferred";
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
