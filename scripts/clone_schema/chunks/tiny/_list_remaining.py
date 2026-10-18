import json
import os

base = r"d:\vinhos\scripts\clone_schema\chunks\tiny\_payloads\_grouped"
m = json.load(open(os.path.join(base, "manifest.json"), encoding="utf-8"))
done = {
    "clone_t06_t08",
    "clone_t09",
    "clone_t10",
    "clone_t11_t12",
}
rest = [x for x in m if x["name"] not in done]
print("remaining", len(rest))
for x in rest:
    files = ",".join(x["files"])
    print(f"{x['name']}\t{x['len']}\t{files}")
