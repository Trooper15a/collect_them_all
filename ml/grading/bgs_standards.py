"""
BGS (Beckett Grading Services) official grading standards.

Compiled from cardgrading.app and phantomdisplay.com (Sept 2026).
Beckett's own site remains down for maintenance as of Sept 2026.

Each card receives four subgrades (1-10 in 0.5 increments):
  - Centering: border symmetry front and back
  - Corners: sharpness, whitening, fraying under 400x magnification
  - Edges: smoothness, chipping, notching, fraying
  - Surface: scratches, print lines, stains, gloss loss

The overall grade is weighted toward the lowest subgrade.
"""
from __future__ import annotations

# ─── Centering standards ───────────────────────────────────────────
# Expressed as worst-acceptable ratio (larger/smaller border).
# Front and back are graded independently; the worse axis determines the subgrade.
CENTERING = {
    10.0: {"front": "50/50", "front_max_ratio": 50, "back": "60/40", "back_max_ratio": 60,
           "description": "Perfect centering on both axes. Borders appear identical."},
    9.5:  {"front": "55/45", "front_max_ratio": 55, "back": "60/40", "back_max_ratio": 60,
           "description": "Near-perfect. Slight offset acceptable on one axis only."},
    9.0:  {"front": "55/45", "front_max_ratio": 55, "back": "70/30", "back_max_ratio": 70,
           "description": "Borders slightly uneven but not distracting."},
    8.5:  {"front": "60/40", "front_max_ratio": 60, "back": "75/25", "back_max_ratio": 75,
           "description": "Noticeable offset on one axis."},
    8.0:  {"front": "65/35", "front_max_ratio": 65, "back": "80/20", "back_max_ratio": 80,
           "description": "Clearly off-center on at least one axis."},
    7.5:  {"front": "70/30", "front_max_ratio": 70, "back": "85/15", "back_max_ratio": 85,
           "description": "Significantly off-center."},
    7.0:  {"front": "75/25", "front_max_ratio": 75, "back": "90/10", "back_max_ratio": 90,
           "description": "Major centering issues visible at a glance."},
}

# ─── Corner standards ──────────────────────────────────────────────
# Evaluated under 400x magnification. Most common reason for sub-10 grades.
CORNERS = {
    10.0: {
        "description": "No whitening under magnification. No fraying at any tip. "
                       "Factory-sharp points on all four corners. No denting or rounding.",
        "defects_allowed": 0,
    },
    9.5: {
        "description": "One corner may show barely perceptible micro-fraying under 400x. "
                       "No whitening visible to the naked eye.",
        "defects_allowed": 1,
    },
    9.0: {
        "description": "Micro-fraying visible under 400x on one or two corners. "
                       "Slight whitening at one corner may be present.",
        "defects_allowed": 2,
    },
    8.5: {
        "description": "Minor whitening or fraying on two to three corners. "
                       "Soft corner tips acceptable on one corner.",
        "defects_allowed": 3,
    },
    8.0: {
        "description": "Noticeable whitening or slight rounding on multiple corners. "
                       "Light denting from pack or sleeve storage.",
        "defects_allowed": 4,
    },
    7.0: {
        "description": "Visible wear on most corners. Rounding or moderate whitening "
                       "on two or more corners.",
        "defects_allowed": 6,
    },
}

# ─── Edge standards ────────────────────────────────────────────────
EDGES = {
    10.0: {
        "description": "Smooth, chip-free edges all around. No flaking, notching, or discoloration. "
                       "Full original edge integrity.",
        "modern_notes": "Coated paper stock resists roughness. Check white border edge for thin bright chipping lines.",
        "vintage_notes": "Uncoated cardboard edges fray easily. Graded relative to era.",
    },
    9.5: {
        "description": "One edge may show barely perceptible roughness under magnification. "
                       "No chips or nicks visible to the naked eye.",
    },
    9.0: {
        "description": "Minor roughness on one or two edges. Very slight chipping acceptable "
                       "on one edge. Foil borders may show one small nick.",
    },
    8.5: {
        "description": "Light chipping or roughness on two edges. Small nicks in foil borders.",
    },
    8.0: {
        "description": "Noticeable chipping on multiple edges. Some fraying or notching visible.",
    },
    7.0: {
        "description": "Significant edge wear. Multiple edges show chipping, fraying, or "
                       "discoloration. Common on handled vintage cards.",
    },
}

# ─── Surface standards ─────────────────────────────────────────────
# Hardest to self-assess — many defects only visible at 45° under bright light.
SURFACE = {
    10.0: {
        "description": "Free of scratches, print lines, roller marks, ink smears. "
                       "Full original gloss front and back. No staining or fingerprint residue.",
        "inspection_method": "Tilt under lamp at 45° angles, rotate through all angles.",
    },
    9.5: {
        "description": "One barely perceptible surface mark acceptable under magnification. "
                       "Full gloss retained. No print defects.",
    },
    9.0: {
        "description": "Minor surface marks visible under angled light. "
                       "Slight print lines acceptable. Minimal gloss loss in one area.",
    },
    8.5: {
        "description": "Light scratching visible at certain angles. Minor print defects "
                       "or slight staining in one area.",
    },
    8.0: {
        "description": "Multiple light scratches. Noticeable print lines or minor staining. "
                       "Some gloss loss.",
    },
    7.0: {
        "description": "Visible scratches or creasing. Moderate print defects. "
                       "Fingerprint staining or yellowing. Significant gloss loss.",
    },
}

# ─── Overall grade calculation ─────────────────────────────────────
# BGS weights the lowest subgrade heavily. These are approximate rules
# derived from observed grading patterns.
LABEL_COLORS = {
    "black": "Perfect Pristine 10 with all four subgrades at 10.0",
    "gold": "Pristine 10 or Gem Mint 9.5",
    "silver": "All other grades",
}

GRADE_LABELS = {
    10.0: "Pristine",
    9.5: "Gem Mint",
    9.0: "Mint",
    8.5: "NM-MT+",
    8.0: "NM-MT",
    7.5: "NM+",
    7.0: "NM",
    6.5: "EX-MT+",
    6.0: "EX-MT",
    5.5: "EX+",
    5.0: "EX",
    4.5: "VG-EX+",
    4.0: "VG-EX",
    3.5: "VG+",
    3.0: "VG",
    2.5: "G-VG",
    2.0: "Good",
    1.5: "Fair",
    1.0: "Poor",
}


def estimate_overall(centering: float, corners: float, edges: float, surface: float) -> float:
    """
    Estimate the BGS overall grade from four subgrades.

    BGS's exact formula is proprietary, but the overall is heavily weighted
    toward the lowest subgrade. This approximation uses a weighted average
    that pulls toward the minimum.

    Returns a grade in 0.5 increments from 1.0 to 10.0.
    """
    subs = [centering, corners, edges, surface]
    lowest = min(subs)
    avg = sum(subs) / 4

    # BGS pulls the overall toward the lowest subgrade.
    # Observed pattern: if one sub is 0.5+ below the others, overall ≈ lowest + 0.5
    # If all are equal, overall = that value.
    # Weighted: 40% lowest, 20% each of the other three (effectively).
    raw = lowest * 0.40 + avg * 0.60

    # Round to nearest 0.5
    rounded = round(raw * 2) / 2
    return max(1.0, min(10.0, rounded))


def label_color(overall: float, subs: tuple[float, float, float, float]) -> str:
    """Determine the BGS label color from overall grade and subgrades."""
    if overall == 10.0 and all(s == 10.0 for s in subs):
        return "black"
    if overall >= 9.5:
        return "gold"
    return "silver"


def grade_label(grade: float) -> str:
    """Return the text label for a BGS numeric grade."""
    return GRADE_LABELS.get(grade, f"BGS {grade}")
