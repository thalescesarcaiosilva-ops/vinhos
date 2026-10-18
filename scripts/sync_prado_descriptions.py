#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sincroniza descrições completas + marcas limpas a partir do feed do Prado.
Formata o texto corrido em HTML com seções e quebras de linha.
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
PRADO_FEED = "https://www.pradovinhos.com.br/product-feed.xml"
LOCAL_FEED = ROOT / "scripts" / ".prado-feed.xml"
G = "{http://base.google.com/ns/1.0}"

VOLUME_RE = re.compile(
    r"(?i)\b(\d+[.,]?\d*\s*(ml|lt|l|cl)|magnum|garrafa|750|700|1000|1[,.]?5\s*l?t?)\b"
)
SIZEY_RE = re.compile(r"(?i)\b(kit|cx\.|combo|pack|unidades?|safra|r[oó]tulo|moderno e sofisticado)\b")
PREFIX_RE = re.compile(
    r"(?i)^(vinho|espumante|champagne|whisky|whiskey|gin|vodka|rum|tequila|cacha[cç]a|"
    r"licor|conhaque|cognac|brandy|pisco|cerveja|kit|cx\.?|combo|pack)\s+"
)

SECTION_HEADERS = [
    "Aromas & Paladar",
    "Aromas e Paladar",
    "Harmonizações Sugeridas",
    "Harmonizacoes Sugeridas",
    "Ficha Técnica",
    "Ficha Tecnica",
    "Destaques comerciais",
    "Destaques Comerciais",
    "História e Curiosidade",
    "Historia e Curiosidade",
    "Características",
    "Caracteristicas",
    "Detalhes",
    "Sobre a marca",
    "Sobre a Marca",
]

INLINE_BREAKS = [
    "Nariz:",
    "Boca:",
    "Finalização:",
    "Finalizacao:",
    "Entradas e petiscos:",
    "Pratos principais:",
    "Queijos e/ou sobremesas:",
    "Queijos e sobremesas:",
    "Volume:",
    "Teor alcoólico:",
    "Teor alcoolico:",
    "Graduação alcoólica:",
    "Graduacao alcoolica:",
    "País:",
    "Pais:",
    "Região:",
    "Regiao:",
    "Estilo:",
    "Tipo:",
    "Uva:",
    "Uvas:",
    "Produtor:",
    "Classificação:",
    "Classificacao:",
    "Maturação ou método de produção:",
    "Maturacao ou metodo de producao:",
    "Envelhecimento:",
]


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


def looks_like_product_brand(brand: str, name: str = "") -> bool:
    b = (brand or "").strip()
    n = (name or "").strip()
    if not b:
        return True
    if ";" in b or len(b) > 40:
        return True
    if VOLUME_RE.search(b) or SIZEY_RE.search(b):
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
    b = VOLUME_RE.sub("", b)
    b = re.sub(r"\s{2,}", " ", b).strip(" -–|,")
    return b


def sanitize_brand(brand: str, name: str, known: list[str]) -> str | None:
    b = strip_brand(brand)
    if b and not looks_like_product_brand(b, name):
        for k in known:
            if k.lower() in b.lower() or k.lower() in name.lower():
                if b.lower() != k.lower() and len(b) > len(k) + 2 and k.lower() in b.lower():
                    return k
        return b
    text = f"{b} {name}"
    for k in known:
        if k.lower() in text.lower():
            return k
    # fallback: first words of name after type prefix
    rest = PREFIX_RE.sub("", name or "")
    rest = VOLUME_RE.sub("", rest)
    rest = re.sub(r"\b(19|20)\d{2}\b", "", rest)
    rest = re.sub(r"\s{2,}", " ", rest).strip(" -–|,")
    words = rest.split()
    for n in (3, 2, 1):
        if len(words) >= n:
            cand = " ".join(words[:n])
            if 2 <= len(cand) <= 40 and not looks_like_product_brand(cand, name):
                return cand
    return None


def insert_breaks(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    # section headers always start a new block (aceita ":" opcional depois)
    for h in sorted(SECTION_HEADERS, key=len, reverse=True):
        t = re.sub(rf"\s*({re.escape(h)})\s*:?", rf"\n\n\1\n", t, flags=re.I)
    for label in sorted(INLINE_BREAKS, key=len, reverse=True):
        t = re.sub(rf"\s+({re.escape(label)})", rf"\n\1", t, flags=re.I)
    # cues mid-paragraph
    t = re.sub(r"\s+(A história da\b)", r"\n\n\1", t, flags=re.I)
    t = re.sub(r"\s+(No paladar[,]?\b)", r"\n\n\1", t, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def to_structured_html(plain: str) -> str:
    text = insert_breaks(plain)
    if not text:
        return ""

    header_set = {h.lower() for h in SECTION_HEADERS}
    blocks: list[str] = []
    for block in re.split(r"\n{2,}", text):
        block = block.strip()
        if not block:
            continue
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        first = lines[0]
        # pure section title
        if first.lower() in header_set and len(lines) == 1:
            blocks.append(f"<h3>{html.escape(first)}</h3>")
            continue
        if first.lower() in header_set:
            blocks.append(f"<h3>{html.escape(first)}</h3>")
            rest_lines = [ln.lstrip(": ").strip() for ln in lines[1:] if ln.lstrip(": ").strip()]
            if not rest_lines:
                continue
            if any(":" in ln for ln in rest_lines):
                blocks.append("<p>" + "<br/>\n".join(html.escape(ln) for ln in rest_lines) + "</p>")
            else:
                blocks.append(f"<p>{html.escape(' '.join(rest_lines))}</p>")
            continue
        # multi-line with labels
        if len(lines) > 1 and any(re.match(r"^[A-Za-zÀ-ÿ ].{0,40}:", ln) for ln in lines):
            blocks.append("<p>" + "<br/>\n".join(html.escape(ln) for ln in lines) + "</p>")
            continue
        blocks.append(f"<p>{html.escape(' '.join(lines))}</p>")

    return "\n".join(blocks)


def short_from_html(structured_html: str, limit: int = 320) -> str:
    text = re.sub(r"<[^>]+>", " ", structured_html)
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(".,;")
    return cut + "."


def parse_feed(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for item in root.findall("./channel/item"):
        def g(tag: str) -> str:
            el = item.find(f"{G}{tag}")
            return (el.text or "").strip() if el is not None else ""

        link = g("link")
        m = re.search(r"/produto/([^/?#]+)", link)
        slug = m.group(1) if m else ""
        desc = g("description")
        # unescape XML entities already done by ET
        items.append(
            {
                "sku": g("id") or g("mpn"),
                "slug": slug,
                "title": g("title"),
                "brand": g("brand"),
                "description": desc,
            }
        )
    return items


def http_patch(url: str, key: str, pid: str, body: dict) -> None:
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
    with urlopen(req, timeout=60) as res:
        res.read()


def fetch_products(url: str, key: str) -> dict[str, dict]:
    by_sku: dict[str, dict] = {}
    start = 0
    while True:
        req = Request(
            f"{url}/rest/v1/products?select=id,sku,slug,name,brand,description&or=(sku.like.CDB-*,sku.like.SPL-*)&offset={start}&limit=1000",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
                "Range": f"{start}-{start+999}",
            },
        )
        with urlopen(req, timeout=120) as res:
            chunk = json.loads(res.read().decode("utf-8"))
        if not chunk:
            break
        for p in chunk:
            if p.get("sku"):
                by_sku[p["sku"]] = p
        if len(chunk) < 1000:
            break
        start += 1000
    return by_sku


def main() -> int:
    env = load_env()
    url = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = env.get("SUPABASE_LEGACY_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key.startswith("eyJ"):
        print("ERRO: credenciais")
        return 1

    if LOCAL_FEED.exists():
        print(f"Lendo feed local {LOCAL_FEED}…", flush=True)
        xml_bytes = LOCAL_FEED.read_bytes()
    else:
        print("Baixando feed Prado…", flush=True)
        req = Request(PRADO_FEED, headers={"User-Agent": "GalvaoSync/1.0"})
        xml_bytes = urlopen(req, timeout=180).read()
        LOCAL_FEED.write_bytes(xml_bytes)
    items = parse_feed(xml_bytes)
    print(f"itens feed: {len(items)}", flush=True)

    # known brands = clean brands appearing often
    brand_freq: dict[str, int] = {}
    for it in items:
        b = strip_brand(it["brand"])
        if b and not looks_like_product_brand(b, it["title"]):
            brand_freq[b] = brand_freq.get(b, 0) + 1
    known = sorted(brand_freq.keys(), key=lambda s: (-len(s), s.lower()))
    for extra in ("Minuty", "Château Minuty", "Martini", "Absolut", "Bacardi", "Johnnie Walker"):
        if extra not in known:
            known.insert(0, extra)
    known = sorted(set(known), key=lambda s: (-len(s), s.lower()))

    print("Carregando produtos Galvao…", flush=True)
    local = fetch_products(url, key)
    print(f"locais: {len(local)}", flush=True)

    updates = 0
    samples = []
    for it in items:
        sku = it["sku"]
        p = local.get(sku)
        if not p:
            continue
        plain = it["description"].strip()
        if not plain:
            continue
        structured = to_structured_html(plain)
        short = short_from_html(structured)
        brand = sanitize_brand(it["brand"] or p.get("brand") or "", p.get("name") or it["title"], known)

        # also clean polluted grape-like fields? skip here
        body = {
            "description": structured,
            "short_description": short,
            "brand": brand,
        }

        old_desc = p.get("description") or ""
        if structured == old_desc and brand == (p.get("brand") or None):
            continue

        try:
            http_patch(url, key, p["id"], body)
            updates += 1
            if sku in {"CDB-4700", "CDB-4699", "CDB-4698", "CDB-4701"} or len(samples) < 5:
                samples.append((sku, brand, len(plain), len(structured), structured[:180].replace("\n", " | ")))
        except HTTPError as e:
            print(f"FAIL {sku}: {e.read()[:200]}")

        if updates % 100 == 0 and updates:
            print(f"… {updates}", flush=True)
            time.sleep(0.05)

    print(f"DONE updates={updates}", flush=True)
    for s in samples:
        print(" SAMPLE", s, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
