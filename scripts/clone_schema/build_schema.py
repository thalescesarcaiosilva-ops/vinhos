"""Build schema-only SQL for cloning the store structure into a new Supabase project."""
from __future__ import annotations

import json
import pathlib
import re
from collections import OrderedDict

OUT = pathlib.Path(__file__).resolve().parent
COLS_PATH = pathlib.Path(
    r"C:\Users\rodri\.cursor\projects\d-vinhos\agent-tools\17fe0bf2-3225-4d5c-823e-0b3535bd34ea.txt"
)


def load_json_array(path: pathlib.Path):
    raw = path.read_text(encoding="utf-8")
    try:
        outer = json.loads(raw)
        if isinstance(outer, dict) and "result" in outer:
            raw = outer["result"]
        elif isinstance(outer, list):
            return outer
    except json.JSONDecodeError:
        pass
    m = re.search(
        r"<untrusted-data-[^>]+>\s*(\[.*?\])\s*</untrusted-data-",
        raw,
        re.S,
    )
    if m:
        return json.loads(m.group(1))
    m = re.search(r"\[\{.*\}\]", raw, re.S)
    if not m:
        raise RuntimeError(f"No JSON array in {path}")
    return json.loads(m.group(0))


def col_sql(c: dict) -> str:
    line = f'  "{c["column_name"]}" {c["data_type"]}'
    if c["not_null"]:
        line += " NOT NULL"
    if c["default_expr"]:
        line += f" DEFAULT {c['default_expr']}"
    return line


def main() -> None:
    cols = load_json_array(COLS_PATH)
    by_table: OrderedDict[str, list] = OrderedDict()
    for c in cols:
        by_table.setdefault(c["table_name"], []).append(c)

    order = [
        "user_roles",
        "categories",
        "brands",
        "grapes",
        "regions",
        "collections",
        "products",
        "banners",
        "product_categories",
        "product_grapes",
        "product_suggestions",
        "profiles",
        "addresses",
        "favorites",
        "reviews",
        "coupons",
        "coupon_redemptions",
        "orders",
        "order_items",
        "order_status_history",
        "newsletter_subscribers",
        "store_settings",
        "webhook_events",
        "contact_messages",
        "support_order_contacts",
        "_seed_sql_parts",
    ]
    for t in by_table:
        if t not in order:
            order.append(t)

    enums_sql = """
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','customer','support'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.coupon_type AS ENUM ('fixed','percent','free_shipping','first_purchase'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('pending','confirmed','shipped','delivered','cancelled','paid','separating','invoiced','out_for_delivery','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.product_type_enum AS ENUM ('vinho','espumante','sangria','destilado','cerveja','suco','acessorio','gourmet','kit','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.wine_color_enum AS ENUM ('tinto','branco','rose','misto','na'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
"""

    tables = []
    for t in order:
        if t not in by_table:
            continue
        lines = [col_sql(c) for c in by_table[t]]
        tables.append(
            f'CREATE TABLE IF NOT EXISTS public."{t}" (\n' + ",\n".join(lines) + "\n);"
        )

    (OUT / "01_enums_tables.sql").write_text(
        enums_sql.strip() + "\n\n" + "\n\n".join(tables) + "\n", encoding="utf-8"
    )
    print("wrote", OUT / "01_enums_tables.sql", "tables=", len(tables))


if __name__ == "__main__":
    main()
