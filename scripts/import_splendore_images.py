#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baixa imagens do Prado e sobe no storage da Galvao (retomável)."""

from __future__ import annotations

import csv
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "splendore-produtos-atual-2026-10-18.csv"
ENV_PATH = ROOT / ".env"
STATE_PATH = ROOT / "scripts" / ".import_splendore_state.json"
LOG_PATH = ROOT / "scripts" / ".import_splendore_images.log"
PRADO_IMG = "https://www.pradovinhos.com.br/storage/v1/object/public/product-images/"
WORKERS = 16


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


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"done_skus": {}, "images_ok": {}, "images_fail": {}}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state), encoding="utf-8")


def upload_image(url: str, key: str, filename: str) -> bool:
    src = PRADO_IMG + filename
    req = Request(src, headers={"User-Agent": "GalvaoImport/1.0"})
    try:
        with urlopen(req, timeout=60) as res:
            data = res.read()
            ctype = res.headers.get("Content-Type") or "image/jpeg"
    except (HTTPError, URLError, TimeoutError, OSError):
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
        if e.code in (200, 201, 409):
            return True
        # upsert com alguns projetos responde 400 se existir — tenta PUT
        if e.code == 400:
            put = Request(
                f"{url}/storage/v1/object/product-images/{filename}",
                data=data,
                method="PUT",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": ctype,
                    "x-upsert": "true",
                },
            )
            try:
                with urlopen(put, timeout=120) as res:
                    res.read()
                return True
            except Exception:
                return False
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
    if not url or not key.startswith("eyJ"):
        log("ERRO: credenciais ausentes")
        return 1

    LOG_PATH.write_text("", encoding="utf-8")
    state = load_state()
    files: list[str] = []
    seen = set()
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            fname = Path((row.get("image_url") or "").strip()).name
            if not fname or fname in seen:
                continue
            seen.add(fname)
            if state.get("images_ok", {}).get(fname):
                continue
            files.append(fname)

    log(f"Imagens pendentes: {len(files)} (já ok={len(state.get('images_ok', {}))})")
    ok = fail = 0

    def job(fname: str):
        return fname, upload_image(url, key, fname)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(job, f) for f in files]
        for n, fut in enumerate(as_completed(futs), 1):
            fname, success = fut.result()
            if success:
                state.setdefault("images_ok", {})[fname] = True
                state.get("images_fail", {}).pop(fname, None)
                ok += 1
            else:
                state.setdefault("images_fail", {})[fname] = True
                fail += 1
            if n % 100 == 0 or n == len(files):
                save_state(state)
                log(f"imgs {n}/{len(files)} ok={ok} fail={fail}")

    save_state(state)
    log(f"DONE images ok={ok} fail={fail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
