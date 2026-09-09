"""Rebuild the full scanner index from all manifest entries.

Computes embeddings for every card in the manifest using the trained model
and writes index.json + embeddings.bin to web/public/model/.

    python rebuild_index.py
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from config import ARTIFACTS_DIR, EMBED_DIM, MODEL_VERSION, WEB_MODEL_DIR
from dataset import CardImages, read_manifest, resolve_image
from model import load_checkpoint


def card_entry(row: dict) -> dict:
    return {
        "id": row["card_id"],
        "name": row.get("name"),
        "set": row.get("set_code"),
        "setName": row.get("set_name"),
        "num": row.get("card_number"),
        "tcg": row.get("tcg"),
        "lang": row.get("language"),
        "src": row.get("source_id"),
        "img": row.get("image_url"),
    }


@torch.no_grad()
def compute_embeddings(model, rows: list[dict], device: torch.device,
                       batch_size: int = 128) -> np.ndarray:
    loader = DataLoader(CardImages(rows), batch_size=batch_size, shuffle=False,
                        num_workers=4, pin_memory=device.type == "cuda")
    out = np.zeros((len(rows), EMBED_DIM), dtype=np.float32)
    for x, idx in tqdm(loader, desc="computing embeddings"):
        with torch.autocast(device.type, dtype=torch.float16,
                            enabled=device.type == "cuda"):
            z = model(x.to(device)).float().cpu().numpy()
        out[idx.numpy()] = z
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ARTIFACTS_DIR / "card_embedder.pt"))
    ap.add_argument("--batch-size", type=int, default=128)
    args = ap.parse_args()

    rows = read_manifest()
    valid = [r for r in rows if resolve_image(r).exists()]
    print(f"manifest: {len(rows)} entries, {len(valid)} with images on disk")

    tcg_counts = Counter(r["tcg"] for r in valid)
    for tcg, cnt in tcg_counts.most_common():
        print(f"  {tcg}: {cnt}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")
    model = load_checkpoint(args.checkpoint, device)

    vecs = compute_embeddings(model, valid, device, args.batch_size)
    vecs_f16 = vecs.astype(np.float16)

    WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    bin_path = WEB_MODEL_DIR / "embeddings.bin"
    index_path = WEB_MODEL_DIR / "index.json"

    vecs_f16.tofile(bin_path)
    index_path.write_text(json.dumps({
        "model_version": MODEL_VERSION,
        "dim": EMBED_DIM,
        "count": len(valid),
        "cards": [card_entry(r) for r in valid],
    }, ensure_ascii=False), encoding="utf-8")

    print(f"\nindex rebuilt: {len(valid)} cards across {len(tcg_counts)} TCGs")
    print(f"  {bin_path} ({bin_path.stat().st_size / 1e6:.1f} MB)")
    print(f"  {index_path} ({index_path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
