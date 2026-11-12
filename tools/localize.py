"""Rewrite a raw mirror so every downloaded asset is served from the site itself."""
import json
import re
import shutil
import sys
from pathlib import Path

RAW = Path(sys.argv[1])
OUT = Path(sys.argv[2])
DECK_URL = "https://www.figma.com/proto/3BQu5B2JA1FPW3HpCI5Qjv/decreate"
DECK_LOCAL = sys.argv[3] if len(sys.argv) > 3 else None
OWNED_DIRS = ("_framer", "_fonts")
OWNED_PAGES = ("index.html", "404.html")

ANALYTICS_RE = re.compile(r'<script[^>]*src="https://events\.framer\.com/[^"]*"[^>]*>\s*</script>')
EDITOR_BAR_RE = re.compile(r"EditorBar:i===void 0\?void 0:\(\(\)=>\{.*?import\(`https://framer\.com/edit/init\.mjs`\);return\{default:e\(\)\}\}\)\}\)\(\),")


def main() -> None:
    manifest = json.loads((RAW / ".source" / "manifest.json").read_text())
    assets = sorted(
        (e for e in manifest if e["url"].startswith("https://") and "sha256" in e),
        key=lambda e: len(e["url"]),
        reverse=True,
    )
    for owned in OWNED_DIRS:
        if (OUT / owned).exists():
            shutil.rmtree(OUT / owned)
    shutil.copytree(RAW, OUT, ignore=shutil.ignore_patterns(".source"), dirs_exist_ok=True)

    rewritten = 0
    targets = [OUT / p for p in OWNED_PAGES] + [f for d in OWNED_DIRS for f in (OUT / d).rglob("*")]
    for f in targets:
        if f.suffix not in (".html", ".mjs", ".json"):
            continue
        text = f.read_text(encoding="utf-8")
        before = text
        for e in assets:
            local = "./" + e["path"]
            text = text.replace(e["url"], local)
            text = text.replace(e["url"].replace("/", "\\/"), local.replace("/", "\\/"))
        if f.suffix == ".html":
            text, n = ANALYTICS_RE.subn("", text)
            assert n == 1, f"{f}: expected one analytics tag, found {n}"
        if f.name.startswith("script_main."):
            text, n = EDITOR_BAR_RE.subn("EditorBar:void 0,", text)
            assert n == 1, f"{f}: expected one editor bar loader, found {n}"
        if DECK_LOCAL:
            text = text.replace(DECK_URL, DECK_LOCAL)
        if text != before:
            f.write_text(text, encoding="utf-8")
            rewritten += 1
    (OUT / ".nojekyll").write_text("")
    print(f"rewrote {rewritten} files")


if __name__ == "__main__":
    main()
