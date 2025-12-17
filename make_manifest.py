import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKS_DIR = ROOT / "packs"

STEMS = ["drums", "bass", "chords", "melody"]

def natural_key(s: str):
  # sort loop_01 before loop_10
  return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def build_pack_manifest(pack_path: Path):
  manifest = {}
  for stem in STEMS:
    files = sorted(
      [p.name for p in pack_path.glob(f"{stem}_loop_*.ogg")],
      key=natural_key
    )
    if files:
      manifest[stem] = files
  return manifest

def main():
  if not PACKS_DIR.exists():
    raise SystemExit("No packs/ folder found next to this script.")

  for pack in sorted([p for p in PACKS_DIR.iterdir() if p.is_dir()], key=lambda p: p.name):
    manifest = build_pack_manifest(pack)
    out = pack / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} ({sum(len(v) for v in manifest.values())} stem files listed)")

if __name__ == "__main__":
  main()
