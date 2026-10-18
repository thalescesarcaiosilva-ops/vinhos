import json
import os
import re

base = r"d:\vinhos\scripts\clone_schema\chunks\tiny\_payloads"
chunks = []
for i in range(6, 65):
    p = json.load(open(os.path.join(base, f"t{i:02d}.json"), encoding="utf-8"))
    chunks.append((i, p["name"], p["query"]))

# Match $$ or $tag$
DOLLAR = re.compile(r"\$([A-Za-z_]*)\$")


def open_dollar_tag(sql: str) -> str | None:
    """Return the currently open dollar-quote tag ('' for $$), or None if balanced."""
    pos = 0
    stack: list[str] = []
    while True:
        m = DOLLAR.search(sql, pos)
        if not m:
            break
        tag = m.group(1)
        if stack and stack[-1] == tag:
            stack.pop()
        else:
            stack.append(tag)
        pos = m.end()
    return stack[-1] if stack else None


def is_complete(sql: str) -> bool:
    if open_dollar_tag(sql) is not None:
        return False
    s = sql.rstrip()
    return s.endswith(";") or s == ""


groups = []
buf = ""
start = None
idxs = []
for i, name, q in chunks:
    if start is None:
        start = i
    buf += q
    idxs.append(i)
    if is_complete(buf):
        groups.append((start, i, idxs[:], len(buf)))
        buf = ""
        start = None
        idxs = []
if buf:
    groups.append((start, chunks[-1][0], idxs, len(buf)))

print(f"groups: {len(groups)}")
for g in groups:
    print(f"  t{g[0]:02d}-t{g[1]:02d} files={g[2]} len={g[3]}")

out = os.path.join(base, "_grouped")
os.makedirs(out, exist_ok=True)
# clear old grouped files except we'll overwrite
manifest = []
for start, end, idxs, _ in groups:
    q = "".join(
        json.load(open(os.path.join(base, f"t{i:02d}.json"), encoding="utf-8"))["query"]
        for i in idxs
    )
    name = f"clone_t{start:02d}" if start == end else f"clone_t{start:02d}_t{end:02d}"
    path = os.path.join(out, f"{name}.json")
    payload = {"name": name, "query": q, "files": [f"t{i:02d}" for i in idxs]}
    json.dump(payload, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    manifest.append({"name": name, "path": path, "files": payload["files"], "len": len(q)})
    print("wrote", name, "len", len(q))

json.dump(manifest, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), indent=2)
print("manifest done")
