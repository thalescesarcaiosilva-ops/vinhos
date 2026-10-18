"""Concatenate local migrations into applyable SQL chunks for the new project."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(r"d:\vinhos\supabase\migrations")
OUT = pathlib.Path(__file__).resolve().parent / "chunks"
OUT.mkdir(exist_ok=True)

SKIP_FILES = {
    # Creates hard-coded Galvao admin user — we create a new admin later
    "20260611143701_2f1483ba-ad2b-4b90-a6a8-1de7b83eb686.sql",
    # Gift policy data mutations against store_settings (already removed later)
    "20261015011000_first_purchase_gift_policy.sql",
    "20261015012000_simplify_first_purchase_gift_policy.sql",
    "20261015013000_complete_first_purchase_gift_policy.sql",
    "20261015014000_rewrite_first_purchase_gift_policy.sql",
    "20261015015000_gift_policy_minimum_and_shipping.sql",
}

# Product seed block markers in the first migration
PRODUCT_SEED_START = re.compile(r"-- ============ SEED CATEGORIES \+ PRODUCTS", re.I)


def sanitize(name: str, sql: str) -> str:
    if name.startswith("20260601200428"):
        # Keep buckets + schema; drop example product seed if present
        m = PRODUCT_SEED_START.search(sql)
        if m:
            # Keep category seed that may appear before products? The marker says categories+products
            # Cut from marker to end of file's seed section — keep storage policies after if any.
            # Safer: remove INSERT INTO products blocks only
            sql = re.sub(
                r"INSERT INTO public\.products\b[\s\S]*?;\s*",
                "",
                sql,
                flags=re.I,
            )
            sql = re.sub(
                r"INSERT INTO public\.product_categories\b[\s\S]*?;\s*",
                "",
                sql,
                flags=re.I,
            )
            sql = re.sub(
                r"INSERT INTO public\.banners\b[\s\S]*?;\s*",
                "",
                sql,
                flags=re.I,
            )
    # Never wipe auth users
    sql = re.sub(r"DELETE FROM auth\.users\s*;", "-- skipped DELETE FROM auth.users", sql, flags=re.I)
    return sql


def main() -> None:
    files = sorted(ROOT.glob("*.sql"))
    parts: list[str] = []
    for f in files:
        if f.name in SKIP_FILES:
            print("skip", f.name)
            continue
        sql = sanitize(f.name, f.read_text(encoding="utf-8"))
        parts.append(f"-- >>> {f.name}\n{sql.strip()}\n")

    # Also append storage policies for product-videos bucket (empty) to match prod policies
    parts.append(
        """
-- >>> clone_storage_extras
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-videos', 'product-videos', false)
ON CONFLICT (id) DO NOTHING;
""".strip()
    )

    full = "\n\n".join(parts)
    # Split into ~80k chunks on migration boundaries
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for part in parts:
        if size + len(part) > 80_000 and current:
            chunks.append("\n\n".join(current))
            current = [part]
            size = len(part)
        else:
            current.append(part)
            size += len(part)
    if current:
        chunks.append("\n\n".join(current))

    for i, chunk in enumerate(chunks, 1):
        path = OUT / f"chunk_{i:02d}.sql"
        path.write_text(chunk, encoding="utf-8")
        print(f"wrote {path.name} bytes={len(chunk)}")

    print("total_chunks", len(chunks), "total_bytes", len(full))


if __name__ == "__main__":
    main()
