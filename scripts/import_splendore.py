#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa o CSV Splendore para a Galvao Vinhos (produtos + imagens + categorias)."""

from __future__ import annotations

import csv
import html
import json
import os
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "splendore-produtos-atual-2026-10-18.csv"
ENV_PATH = ROOT / ".env"
STATE_PATH = ROOT / "scripts" / ".import_splendore_state.json"
LOG_PATH = ROOT / "scripts" / ".import_splendore.log"

PRADO_IMG = "https://www.pradovinhos.com.br/storage/v1/object/public/product-images/"
STOCK_DEFAULT = 200
BATCH = 40
IMG_WORKERS = 12

PRODUCT_TYPES = {
    "vinho",
    "espumante",
    "sangria",
    "destilado",
    "cerveja",
    "suco",
    "acessorio",
    "gourmet",
    "kit",
    "outro",
}
COLORS = {"tinto", "branco", "rose", "misto", "na"}


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


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


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "produto"


def strip_html(s: str) -> str:
    s = re.sub(r"(?is)<script.*?>.*?</script>", " ", s or "")
    s = re.sub(r"(?is)<style.*?>.*?</style>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(re.sub(r"\s+", " ", s)).strip()


def clean_html_desc(raw: str) -> str:
    if not raw:
        return ""
    s = raw
    # HTML quebrado típico do export: <h3>visual</h3>
    s = re.sub(r"(?is)</?h3>\s*visual\s*</?h3>", " visual ", s)
    s = re.sub(r"(?is)<h3>\s*visual\s*</h3>", " visual ", s)
    # remover headings vazios / lixo
    s = re.sub(r"(?is)<h[1-6][^>]*>\s*</h[1-6]>", " ", s)
    s = re.sub(r"(?is)<p>\s*</p>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def improve_description(name: str, short: str, longd: str) -> tuple[str | None, str | None]:
    short_txt = strip_html(short)
    long_html = clean_html_desc(longd)
    long_txt = strip_html(long_html)

    # descrição só em CAPS = título: vira frase útil mínima
    if long_txt and long_txt.upper() == long_txt and len(long_txt) < 160:
        long_html = f"<p>{name.strip()}.</p>"
        long_txt = name.strip() + "."

    if short_txt and short_txt.upper() == short_txt and len(short_txt) < 160:
        short_txt = ""

    # fluff genérico de sommelier: manter, mas enxugar heading
    if long_html:
        long_html = re.sub(
            r"(?is)<h3>\s*Resumo do Sommelier\s*</h3>",
            "<p><strong>Notas</strong></p>",
            long_html,
        )

    # se short vazio e long ok, gerar short limpo
    if not short_txt and long_txt:
        short_txt = long_txt[:280].rsplit(" ", 1)[0].rstrip(".,;") + "."
        if len(long_txt) <= 280:
            short_txt = long_txt

    if not long_html and short_txt:
        long_html = f"<p>{html.escape(short_txt)}</p>"

    if not long_html and not short_txt:
        long_html = f"<p>{html.escape(name.strip())}.</p>"
        short_txt = name.strip() + "."

    return (short_txt or None, long_html or None)


def clean_name(name: str) -> str:
    n = re.sub(r"\s+", " ", (name or "").strip())
    # evitar "grátis/brinde" no título comercial (mantém o kit, deixa claro o conteúdo)
    n = re.sub(r"\s*\+\s*Brindes?\b", "", n, flags=re.I)
    n = re.sub(r"\s+com\s+Ta[cç]a\s+Gr[aá]tis\b", " + Taça", n, flags=re.I)
    n = re.sub(r"\s+Gr[aá]tis\b", "", n, flags=re.I)
    return n.strip(" -+")


def clean_brand(marca: str, nome: str, tipo: str) -> str | None:
    m = (marca or "").strip().lstrip(";,").strip()
    if not m:
        return None
    if m.lower().startswith("produtor "):
        m = m[9:].strip(" -")
    # acessório com marca = nome do produto: tenta extrair fabricante conhecido
    if tipo in {"acessorio", "outro"} and m.lower() in (nome or "").lower()[:50]:
        for brand in ("Wolff", "Barpro", "Stanley", "Aladdin", "Riedel", "Spiegelau", "Schott"):
            if brand.lower() in (nome or "").lower() or brand.lower() in m.lower():
                return brand
        # se a "marca" for só o nome do item, deixa nulo
        if slugify(m) == slugify(nome) or slugify(m) in slugify(nome):
            return None
    if len(m) > 80:
        return m[:80].rstrip()
    return m


def clean_region(reg: str) -> str | None:
    r = (reg or "").strip()
    if not r:
        return None
    if r.startswith(",") or r.startswith("de "):
        return None
    r = re.split(r"\s+Produtor\b", r, maxsplit=1, flags=re.I)[0].strip(" :,-")
    if len(r) > 60 or "Volume:" in r or "Composição" in r:
        return None
    return r or None


def clean_short_field(val: str, max_len: int = 80) -> str | None:
    v = (val or "").strip()
    if not v:
        return None
    v = re.sub(r"^de Consumo:\s*", "", v, flags=re.I).strip()
    if v.startswith(",") or len(v) > max_len:
        return None
    if "em 1990" in v or "coluna" in v.lower():
        return None
    return v


def clean_harmonization(val: str) -> str | None:
    v = (val or "").strip()
    if not v:
        return None
    # corta blocos "SOBRE A MARCA" / metadados colados
    v = re.split(r"\bSOBRE A MARCA\b|\bUva Uva\b|\bSubtipo\b|\bPotencial de guarda\b", v, maxsplit=1)[0]
    v = v.strip(" .;")
    if len(v) < 3 or len(v) > 300:
        return None
    return v


def map_product_type(row: dict[str, str]) -> str:
    tipo = (row.get("tipo") or "outro").strip().lower()
    nome = (row.get("nome") or "").lower()
    cat = (row.get("categoria_principal") or "").lower()
    cats = (row.get("categorias") or "").lower()
    slugs = (row.get("categorias_slugs") or "").lower()

    if "taças" in cat or "tacas" in slugs or "taças" in cats:
        return "acessorio"
    if "acessórios" in cat or "acessorios" in slugs:
        return "acessorio"
    if any(k in nome for k in ("azeite", "xarope", "pure monin", "bala ", "água de coco", "energetico", "energético")):
        return "gourmet"
    if tipo == "outro" and any(k in nome for k in ("cuia", "caixa térmica", "copo ", "taça", "taca")):
        return "acessorio"
    if tipo in PRODUCT_TYPES:
        return tipo
    return "outro"


def map_color(cor: str) -> str | None:
    c = (cor or "").strip().lower()
    if c in COLORS:
        return c
    return None


def http_json(
    method: str,
    url: str,
    key: str,
    body: Any = None,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=120) as res:
            raw = res.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} -> {e.code}: {err[:500]}") from e


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"done_skus": {}, "images_ok": {}, "images_fail": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.write_text(json.dumps(state), encoding="utf-8")


def fetch_existing(url: str, key: str) -> tuple[set[str], set[str], dict[str, str]]:
    slugs: set[str] = set()
    skus: set[str] = set()
    sku_to_id: dict[str, str] = {}
    start = 0
    while True:
        end = start + 999
        rows = http_json(
            "GET",
            f"{url}/rest/v1/products?select=id,slug,sku&offset={start}&limit=1000",
            key,
            extra_headers={"Range": f"{start}-{end}"},
        )
        if not rows:
            break
        for r in rows:
            if r.get("slug"):
                slugs.add(r["slug"])
            if r.get("sku"):
                skus.add(r["sku"])
                sku_to_id[r["sku"]] = r["id"]
        if len(rows) < 1000:
            break
        start += 1000
    return slugs, skus, sku_to_id


def unique_slug(base: str, used: set[str], sku: str) -> str:
    s = base or slugify(sku)
    if s not in used:
        used.add(s)
        return s
    alt = f"{s}-{slugify(sku)}"
    if alt not in used:
        used.add(alt)
        return alt
    i = 2
    while f"{alt}-{i}" in used:
        i += 1
    final = f"{alt}-{i}"
    used.add(final)
    return final


def row_to_product(row: dict[str, str], used_slugs: set[str]) -> dict[str, Any]:
    sku = (row.get("sku") or "").strip()
    name = clean_name(row.get("nome") or "")
    ptype = map_product_type(row)
    brand = clean_brand(row.get("marca") or "", name, ptype)
    short, desc = improve_description(
        name,
        row.get("descricao_curta") or "",
        row.get("descricao") or "",
    )
    img_name = Path((row.get("image_url") or "").strip()).name
    image_url = f"/storage/v1/object/public/product-images/{img_name}" if img_name else None

    base_slug = (row.get("slug") or "").strip() or slugify(name)
    slug = unique_slug(base_slug, used_slugs, sku)

    country = (row.get("pais") or "").strip() or None
    if country in {"EUA", "USA"}:
        country = "Estados Unidos"

    price = float(str(row.get("preco") or "0").replace(",", "."))
    alcohol = clean_short_field(row.get("teor_alcoolico") or "", 20)
    serving = clean_short_field(row.get("temperatura_servico") or "", 40)
    wine_type = clean_short_field(row.get("tipo_vinho") or "", 40)
    wine_style = clean_short_field(row.get("estilo") or "", 60)
    classification = clean_short_field(row.get("classificacao") or "", 60)
    aging = clean_short_field(row.get("envelhecimento") or "", 120)
    region = clean_region(row.get("regiao") or "")
    grape = (row.get("uva") or "").strip() or None
    if grape and len(grape) > 120:
        grape = grape[:120]
    vintage = clean_short_field(row.get("safra") or "", 20)
    harmonization = clean_harmonization(row.get("harmonizacao") or "")
    zero = (row.get("zero_alcool") or "").strip().lower() == "sim"

    return {
        "name": name,
        "slug": slug,
        "sku": sku,
        "price": price,
        "stock": STOCK_DEFAULT,
        "is_active": True,
        "featured": False,
        "best_seller": False,
        "product_type": ptype,
        "color": map_color(row.get("cor") or ""),
        "brand": brand,
        "country": country,
        "region": region,
        "grape": grape,
        "vintage": vintage,
        "wine_type": wine_type,
        "wine_style": wine_style,
        "classification": classification,
        "aging": aging,
        "alcohol_content": alcohol,
        "serving_temp": serving,
        "harmonization": harmonization,
        "short_description": short,
        "description": desc,
        "image_url": image_url,
        "is_zero_alcohol": zero,
        "gallery": [],
        "harmonizacao": [],
        "selo": [],
        "_img_file": img_name,
    }


def upload_image(url: str, key: str, filename: str) -> bool:
    if not filename:
        return False
    src = PRADO_IMG + filename
    req = Request(src, headers={"User-Agent": "GalvaoImport/1.0"})
    try:
        with urlopen(req, timeout=60) as res:
            data = res.read()
            ctype = res.headers.get("Content-Type") or "image/jpeg"
    except (HTTPError, URLError, TimeoutError):
        return False
    if not data:
        return False
    up = Request(
        f"{url}/storage/v1/object/product-images/{filename}",
        data=data,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": ctype,
            "x-upsert": "true",
        },
    )
    try:
        with urlopen(up, timeout=120) as res:
            res.read()
        return True
    except HTTPError as e:
        # já existe
        if e.code in (409, 400):
            return True
        return False
    except URLError:
        return False


def main() -> int:
    env = load_env()
    url = (env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL") or "").rstrip("/")
    key = (
        env.get("SUPABASE_LEGACY_SERVICE_ROLE_KEY")
        or env.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    )
    if not url or not key or not key.startswith("eyJ"):
        log("ERRO: SUPABASE_URL / SERVICE_ROLE JWT ausentes no .env")
        return 1
    if not CSV_PATH.exists():
        log(f"ERRO: CSV não encontrado: {CSV_PATH}")
        return 1

    LOG_PATH.write_text("", encoding="utf-8")
    state = load_state()
    log("Carregando produtos existentes…")
    used_slugs, existing_skus, sku_to_id = fetch_existing(url, key)
    log(f"Existentes: {len(used_slugs)} slugs, {len(existing_skus)} skus")

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    log(f"CSV: {len(rows)} linhas")

    # 1) preparar payloads
    payloads: list[dict[str, Any]] = []
    for row in rows:
        sku = (row.get("sku") or "").strip()
        if not sku:
            continue
        if sku in state["done_skus"]:
            continue
        if sku in existing_skus:
            # já importado em run anterior parcial
            state["done_skus"][sku] = sku_to_id.get(sku, "existing")
            continue
        try:
            payloads.append(row_to_product(row, used_slugs))
        except Exception as e:
            log(f"SKIP prepare {sku}: {e}")

    log(f"A inserir: {len(payloads)}")

    # 2) insert em lotes
    inserted = 0
    for i in range(0, len(payloads), BATCH):
        chunk = payloads[i : i + BATCH]
        body = []
        img_map = {}
        for p in chunk:
            img_map[p["sku"]] = p.pop("_img_file", None)
            body.append(p)
        try:
            res = http_json(
                "POST",
                f"{url}/rest/v1/products",
                key,
                body,
                extra_headers={
                    "Prefer": "return=representation",
                },
            )
        except Exception as e:
            log(f"ERRO batch {i}: {e}")
            # tenta um a um
            for p in body:
                try:
                    one = http_json(
                        "POST",
                        f"{url}/rest/v1/products",
                        key,
                        p,
                        extra_headers={"Prefer": "return=representation"},
                    )
                    pid = one[0]["id"] if isinstance(one, list) else one["id"]
                    state["done_skus"][p["sku"]] = pid
                    sku_to_id[p["sku"]] = pid
                    inserted += 1
                except Exception as e2:
                    log(f"FAIL {p['sku']}: {e2}")
            save_state(state)
            continue

        if isinstance(res, list):
            for item in res:
                sku = item.get("sku")
                pid = item.get("id")
                if sku and pid:
                    state["done_skus"][sku] = pid
                    sku_to_id[sku] = pid
                    inserted += 1
        save_state(state)
        log(f"Insert {min(i + BATCH, len(payloads))}/{len(payloads)} (ok={inserted})")

    # 3) sync categories
    log("Sincronizando categorias…")
    ids = [pid for pid in state["done_skus"].values() if isinstance(pid, str) and len(pid) > 20]
    # also include any from this run in sku_to_id for CDB/SPL
    for sku, pid in list(sku_to_id.items()):
        if (sku.startswith("CDB-") or sku.startswith("SPL-")) and pid not in ids:
            ids.append(pid)

    synced = 0
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        for pid in chunk:
            try:
                http_json(
                    "POST",
                    f"{url}/rest/v1/rpc/sync_product_categories",
                    key,
                    {"_product_id": pid},
                )
                synced += 1
            except Exception as e:
                log(f"sync fail {pid}: {e}")
        if i % 200 == 0:
            log(f"sync {synced}/{len(ids)}")
    log(f"Categorias sincronizadas: {synced}")

    # 4) imagens
    log("Enviando imagens…")
    todo_imgs: list[tuple[str, str]] = []
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            sku = (row.get("sku") or "").strip()
            if sku not in state["done_skus"] and sku not in sku_to_id:
                # still try images for all CSV skus that exist in DB
                if sku not in existing_skus and sku not in sku_to_id:
                    continue
            fname = Path((row.get("image_url") or "").strip()).name
            if not fname:
                continue
            if state["images_ok"].get(fname):
                continue
            todo_imgs.append((sku, fname))

    # unique filenames
    seen = set()
    unique_files: list[str] = []
    for _, fname in todo_imgs:
        if fname not in seen:
            seen.add(fname)
            unique_files.append(fname)

    log(f"Imagens pendentes: {len(unique_files)}")
    ok = 0
    fail = 0

    def job(fname: str) -> tuple[str, bool]:
        return fname, upload_image(url, key, fname)

    with ThreadPoolExecutor(max_workers=IMG_WORKERS) as ex:
        futs = [ex.submit(job, f) for f in unique_files]
        for n, fut in enumerate(as_completed(futs), 1):
            fname, success = fut.result()
            if success:
                state["images_ok"][fname] = True
                ok += 1
            else:
                state["images_fail"][fname] = True
                fail += 1
            if n % 50 == 0 or n == len(unique_files):
                save_state(state)
                log(f"imgs {n}/{len(unique_files)} ok={ok} fail={fail}")

    save_state(state)
    log(f"DONE inserted≈{inserted} images_ok={ok} images_fail={fail}")
    return 0 if fail < len(unique_files) else 1


if __name__ == "__main__":
    sys.exit(main())
