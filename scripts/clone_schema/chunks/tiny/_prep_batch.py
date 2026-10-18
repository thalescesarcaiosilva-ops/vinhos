"""Prep one batch for apply: python _prep_batch.py clone_t23_t35"""
import json
import sys
import os

name = sys.argv[1]
base = r"d:\vinhos\scripts\clone_schema\chunks\tiny\_payloads\_grouped\_batches"
p = json.load(open(os.path.join(base, f"{name}.json"), encoding="utf-8"))
json.dump(
    {"name": p["name"], "query": p["query"]},
    open(os.path.join(base, "_apply.json"), "w", encoding="utf-8"),
    ensure_ascii=True,
)
open(os.path.join(base, "_apply.sql"), "w", encoding="utf-8").write(p["query"])
print(p["name"], len(p["query"]), ",".join(p["files"]))
