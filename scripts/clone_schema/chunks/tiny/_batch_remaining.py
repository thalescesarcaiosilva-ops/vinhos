"""Batch remaining complete groups into ~12KB apply payloads."""
import json
import os

base = r"d:\vinhos\scripts\clone_schema\chunks\tiny\_payloads\_grouped"
m = json.load(open(os.path.join(base, "manifest.json"), encoding="utf-8"))
done = {
    "clone_t06_t08",
    "clone_t09",
    "clone_t10",
    "clone_t11_t12",
    "clone_t13",
}
rest = [x for x in m if x["name"] not in done]

out_dir = os.path.join(base, "_batches")
os.makedirs(out_dir, exist_ok=True)

TARGET = 12000
batches = []
cur_names = []
cur_files = []
cur_q = ""

def flush():
    global cur_names, cur_files, cur_q
    if not cur_names:
        return
    first = cur_files[0]
    last = cur_files[-1]
    name = f"clone_{first}" if first == last else f"clone_{first}_{last}"
    # normalize tNN from files like t14
    path = os.path.join(out_dir, f"{name}.json")
    payload = {"name": name, "query": cur_q, "files": cur_files[:], "groups": cur_names[:]}
    json.dump(payload, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    open(os.path.join(out_dir, f"{name}.sql"), "w", encoding="utf-8").write(cur_q)
    batches.append({"name": name, "path": path, "len": len(cur_q), "files": cur_files[:]})
    print(f"batch {name} len={len(cur_q)} files={cur_files}")
    cur_names, cur_files, cur_q = [], [], ""

for item in rest:
    p = json.load(open(item["path"], encoding="utf-8"))
    if cur_q and len(cur_q) + len(p["query"]) > TARGET:
        flush()
    cur_names.append(item["name"])
    cur_files.extend(p["files"])
    cur_q += p["query"]
    if not cur_q.rstrip().endswith(";"):
        cur_q += "\n"
flush()

json.dump(batches, open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8"), indent=2)
print("total batches", len(batches))
