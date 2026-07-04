#!/usr/bin/env python3
"""Extract the micro-open-api route table (source of truth for endpoint coverage).

Parses the appRouter struct literals in api/server_handler.go:
    {http.MethodGet, "/zones/:domain/", []string{_CodeExploreSiteAPI}, listZonesHandler}
Emits out/routes.json: [{api_version, method, path, scopes[], handler, write}]
"""
import json, re, sys, pathlib

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/micro-open-api/api/server_handler.go"
text = pathlib.Path(SRC).read_text()

# Split into v1 / v2 blocks so we can tag api_version.
def block(name):
    m = re.search(name + r"\(\)\s*\(routes \[\]appRouter\)\s*\{(.*?)\n\}", text, re.S)
    return m.group(1) if m else ""

ROW = re.compile(
    r'\{\s*http\.Method(\w+),\s*"([^"]+)",\s*\[\]string\{([^}]*)\},\s*(\w+)\s*\}'
)
# write verbs + scope codes that imply mutation
WRITE_METHODS = {"Post", "Put", "Patch", "Delete"}

def parse(block_text, version):
    out = []
    for line in block_text.splitlines():
        s = line.strip()
        if s.startswith("//"):            # commented-out route
            continue
        m = ROW.search(s)
        if not m:
            continue
        method, path, codes, handler = m.groups()
        scopes = [c.strip() for c in codes.split(",") if c.strip()]
        out.append({
            "api_version": version,
            "method": method.upper(),
            "path": path,
            "scopes": scopes,
            "handler": handler,
            "write": method in WRITE_METHODS,
        })
    return out

routes = parse(block("getV1Routers"), "v1") + parse(block("getV2Routers"), "v2")
pathlib.Path("/home/user/mcp-platform-poc/out/routes.json").write_text(
    json.dumps(routes, indent=2)
)
res = {}
for r in routes:
    top = r["path"].lstrip("/").split("/")[0] or "_root"
    res[top] = res.get(top, 0) + 1
print(f"extracted {len(routes)} routes -> out/routes.json")
print("by resource:", dict(sorted(res.items(), key=lambda x: -x[1])))
