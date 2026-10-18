#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Limpa products.brand: remove nomes de produto / texto de marketing; extrai marca real."""

from __future__ import annotations

import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "splendore-produtos-atual-2026-10-18.csv"
ENV_PATH = ROOT / ".env"

VOLUME = re.compile(
    r"(?i)\b(\d+[.,]?\d*\s*(ml|lt|l|cl)|magnum|garrafa|750|700|1000|1[,.]?5\s*l?t?)\b"
)
SIZEY = re.compile(r"(?i)\b(kit|cx\.|combo|pack|unidades?|safra|rótulo|rotulo)\b")
PREFIX = re.compile(
    r"(?i)^(vinho|espumante|champagne|whisky|whiskey|gin|vodka|rum|tequila|cacha[cç]a|"
    r"licor|conhaque|cognac|brandy|pisco|cerveja|kit|cx\.?|combo|pack)\s+"
)


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for path in (ENV_PATH, ROOT / ".env.local"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http_json(method: str, url: str, key: str, body=None, extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    req = Request(url, data=data, headers=headers, method=method)
    with urlopen(req, timeout=120) as res:
        raw = res.read()
        return json.loads(raw.decode("utf-8")) if raw else None


def looks_like_product(brand: str, name: str = "") -> bool:
    b = (brand or "").strip()
    n = (name or "").strip()
    if not b:
        return True
    if ";" in b or len(b) > 40:
        return True
    if VOLUME.search(b) or SIZEY.search(b):
        return True
    if n and b.lower() == n.lower():
        return True
    if n and n.lower().startswith(b.lower()) and len(b) > 22:
        return True
    return False


def strip_brand(raw: str) -> str:
    b = (raw or "").strip().lstrip(";,").strip()
    if ";" in b:
        b = b.split(";", 1)[0].strip()
    b = VOLUME.sub("", b)
    b = re.sub(r"\s{2,}", " ", b).strip(" -–|,")
    return b


def build_known_brands(rows: list[dict]) -> list[str]:
    freq: dict[str, int] = {}
    for r in rows:
        m = strip_brand(r.get("marca") or "")
        if not m or looks_like_product(m, r.get("nome") or ""):
            continue
        freq[m] = freq.get(m, 0) + 1
    # prefer longer names first for matching
    brands = sorted(freq.keys(), key=lambda s: (-len(s), s.lower()))
    return brands


def match_known(text: str, known: list[str]) -> str | None:
    t = (text or "").lower()
    for b in known:
        bl = b.lower()
        if bl in t:
            return b
    return None


def extract_from_name(name: str, known: list[str]) -> str | None:
    n = (name or "").strip()
    hit = match_known(n, known)
    if hit:
        return hit
    rest = PREFIX.sub("", n)
    rest = VOLUME.sub("", rest)
    rest = re.sub(r"\b(19|20)\d{2}\b", "", rest)
    rest = re.sub(r"\s{2,}", " ", rest).strip(" -–|,")
    words = rest.split()
    if not words:
        return None
    # 1–3 words as candidate brand
    for k in (3, 2, 1):
        if len(words) >= k:
            cand = " ".join(words[:k])
            if 2 <= len(cand) <= 40 and not looks_like_product(cand, name):
                return cand
    return None


def sanitize(brand: str, name: str, known: list[str]) -> str | None:
    b = strip_brand(brand)
    if b and not looks_like_product(b, name):
        # still try to prefer known brand if brand is a line name like "Minuty Prestige"
        known_hit = match_known(b, known) or match_known(name, known)
        if known_hit and (known_hit.lower() in b.lower() or known_hit.lower() in name.lower()):
            # if brand is longer line variant of known, keep known when brand looks like line
            if b.lower() != known_hit.lower() and len(b) > len(known_hit) + 2:
                return known_hit
        return b
    # dirty brand → extract
    if b:
        hit = match_known(b, known) or match_known(name, known)
        if hit:
            return hit
    return extract_from_name(name, known)


def main() -> int:
    env = load_env()
    url = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_LEGACY_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key.startswith("eyJ"):
        print("ERRO credenciais")
        return 1

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8-sig", newline="")))
    known = build_known_brands(rows)
    # force useful wine house brands that may be dirty in CSV
    for extra in ("Minuty", "Château Minuty", "Martell", "Hennessy", "Absolut", "Bacardi", "Martini"):
        if extra not in known:
            known.insert(0, extra)
    known = sorted(set(known), key=lambda s: (-len(s), s.lower()))

    # fetch all products with brand or splendore sku
    products = []
    start = 0
    while True:
        chunk = http_json(
            "GET",
            f"{url}/rest/v1/products?select=id,name,brand,sku&or=(brand.neq.,sku.like.CDB-*,sku.like.SPL-*)&offset={start}&limit=1000",
            key,
            extra={"Range": f"{start}-{start+999}"},
        )
        if not chunk:
            break
        products.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000

    print(f"produtos: {len(products)}")
    updates = []
    samples = []
    for p in products:
        old = (p.get("brand") or "").strip() or None
        new = sanitize(old or "", p.get("name") or "", known)
        if new != old:
            updates.append((p["id"], old, new, p.get("name"), p.get("sku")))
            if len(samples) < 30:
                samples.append((p.get("sku"), old, new, (p.get("name") or "")[:50]))

    print(f"a atualizar: {len(updates)}")
    for s in samples:
        print(" ", s)

    # patch in batches of 1 (PostgREST filter by id)
    ok = 0
    for i, (pid, old, new, name, sku) in enumerate(updates, 1):
        body = {"brand": new}
        req = Request(
            f"{url}/rest/v1/products?id=eq.{pid}",
            data=json.dumps(body).encode("utf-8"),
            method="PATCH",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urlopen(req, timeout=60) as res:
                res.read()
            ok += 1
        except HTTPError as e:
            print(f"FAIL {sku}: {e.read().decode()[:200]}")
        if i % 200 == 0:
            print(f"… {i}/{len(updates)}")
            time.sleep(0.2)

    print(f"DONE updated={ok}/{len(updates)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
