#!/usr/bin/env python3
"""Extract a one-row-per-VIDEO CSV from the .dta mapping file.

The mapping file (data/raw/00_selected_teachers_rand.dta) is one row per
TEACHER with up to four video columns (video1..video4). The platform imports
one row per video, so this script flattens it.

Which videos count is a study decision (--pick):
  all     every non-empty video cell (947 in the current file)
  first   the first non-empty video per teacher
  video1  strictly the video1 column

Output: data/raw/video_list.csv with header
  filename,sid,tr_id,arm,assignment,subject
The output contains school identifiers — it stays under data/ and is never
committed (data/.gitignore covers it).

Usage:
  <venv>/bin/python scripts/prepare-video-list.py --pick all
Requires pandas (pip install pandas).
"""
import argparse
import csv
import sys

try:
    import pandas as pd
except ImportError:
    sys.exit("pandas is required: python3 -m venv .venv && .venv/bin/pip install pandas")

DTA = "data/raw/00_selected_teachers_rand.dta"
OUT = "data/raw/video_list.csv"
VIDEO_COLS = ["video1", "video2", "video3", "video4"]


def nonempty(v: object) -> str | None:
    s = str(v).strip()
    return s if s and s not in ("nan", "None", ".") else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", choices=["all", "first", "video1"], required=True)
    args = ap.parse_args()

    df = pd.read_stata(DTA)
    rows = []
    for _, r in df.iterrows():
        cells = [nonempty(r[c]) for c in VIDEO_COLS]
        if args.pick == "all":
            chosen = [c for c in cells if c]
        elif args.pick == "first":
            chosen = [next((c for c in cells if c), None)]
            chosen = [c for c in chosen if c]
        else:  # video1
            chosen = [cells[0]] if cells[0] else []
        for filename in chosen:
            rows.append(
                {
                    "filename": filename,
                    "sid": str(r["sid"]),
                    "tr_id": str(r["tr_id"]).strip(),
                    "arm": str(r["school_arm"]).strip(),
                    "assignment": str(r["assignment"]).strip(),
                    "subject": str(r["subject"]).strip(),
                }
            )

    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["filename", "sid", "tr_id", "arm", "assignment", "subject"]
        )
        w.writeheader()
        w.writerows(rows)

    print(f"Wrote {len(rows)} video rows ({args.pick}) from {len(df)} teachers → {OUT}")


if __name__ == "__main__":
    main()
