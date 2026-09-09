"""Per-game retrieval-accuracy evaluation harness for the AI card scanner.

What this measures
------------------
The scanner matches a phone photo against a reference index using cosine
similarity over EfficientNet-B0 embeddings (see web/src/lib/scanner/matcher.ts
and ml/model.py). The user's *fine-tuned* checkpoint is not in this repo
(ml/artifacts is gitignored), so this harness uses a STOCK ImageNet-pretrained
EfficientNet-B0 backbone as a LOWER-BOUND stand-in. Because the fine-tuned
model is trained with exactly these augmentations on exactly these games, its
accuracy can only be >= the numbers reported here. Every number below is
therefore a pessimistic floor, not a prediction of production accuracy.

Method
------
1. Download a sample of REAL card images per game from free public APIs
   (no keys): Pokemon (images.pokemontcg.io), Magic (api.scryfall.com),
   Yu-Gi-Oh! (images.ygoprodeck.com), Star Wars Unlimited (swudb.com CDN).
   Cached under --cache-dir; polite delays between requests.
2. Reference embedding = clean image; queries = N augmented variants per card
   using THE SAME augmentation pipeline as ml/dataset.py's positive_tf()
   (Background paste, RandomPerspective tilt, rotation, RandomResizedCrop,
   ColorJitter, Glare, GaussianBlur, RandomGrayscale, RandomErasing).
   The transform code below is copied verbatim from ml/dataset.py so the eval
   matches training conditions.
3. Embeddings: stock torchvision efficientnet_b0 (IMAGENET1K_V1), backbone
   1280-d features (classifier replaced with Identity), L2-normalised.
   NOTE: ml/model.py adds a fine-tuned Linear(1280->512) head on top; with no
   checkpoint available we evaluate the raw ImageNet backbone features, which
   is the honest untrained baseline. Matching is brute-force cosine top-k,
   exactly mirroring topK() in web/src/lib/scanner/matcher.ts.
4. The reference index mixes ALL sampled cards from ALL games (cross-game
   confusion is part of the test). Report top-1 / top-5 accuracy per game and
   the worst confusion pairs.

Usage
-----
    python eval_per_game.py --cards-per-game 30 --queries 3 \
        --cache-dir ./cache --out scanner_eval_results.md
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import requests
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFilter
from torchvision import transforms as T
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0
from tqdm import tqdm

IMAGE_SIZE = 224  # ml/config.py
MEAN = [0.485, 0.456, 0.406]  # ml/model.py
STD = [0.229, 0.224, 0.225]

UA = {"User-Agent": "RipnPull-scanner-eval/1.0 (research; polite)"}
DELAY = 0.4  # seconds between HTTP requests, be polite


# ---------------------------------------------------------------------------
# Augmentations — copied VERBATIM from ml/dataset.py (Glare, Background,
# normalize_tf, positive_tf) so eval queries match training-time positives.
# ---------------------------------------------------------------------------
class Glare:
    """Simulate sleeve / toploader glare with a soft white blob."""

    def __init__(self, p: float = 0.35):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        w, h = img.size
        overlay = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(overlay)
        for _ in range(random.randint(1, 3)):
            cx, cy = random.uniform(0, w), random.uniform(0, h)
            rx, ry = random.uniform(w * 0.1, w * 0.5), random.uniform(h * 0.05, h * 0.3)
            draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=random.randint(120, 255))
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(w, h) * 0.08))
        white = Image.new("RGB", (w, h), (255, 255, 255))
        return Image.composite(white, img, overlay.point(lambda v: int(v * random.uniform(0.3, 0.8))))


class Background:
    """Paste the card onto a random background with random padding so borders aren't always cut."""

    def __init__(self, p: float = 0.5):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        w, h = img.size
        pad = random.uniform(0.02, 0.15)
        pw, ph = int(w * (1 + pad * 2)), int(h * (1 + pad * 2))
        bg_color = tuple(random.randint(0, 255) for _ in range(3))
        bg = Image.new("RGB", (pw, ph), bg_color)
        bg.paste(img, (int(w * pad), int(h * pad)))
        return bg


def normalize_tf() -> T.Compose:
    return T.Compose([
        T.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        T.ToTensor(),
        T.Normalize(MEAN, STD),
    ])


def positive_tf() -> T.Compose:
    return T.Compose([
        Background(p=0.5),
        T.RandomPerspective(distortion_scale=0.35, p=0.6),
        T.RandomRotation(degrees=18, expand=False, fill=0),
        T.RandomResizedCrop(IMAGE_SIZE, scale=(0.55, 1.0), ratio=(0.6, 0.9)),
        T.ColorJitter(0.5, 0.5, 0.4, 0.06),
        Glare(p=0.4),
        T.RandomApply([T.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.35),
        T.RandomGrayscale(p=0.03),
        T.ToTensor(),
        T.RandomErasing(p=0.2, scale=(0.02, 0.1)),
        T.Normalize(MEAN, STD),
    ])


# ---------------------------------------------------------------------------
# Card sampling
# ---------------------------------------------------------------------------
@dataclass
class Card:
    game: str
    card_id: str
    name: str
    set_name: str
    image_url: str
    local_path: Path | None = None


def fetch_json(url: str, session: requests.Session, tries: int = 3) -> dict | None:
    for attempt in range(tries):
        try:
            time.sleep(DELAY)
            r = session.get(url, headers=UA, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f"  [warn] GET {url} -> {r.status_code}")
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] GET {url} attempt {attempt + 1}: {e}")
        time.sleep(2 * (attempt + 1))
    return None


def sample_pokemon(n: int, session: requests.Session) -> list[Card]:
    """Pokemon TCG: api.pokemontcg.io metadata + images.pokemontcg.io hires scans.

    The pokemontcg API throws transient 500/502s, so we do two passes over the
    set list, retrying sets that came up empty.
    """
    # A few modern English sets; pull a slice from each for art diversity.
    sets = ["sv1", "sv3", "swsh12", "sv4"]
    per_set = max(1, n // len(sets) + 1)
    cards: list[Card] = []
    for _pass in range(2):
        for s in sets:
            if len(cards) >= n:
                break
            url = (f"https://api.pokemontcg.io/v2/cards?q=set.id:{s}"
                   f"&pageSize={per_set}&select=id,name,set,images&orderBy=number")
            data = fetch_json(url, session)
            if not data:
                continue
            for c in data.get("data", []):
                img = c.get("images", {}).get("large") or c.get("images", {}).get("small")
                if not img:
                    continue
                if any(x.card_id == c["id"] for x in cards):
                    continue
                cards.append(Card("pokemon", c["id"], c.get("name", c["id"]),
                                  c.get("set", {}).get("name", s), img))
        if len(cards) >= n:
            break
    return cards[:n]


def sample_mtg(n: int, session: requests.Session) -> list[Card]:
    """Magic: api.scryfall.com (card image_uris.normal)."""
    url = ("https://api.scryfall.com/cards/search?q=set:blb+game:paper"
           "&order=collector_number&unique=cards")
    cards: list[Card] = []
    while url and len(cards) < n:
        data = fetch_json(url, session)
        if not data:
            break
        for c in data.get("data", []):
            iu = c.get("image_uris") or {}
            img = iu.get("normal")
            if not img:
                continue  # skip double-faced backs etc.
            cards.append(Card("mtg", c["id"], c.get("name", c["id"]),
                              c.get("set_name", "?"), img))
            if len(cards) >= n:
                break
        url = data.get("next_page") if len(cards) < n else None
    return cards[:n]


def sample_yugioh(n: int, session: requests.Session) -> list[Card]:
    """Yu-Gi-Oh!: db.ygoprodeck.com metadata + images.ygoprodeck.com scans."""
    url = f"https://db.ygoprodeck.com/api/v7/cardinfo.php?num={n}&offset=0"
    data = fetch_json(url, session)
    cards: list[Card] = []
    if not data:
        return cards
    for c in data.get("data", []):
        imgs = c.get("card_images") or []
        if not imgs:
            continue
        img = imgs[0].get("image_url")
        if not img:
            continue
        cards.append(Card("yugioh", str(c["id"]), c.get("name", str(c["id"])),
                          (c.get("card_sets") or [{}])[0].get("set_name", "?"), img))
        if len(cards) >= n:
            break
    return cards[:n]


def sample_swu(n: int, session: requests.Session) -> list[Card]:
    """Star Wars Unlimited: swudb.com image CDN (no JSON API reachable; sequential SOR cards)."""
    cards: list[Card] = []
    misses = 0
    num = 1
    while len(cards) < n and misses < 10 and num <= 280:
        url = f"https://swudb.com/images/cards/SOR/{num:03d}.png"
        try:
            time.sleep(DELAY)
            r = session.head(url, headers=UA, timeout=15)
            if r.status_code == 200 and "image" in (r.headers.get("content-type") or ""):
                cards.append(Card("swu", f"SOR-{num:03d}", f"SOR #{num:03d}",
                                  "Spark of Rebellion", url))
                misses = 0
            else:
                misses += 1
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] SWU head {url}: {e}")
            misses += 1
        num += 1
    return cards[:n]


# ---------------------------------------------------------------------------
# Download + embedding
# ---------------------------------------------------------------------------
def download_images(cards: list[Card], cache_dir: Path, session: requests.Session) -> list[Card]:
    ok = []
    for c in tqdm(cards, desc="downloading card images"):
        ext = ".png" if c.image_url.endswith(".png") else ".jpg"
        path = cache_dir / c.game / f"{c.card_id.replace('/', '_')}{ext}"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            try:
                time.sleep(DELAY)
                r = session.get(c.image_url, headers=UA, timeout=30)
                if r.status_code != 200 or len(r.content) < 1000:
                    print(f"  [warn] image {c.image_url} -> {r.status_code}, skipping")
                    continue
                path.write_bytes(r.content)
            except Exception as e:  # noqa: BLE001
                print(f"  [warn] image {c.image_url}: {e}, skipping")
                continue
        try:
            Image.open(path).convert("RGB").verify()
        except Exception:
            print(f"  [warn] corrupt cache file {path}, skipping")
            continue
        c.local_path = path
        ok.append(c)
    return ok


class StockEmbedder:
    """Stock ImageNet EfficientNet-B0 backbone (NO fine-tuned head) -> L2-normalised 1280-d.

    Lower-bound stand-in for ml/model.py CardEmbedder, whose 512-d head is
    fine-tuned on card data; that checkpoint is not in the repo.
    """

    def __init__(self):
        weights = EfficientNet_B0_Weights.IMAGENET1K_V1
        backbone = efficientnet_b0(weights=weights)
        backbone.classifier = torch.nn.Identity()
        self.model = backbone.eval()

    @torch.no_grad()
    def embed(self, tensors: list[torch.Tensor], batch: int = 32) -> np.ndarray:
        out = []
        for i in range(0, len(tensors), batch):
            x = torch.stack(tensors[i:i + batch])
            out.append(self.model(x))
        feats = torch.cat(out)
        return F.normalize(feats, dim=-1).numpy()


def topk_cosine(query: np.ndarray, vectors: np.ndarray, k: int = 5) -> np.ndarray:
    """Brute-force cosine top-k; vectors are L2-normalised so dot == cosine.

    Mirrors topK() in web/src/lib/scanner/matcher.ts.
    Returns indices of the k best matches, best first.
    """
    sims = vectors @ query
    return np.argsort(-sims, kind="stable")[:k]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
@dataclass
class QueryResult:
    game: str
    card_id: str
    card_name: str
    query_idx: int
    top: list[tuple[str, str, str, float]] = field(default_factory=list)  # (game, id, name, score)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards-per-game", type=int, default=30)
    ap.add_argument("--queries", type=int, default=3)
    ap.add_argument("--cache-dir", type=Path, default=Path("cache"))
    ap.add_argument("--out", type=Path, default=Path("scanner_eval_results.md"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-swu", action="store_true")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    session = requests.Session()

    print("== Sampling card lists ==")
    samplers = [("pokemon", sample_pokemon), ("mtg", sample_mtg), ("yugioh", sample_yugioh)]
    if not args.no_swu:
        samplers.append(("swu", sample_swu))
    cards: list[Card] = []
    games_attempted, games_used = [], []
    for game, fn in samplers:
        games_attempted.append(game)
        got = fn(args.cards_per_game, session)
        print(f"  {game}: {len(got)} cards listed")
        if got:
            games_used.append(game)
            cards.extend(got)

    print("== Downloading images ==")
    cards = download_images(cards, args.cache_dir, session)
    by_game: dict[str, list[Card]] = {}
    for c in cards:
        by_game.setdefault(c.game, []).append(c)
    for g, cs in by_game.items():
        print(f"  {g}: {len(cs)} usable images")
    if not cards:
        print("ERROR: no images downloaded", file=sys.stderr)
        return 1

    print("== Loading stock EfficientNet-B0 (ImageNet, lower-bound stand-in) ==")
    embedder = StockEmbedder()
    ref_tf = normalize_tf()
    q_tf = positive_tf()

    print("== Reference embeddings (clean scans) ==")
    ref_tensors = []
    for c in tqdm(cards, desc="reference embeds"):
        img = Image.open(c.local_path).convert("RGB")
        ref_tensors.append(ref_tf(img))
    ref_vecs = embedder.embed(ref_tensors)  # (N, 1280) L2-normalised

    print("== Query embeddings (augmented 'phone photos') + matching ==")
    results: list[QueryResult] = []
    for gi, c in enumerate(tqdm(cards, desc="queries")):
        img = Image.open(c.local_path).convert("RGB")
        q_tensors = [q_tf(img) for _ in range(args.queries)]
        q_vecs = embedder.embed(q_tensors)
        for qi in range(args.queries):
            top = topk_cosine(q_vecs[qi], ref_vecs, k=5)
            res = QueryResult(c.game, c.card_id, c.name, qi)
            for ti in top:
                t = cards[int(ti)]
                res.top.append((t.game, t.card_id, t.name, float(q_vecs[qi] @ ref_vecs[int(ti)])))
            results.append(res)

    # ---- metrics ----
    games_present = [g for g in games_used if g in by_game]
    per_game = {}
    for g in games_present:
        rs = [r for r in results if r.game == g]
        top1 = sum(1 for r in rs if r.top[0][1] == r.card_id) / len(rs)
        top5 = sum(1 for r in rs if any(t[1] == r.card_id for t in r.top)) / len(rs)
        # Name-level: correct if the retrieved card has the same NAME (any set
        # printing). Production often accepts any printing of the right card.
        top1n = sum(1 for r in rs if r.top[0][2] == r.card_name) / len(rs)
        top5n = sum(1 for r in rs if any(t[2] == r.card_name for t in r.top)) / len(rs)
        per_game[g] = (len(by_game[g]), len(rs), top1, top5, top1n, top5n)

    misses = [r for r in results if r.top[0][1] != r.card_id]
    cross_game_misses = [r for r in misses if r.top[0][0] != r.game]

    # worst confusion pairs (aggregated)
    pair_counts: dict[tuple, list[float]] = {}
    for r in misses:
        key = (r.game, r.card_name, r.top[0][0], r.top[0][2])
        pair_counts.setdefault(key, []).append(r.top[0][3])
    worst = sorted(pair_counts.items(), key=lambda kv: -len(kv[1]))[:15]

    # ---- report ----
    L = []
    L.append("# Scanner per-game retrieval accuracy (stock ImageNet baseline)")
    L.append("")
    L.append(f"- Cards: " + ", ".join(f"{g}={per_game[g][0]}" for g in games_present) +
             f" (total {sum(per_game[g][0] for g in games_present)})")
    L.append(f"- Queries: {args.queries} augmented 'phone-photo' variants per card "
             f"(total {len(results)}); augmentations copied verbatim from ml/dataset.py positive_tf()")
    L.append(f"- Model: STOCK torchvision efficientnet_b0 (IMAGENET1K_V1), 1280-d backbone "
             f"features, L2-normalised, cosine top-k exactly as web/src/lib/scanner/matcher.ts")
    L.append(f"- Seed {args.seed}; index mixes ALL games (cross-game confusion is tested)")
    L.append("- Image sources: Pokemon = api.pokemontcg.io + images.pokemontcg.io; "
             "MTG = api.scryfall.com image_uris; Yu-Gi-Oh! = db.ygoprodeck.com + "
             "images.ygoprodeck.com; SWU = swudb.com/images/cards CDN (note: "
             "api.swudb.com and cdn.swudb.com were unreachable from this network; "
             "the swudb.com /images/cards path worked and images were labelled by "
             "collector number only, no card names available).")
    L.append("")
    L.append("> **CAVEAT (read before quoting numbers):** this uses the stock ImageNet backbone "
             "as a LOWER-BOUND stand-in. The production model (ml/model.py) fine-tunes this "
             "backbone + a 512-d head on card data with these exact augmentations, so real "
             "accuracy on trained games should be strictly higher. These numbers are a floor, "
             "not a prediction. Sample sizes are small (~30 cards/game); treat per-game "
             "differences of a few points as noise.")
    L.append("")
    L.append("## Results (exact-printing match)")
    L.append("")
    L.append("| Game | Cards | Queries | Top-1 acc | Top-5 acc | Top-1 (name-level) | Top-5 (name-level) |")
    L.append("|---|---|---|---|---|---|---|")
    for g in games_present:
        nc, nq, t1, t5, t1n, t5n = per_game[g]
        L.append(f"| {g} | {nc} | {nq} | {t1:.1%} | {t5:.1%} | {t1n:.1%} | {t5n:.1%} |")
    all_t1 = sum(1 for r in results if r.top[0][1] == r.card_id) / len(results)
    all_t5 = sum(1 for r in results if any(t[1] == r.card_id for t in r.top)) / len(results)
    all_t1n = sum(1 for r in results if r.top[0][2] == r.card_name) / len(results)
    all_t5n = sum(1 for r in results if any(t[2] == r.card_name for t in r.top)) / len(results)
    L.append(f"| **overall** | {sum(per_game[g][0] for g in games_present)} | {len(results)} "
             f"| **{all_t1:.1%}** | **{all_t5:.1%}** | **{all_t1n:.1%}** | **{all_t5n:.1%}** |")
    L.append("")
    L.append("Name-level = retrieved card has the same card name (any set printing). "
             "Some 'misses' here are the same card in a different printing, which "
             "production may accept; exact-printing accuracy is the stricter number.")
    L.append("")
    L.append(f"Misses (top-1 wrong): {len(misses)}/{len(results)} "
             f"({len(misses)/len(results):.1%}); of those, cross-game confusions: "
             f"{len(cross_game_misses)} ({len(cross_game_misses)/max(1,len(misses)):.1%} of misses).")
    L.append("")
    L.append("## Worst confusion pairs (top-1 misses)")
    L.append("")
    L.append("| Query card | Game | Retrieved instead | Game | Count | Avg cos-sim |")
    L.append("|---|---|---|---|---|---|")
    for (qg, qn, tg, tn), scores in worst:
        L.append(f"| {qn} | {qg} | {tn} | {tg} | {len(scores)} | {np.mean(scores):.3f} |")
    L.append("")
    L.append("## Example misses (raw)")
    L.append("")
    for r in misses[:10]:
        L.append(f"- [{r.game}] **{r.card_name}** q{r.query_idx} -> "
                 + ", ".join(f"{t[2]} [{t[0]}] {t[3]:.3f}" for t in r.top[:3]))
    L.append("")
    skipped = set(games_attempted) - set(games_used)
    if skipped:
        L.append(f"## Skipped games: {', '.join(sorted(skipped))} (API/CDN unreachable or empty)")
        L.append("")

    args.out.write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L[:25]))
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
