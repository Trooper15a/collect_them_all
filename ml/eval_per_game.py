"""Evaluate scanner accuracy per TCG using the trained PyTorch model.

Applies phone-camera-style augmentations to query images (perspective warp,
rotation, color jitter, glare, blur) so the eval reflects real-world scanner
accuracy, not just self-matching.

    python eval_per_game.py [--samples 200]
"""
from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict

import numpy as np
import torch
from PIL import Image
from tqdm import tqdm

from config import ARTIFACTS_DIR, DATA_DIR, EMBED_DIM, IMAGE_SIZE, MANIFEST_PATH, WEB_MODEL_DIR
from dataset import positive_tf, resolve_image
from model import MEAN, STD, load_checkpoint


def preprocess_augmented(img: Image.Image, tf) -> torch.Tensor:
    return tf(img)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=200, help="cards to test per TCG")
    ap.add_argument("--checkpoint", default=str(ARTIFACTS_DIR / "card_embedder.pt"))
    args = ap.parse_args()

    # Load index (for card IDs and reference embeddings)
    index = json.loads((WEB_MODEL_DIR / "index.json").read_text(encoding="utf-8"))
    vecs = np.fromfile(WEB_MODEL_DIR / "embeddings.bin", dtype=np.float16).reshape(-1, index["dim"]).astype(np.float32)

    id_to_idx: dict[str, int] = {}
    for i, c in enumerate(index["cards"]):
        id_to_idx[c["id"]] = i

    # Load model for augmented inference
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_checkpoint(args.checkpoint, device)
    tf = positive_tf()

    # Load manifest
    rows = []
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    by_tcg: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["card_id"] in id_to_idx:
            p = resolve_image(r)
            if p.exists():
                by_tcg[r["tcg"]].append(r)

    print(f"Evaluating {args.samples} augmented samples per TCG across {len(by_tcg)} games")
    print(f"Index: {len(index['cards'])} cards | Model device: {device}")
    print(f"Augmentations: perspective, rotation, crop, color jitter, glare, blur\n")
    print(f"{'TCG':<16} {'Samples':>7} {'R@1':>7} {'R@5':>7}  {'Misses'}")
    print("-" * 58)

    total_r1 = 0
    total_r5 = 0
    total_n = 0
    all_misses: list[tuple[str, str, str]] = []

    for tcg in sorted(by_tcg.keys()):
        pool = by_tcg[tcg]
        sample = random.sample(pool, min(args.samples, len(pool)))
        r1 = 0
        r5 = 0
        misses: list[str] = []

        for row in tqdm(sample, desc=tcg, leave=False):
            img = Image.open(resolve_image(row)).convert("RGB")
            x = preprocess_augmented(img, tf).unsqueeze(0).to(device)
            with torch.no_grad(), torch.autocast(device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                q = model(x).float().cpu().numpy()[0]

            sims = vecs @ q
            top5 = np.argsort(-sims)[:5]
            expected_idx = id_to_idx[row["card_id"]]

            if top5[0] == expected_idx:
                r1 += 1
            else:
                got = index["cards"][top5[0]]
                misses.append(f"{row.get('name','?')} -> {got.get('name','?')} ({got['tcg']})")
            if expected_idx in top5:
                r5 += 1

        n = len(sample)
        total_r1 += r1
        total_r5 += r5
        total_n += n
        miss_str = f"  {len(misses)} miss" if misses else ""
        print(f"{tcg:<16} {n:>7} {r1/n*100:>6.1f}% {r5/n*100:>6.1f}%{miss_str}")
        for m in misses[:3]:
            all_misses.append((tcg, m, ""))
            print(f"  {'':>16} {m}")

    print("-" * 58)
    print(f"{'OVERALL':<16} {total_n:>7} {total_r1/total_n*100:>6.1f}% {total_r5/total_n*100:>6.1f}%")

    if all_misses:
        print(f"\n{len(all_misses)} sample misidentifications shown above (up to 3 per TCG)")


if __name__ == "__main__":
    main()
