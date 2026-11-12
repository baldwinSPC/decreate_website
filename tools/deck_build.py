"""Choose one frame per slide, encode it as web JPEGs, and write the deck viewer page.

A slide whose frames settled uses its last frame. A slide that kept animating uses the frame
named for it in picks.json ({"3": "frames/slide-03-02.png"}), or else its brightest frame,
which for a build-up animation is the most complete one.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageStat

RAW = Path(sys.argv[1])
OUT = Path(sys.argv[2])
TEMPLATE = Path(sys.argv[3])
LINKS = Path(sys.argv[4]) if len(sys.argv) > 4 else None
QUALITY = 85


def brightness(path: Path) -> float:
    with Image.open(path) as im:
        return ImageStat.Stat(im.convert("L").resize((480, 270))).mean[0]


def choose(slide: dict, picks: dict) -> tuple[Path, str]:
    if str(slide["index"]) in picks:
        return RAW / picks[str(slide["index"])], "picks.json"
    frames = [RAW / f for f in slide["frames"]]
    if slide["still"]:
        return frames[-1], "still"
    return max(frames, key=brightness), f"brightest of {len(frames)} frames"


def main() -> None:
    meta = json.loads((RAW / "slides.json").read_text())
    picks_file = RAW / "picks.json"
    picks = json.loads(picks_file.read_text()) if picks_file.exists() else {}
    for width in (1920, 3840):
        (OUT / "slides" / str(width)).mkdir(parents=True, exist_ok=True)
    for s in meta["slides"]:
        assert s["landed"] == s["nodeId"], f"slide {s['index']} landed on {s['landed']}, not {s['nodeId']}"
        src, why = choose(s, picks)
        name = f"slide-{s['index']:02d}.jpg"
        with Image.open(src) as im:
            im = im.convert("RGB")
            assert im.size == (3840, 2160), f"{src}: unexpected size {im.size}"
            im.save(OUT / "slides" / "3840" / name, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            im.resize((1920, 1080), Image.LANCZOS).save(
                OUT / "slides" / "1920" / name, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        print(f"slide {s['index']:2d}: {src.relative_to(RAW)} ({why})")
    links = json.loads(LINKS.read_text()) if LINKS else {}
    html = (TEMPLATE.read_text()
            .replace("__COUNT__", str(len(meta["slides"])))
            .replace("__LINKS__", json.dumps(links)))
    (OUT / "index.html").write_text(html)
    print(f"wrote {len(meta['slides'])} slides")


if __name__ == "__main__":
    main()
