#!/usr/bin/env python3
"""Go-struct -> JSON Schema extractor (Phase 1 of the platform MCP build plan).

Closes the OpenAPI coverage gap: for the ~82% of routes the readme spec doesn't
document, the request-body schemas already exist as Go structs in
micro-open-api/api/*.go. This tool:

  1. parses every `type X struct {...}` in api/ (brace-matched, nested anon
     structs supported) into a registry
  2. maps each handler -> its request struct via the `var body X` +
     `ctx.ShouldBindJSON(&body)` idiom
  3. converts Go types -> JSON Schema (pointers/omitempty => optional)
  4. emits out/struct-schemas.json: { handlerName: {schema, structName} }

generate.mjs then uses these as body schemas for routes the OpenAPI spec
misses, tagging them schemaSource="go-struct".
"""
from __future__ import annotations
import json, re, sys, pathlib
from collections import OrderedDict

API_DIR = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/home/user/micro-open-api/api")
OUT = pathlib.Path(__file__).resolve().parent.parent / "out" / "struct-schemas.json"

# ---------------------------------------------------------------- struct parse
FIELD_RE = re.compile(
    r'^\s*(?P<name>[A-Z]\w*)\s+(?P<type>\*?[\w\.\[\]\*]+)\s*(?:`(?P<tag>[^`]*)`)?\s*(?://.*)?$'
)
ANON_OPEN_RE = re.compile(r'^\s*(?P<name>[A-Z]\w*)\s+(?P<slice>\[\])?\s*struct\s*\{\s*$')
TYPE_OPEN_RE = re.compile(r'^type\s+(?P<name>\w+)\s+struct\s*\{')
JSON_TAG_RE = re.compile(r'json:"([^"]*)"')


def parse_fields(lines, i, end_depth=0):
    """Parse struct body lines starting at index i (inside the braces).
    Returns (fields, next_index). Each field: dict(name, go_type, json, omitempty, anon)."""
    fields = []
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("}"):
            # tag may live on the closing line of an anon struct: `} json:"port"`
            return fields, i
        if not stripped or stripped.startswith("//"):
            i += 1
            continue
        m_anon = ANON_OPEN_RE.match(line)
        if m_anon:
            inner, j = parse_fields(lines, i + 1)
            close_line = lines[j]
            tag = JSON_TAG_RE.search(close_line)
            jname, omit = _tag_parts(tag.group(1) if tag else None, m_anon.group("name"))
            if jname is not None:
                fields.append(dict(name=m_anon.group("name"), go_type="struct",
                                   json=jname, omitempty=omit,
                                   anon=inner, is_slice=bool(m_anon.group("slice"))))
            i = j + 1
            continue
        m = FIELD_RE.match(line)
        if m and m.group("tag") is not None or (m and "json:" not in (m.group("tag") or "")):
            pass
        if m:
            tag = JSON_TAG_RE.search(m.group("tag") or "")
            jname, omit = _tag_parts(tag.group(1) if tag else None, m.group("name"))
            if jname is not None:
                fields.append(dict(name=m.group("name"), go_type=m.group("type"),
                                   json=jname, omitempty=omit, anon=None, is_slice=False))
        i += 1
    return fields, i


def _tag_parts(tag_value, field_name):
    """json tag -> (json_name | None if skipped, omitempty)."""
    if tag_value is None:
        return field_name[0].lower() + field_name[1:], False  # untagged exported field
    parts = tag_value.split(",")
    if parts[0] == "-":
        return None, False
    name = parts[0] or field_name[0].lower() + field_name[1:]
    return name, "omitempty" in parts[1:]


def parse_structs(text):
    """All top-level `type X struct` blocks in one file -> {name: fields}."""
    lines = text.splitlines()
    registry = {}
    i = 0
    while i < len(lines):
        m = TYPE_OPEN_RE.match(lines[i])
        if m:
            fields, j = parse_fields(lines, i + 1)
            registry[m.group("name")] = fields
            i = j + 1
        else:
            i += 1
    return registry


# ------------------------------------------------------------- type -> schema
PRIMITIVES = {
    "string": {"type": "string"},
    "bool": {"type": "boolean"},
    "int": {"type": "integer"}, "int8": {"type": "integer"}, "int16": {"type": "integer"},
    "int32": {"type": "integer"}, "int64": {"type": "integer"},
    "uint": {"type": "integer"}, "uint8": {"type": "integer"}, "uint16": {"type": "integer"},
    "uint32": {"type": "integer"}, "uint64": {"type": "integer"},
    "float32": {"type": "number"}, "float64": {"type": "number"},
    "json.RawMessage": {},          # any JSON
    "interface{}": {},
    "any": {},
    "time.Time": {"type": "string", "format": "date-time"},
}


def go_type_to_schema(go_type, registry, seen):
    t = go_type
    if t.startswith("*"):
        return go_type_to_schema(t[1:], registry, seen)
    if t.startswith("[]"):
        return {"type": "array", "items": go_type_to_schema(t[2:], registry, seen)}
    if t.startswith("map["):
        m = re.match(r'map\[[^\]]+\](.+)', t)
        val = go_type_to_schema(m.group(1), registry, seen) if m else {}
        return {"type": "object", "additionalProperties": val}
    if t in PRIMITIVES:
        return dict(PRIMITIVES[t])
    if t in registry:
        if t in seen:                      # cycle guard
            return {"type": "object"}
        return fields_to_schema(registry[t], registry, seen | {t})
    return {}                              # unknown named type -> any


def fields_to_schema(fields, registry, seen=frozenset()):
    props, required = OrderedDict(), []
    for f in fields:
        if f["anon"] is not None:
            inner = fields_to_schema(f["anon"], registry, seen)
            schema = {"type": "array", "items": inner} if f["is_slice"] else inner
        else:
            schema = go_type_to_schema(f["go_type"], registry, seen)
        props[f["json"]] = schema
        optional = f["omitempty"] or f["go_type"].startswith("*")
        if not optional:
            required.append(f["json"])
    out = {"type": "object", "properties": props}
    if required:
        out["required"] = required
    return out


# ---------------------------------------------------------- handler -> struct
FUNC_RE = re.compile(r'^func\s+(\w+)\s*\(')
VAR_RE = re.compile(r'^\s*var\s+(\w+)\s+([\w\.\[\]\*]+)\s*$')
BIND_RE = re.compile(r'ShouldBindJSON\(&(\w+)\)|BindJSON\(&(\w+)\)')


LOCAL_TYPE_RE = re.compile(r'^\s*type\s+(\w+)\s+struct\s*\{')


def handler_structs(text):
    """Map handlerName -> (struct type, local type registry).

    Handles both top-level structs and function-local declarations
    (`type requestBody struct {...}` inside the handler body).
    """
    lines = text.splitlines()
    result = {}
    current, decls, local_reg = None, {}, {}
    i = 0
    while i < len(lines):
        line = lines[i]
        fm = FUNC_RE.match(line)
        if fm:
            current, decls, local_reg = fm.group(1), {}, {}
            i += 1
            continue
        if current is None:
            i += 1
            continue
        lm = LOCAL_TYPE_RE.match(line)
        if lm:
            fields, j = parse_fields(lines, i + 1)
            local_reg[lm.group(1)] = fields
            i = j + 1
            continue
        vm = VAR_RE.match(line)
        if vm:
            decls[vm.group(1)] = vm.group(2)
        bm = BIND_RE.search(line)
        if bm:
            var = bm.group(1) or bm.group(2)
            if var in decls and current not in result:
                result[current] = (decls[var], dict(local_reg))
        i += 1
    return result


# ------------------------------------------------------------------- pipeline
def main():
    registry, handler_map = {}, {}
    for f in sorted(API_DIR.glob("*.go")):
        if f.name.endswith("_test.go"):
            continue
        text = f.read_text()
        registry.update(parse_structs(text))
        handler_map.update(handler_structs(text))
    # sibling model/ package: register as both "model.X" (qualified use in api/)
    model_dir = API_DIR.parent / "model"
    if model_dir.is_dir():
        for f in sorted(model_dir.glob("*.go")):
            if f.name.endswith("_test.go"):
                continue
            for name, fields in parse_structs(f.read_text()).items():
                registry[f"model.{name}"] = fields
                registry.setdefault(name, fields)

    out = {}
    unresolved = []
    for handler, (struct_name, local_reg) in sorted(handler_map.items()):
        reg = {**registry, **local_reg}          # local types shadow globals
        base = struct_name.lstrip("*")
        if base.startswith("[]"):
            inner = base[2:]
            if inner in reg:
                out[handler] = {
                    "structName": struct_name,
                    "schema": {"type": "array",
                               "items": fields_to_schema(reg[inner], reg)},
                }
                continue
        if base in reg:
            out[handler] = {"structName": struct_name,
                            "schema": fields_to_schema(reg[base], reg)}
        else:
            unresolved.append((handler, struct_name))

    OUT.write_text(json.dumps(out, indent=2))
    print(f"structs parsed: {len(registry)}")
    print(f"handlers with BindJSON: {len(handler_map)}")
    print(f"schemas emitted: {len(out)} -> {OUT}")
    if unresolved:
        print(f"unresolved ({len(unresolved)}):")
        for h, s in unresolved:
            print(f"  {h}: {s}")


if __name__ == "__main__":
    main()
