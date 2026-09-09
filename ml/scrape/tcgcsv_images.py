"""Download card images for every TCGPlayer product.

Supports three data sources (checked in order):
  1. --direct  : fetch product lists straight from the TCGCSV API (no database needed)
  2. DATABASE_URL env var : query Postgres
  3. --db path : query local SQLite

    python scrape/tcgcsv_images.py --direct --tcg onepiece,lorcana,digimon,dbs,dbfw,fab,swu,vanguard,weiss,finalfantasy
    DATABASE_URL=postgres://... python scrape/tcgcsv_images.py --tcg pokemon
    python scrape/tcgcsv_images.py --db path/to/collectr.db --tcg pokemon
"""
from __future__ import annotations

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import ROOT_DIR  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, get_json, image_path,  # noqa: E402
                           load_manifest_ids, make_session)

DEFAULT_DB = ROOT_DIR / "web" / "data" / "collectr.db"

TCGCSV_BASE = "https://tcgcsv.com/tcgplayer"

# Maps TCG id -> TCGCSV category id(s)
TCGCSV_CATEGORIES: dict[str, list[int]] = {
    "pokemon": [3, 85],
    "mtg": [1],
    "yugioh": [2],
    "onepiece": [68],
    "lorcana": [71],
    "digimon": [63],
    "dbs": [27],
    "dbfw": [80],
    "fab": [62],
    "swu": [79],
    "vanguard": [16],
    "weiss": [20],
    "finalfantasy": [24],
    "unionarena": [81],
}

CATEGORY_LANG: dict[int, str] = {85: "jap"}


def query_direct_api(session, tcgs: list[str], lang: str | None, limiter: RateLimiter) -> list[tuple]:
    """Fetch products directly from TCGCSV API — no database required."""
    rows = []
    for tcg in tcgs:
        cat_ids = TCGCSV_CATEGORIES.get(tcg)
        if not cat_ids:
            print(f"  [warn] unknown tcg '{tcg}', skipping")
            continue
        for cat_id in cat_ids:
            cat_lang = CATEGORY_LANG.get(cat_id, "eng")
            if lang and cat_lang != lang:
                continue
            print(f"  Fetching groups for {tcg} (category {cat_id}, {cat_lang})...")
            try:
                groups_data = get_json(session, f"{TCGCSV_BASE}/{cat_id}/groups", limiter=limiter)
                groups = groups_data.get("results", [])
            except Exception as e:
                print(f"  [error] groups for {cat_id}: {e}")
                continue
            print(f"  {len(groups)} groups found, fetching products...")
            for gi, group in enumerate(groups):
                gid = group["groupId"]
                set_code = str(group.get("abbreviation") or gid)
                set_name = group.get("name", "")
                try:
                    products_data = get_json(session, f"{TCGCSV_BASE}/{cat_id}/{gid}/products", limiter=limiter)
                    products = products_data.get("results", [])
                except Exception as e:
                    print(f"  [error] products for group {gid}: {e}")
                    continue
                for p in products:
                    img_url = p.get("imageUrl")
                    if not img_url:
                        continue
                    ext_data = {e["name"]: e["value"] for e in (p.get("extendedData") or [])}
                    number = ext_data.get("Number")
                    if not number:
                        continue
                    pid = str(p["productId"])
                    rows.append((
                        f"tp:{pid}", p["name"], set_code, set_name, number,
                        ext_data.get("Rarity"), cat_lang, img_url, tcg
                    ))
                if (gi + 1) % 20 == 0:
                    print(f"    ... {gi + 1}/{len(groups)} groups ({len(rows)} products so far)")
            print(f"  {tcg}: {len([r for r in rows if r[8] == tcg])} products with images")
    return rows


def query_postgres(database_url: str, tcgs: list[str], lang: str | None) -> list[tuple]:
    import psycopg2
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    q = ("SELECT id, name, set_code, set_name, card_number, rarity, language, image_url, tcg FROM cards "
         "WHERE id LIKE 'tp:%%' AND card_number IS NOT NULL AND image_url IS NOT NULL AND tcg = ANY(%s)")
    params: list = [tcgs]
    if lang:
        q += " AND language = %s"
        params.append(lang)
    cur.execute(q, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def query_sqlite(db_path: str, tcgs: list[str], lang: str | None) -> list[tuple]:
    import sqlite3
    con = sqlite3.connect(db_path)
    q = ("SELECT id, name, set_code, set_name, card_number, rarity, language, image_url, tcg FROM cards "
         "WHERE id LIKE 'tp:%%' AND card_number IS NOT NULL AND image_url IS NOT NULL AND tcg IN (%s)" % ",".join("?" * len(tcgs)))
    params: list = list(tcgs)
    if lang:
        q += " AND language = ?"
        params.append(lang)
    rows = con.execute(q, params).fetchall()
    con.close()
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB), help="SQLite path (ignored when DATABASE_URL or --direct is used)")
    ap.add_argument("--direct", action="store_true", help="Fetch from TCGCSV API directly (no database needed)")
    ap.add_argument("--tcg", default="pokemon", help="comma-separated tcg ids")
    ap.add_argument("--lang", choices=["eng", "jap", "all"], default="all")
    ap.add_argument("--size", choices=["400w", "in_1000x1000"], default="400w")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--max-images", type=int, default=0)
    args = ap.parse_args()

    tcgs = [t.strip() for t in args.tcg.split(",") if t.strip()]
    lang = args.lang if args.lang != "all" else None
    database_url = os.environ.get("DATABASE_URL", "")

    api_session = make_session({"User-Agent": "ripnpull/0.1 (ML image scraper)", "Accept": "application/json"})
    api_limiter = RateLimiter(min_interval=0.1)

    if args.direct:
        print(f"Using TCGCSV API directly for: {', '.join(tcgs)}")
        rows = query_direct_api(api_session, tcgs, lang, api_limiter)
    elif database_url:
        print(f"Using Postgres: {database_url.split('@')[-1] if '@' in database_url else '(url)'}")
        rows = query_postgres(database_url, tcgs, lang)
    else:
        print(f"Using SQLite: {args.db}")
        rows = query_sqlite(args.db, tcgs, lang)

    known = load_manifest_ids()
    jobs = []
    for row in rows:
        cid, name, set_code, set_name, number, rarity, row_lang, url, row_tcg = row
        if cid in known:
            continue
        pid = cid[3:]
        img_url = url.replace("_200w.jpg", f"_{args.size}.jpg")
        dest = image_path(row_tcg, f"{set_code or 'unk'}_{row_lang}", f"tp-{pid}")
        entry = {
            "card_id": cid, "source_id": pid, "tcg": row_tcg, "name": name,
            "set_code": set_code, "set_name": set_name, "card_number": number, "rarity": rarity, "language": row_lang,
            "variant": None, "image_url": url.replace("_200w.jpg", "_in_1000x1000.jpg"),
            "image_path": dest.relative_to(dest.parents[3]).as_posix(),
        }
        jobs.append((entry, dest, img_url))
        if args.max_images and len(jobs) >= args.max_images:
            break
    print(f"\n{len(rows)} products across {', '.join(tcgs)}, {len(known)} already in manifest, {len(jobs)} images to download")

    if not jobs:
        print("Nothing to download.")
        return

    img_session = make_session({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ripnpull/0.1", "Accept": "image/*"})
    img_limiter = RateLimiter(min_interval=0.04)
    done: list[dict] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futs = {ex.submit(download_image, img_session, url, dest, limiter=img_limiter): entry for entry, dest, url in jobs}
        for fut in tqdm(as_completed(futs), total=len(futs), desc="downloading images"):
            entry = futs[fut]
            try:
                ok = fut.result()
            except Exception:  # noqa: BLE001
                ok = False
            if ok:
                done.append(entry)
                if len(done) >= 500:
                    append_manifest(done)
                    done = []
            else:
                failed += 1
    if done:
        append_manifest(done)
    print(f"\nDone: {len(jobs) - failed} downloaded, {failed} failed")


if __name__ == "__main__":
    main()
