"""Mirror the decreate.co Framer site into a self-contained static directory."""
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(sys.argv[1])
SITE = "https://www.decreate.co"
HOSTS = {
    "framerusercontent.com": "_framer",
    "fonts.gstatic.com": "_fonts",
}
PAGES = {"/": "index.html", "/404": "404.html"}
TEXT_EXT = (".mjs", ".js", ".json", ".css", ".html", ".svg")

ABS_RE = re.compile(
    r"https://(framerusercontent\.com|fonts\.gstatic\.com)(/[A-Za-z0-9_./%\-]+)"
)
REL_MOD_RE = re.compile(r"""["'`]\./([A-Za-z0-9_.\-]+\.(?:mjs|js|json))["'`]""")

seen: dict[str, str] = {}
log: list[dict] = []


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 site-mirror"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def local_path(host: str, path: str) -> str:
    return HOSTS[host] + urllib.parse.unquote(path)


def grab(url: str, rel: str) -> None:
    if url in seen:
        return
    seen[url] = rel
    data = fetch(url)
    dest = OUT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    log.append({"url": url, "path": rel, "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()})
    if rel.endswith(TEXT_EXT):
        scan(url, data.decode("utf-8", "replace"))


def scan(url: str, text: str) -> None:
    text = text.replace("\\/", "/")
    for m in ABS_RE.finditer(text):
        host, path = m.group(1), m.group(2)
        if path in ("/",) or path.endswith("/"):
            continue
        grab(f"https://{host}{path}", local_path(host, path))
    if url.endswith((".mjs", ".js")):
        base = url.rsplit("/", 1)[0]
        for m in REL_MOD_RE.finditer(text):
            child = f"{base}/{m.group(1)}"
            host = urllib.parse.urlparse(child).hostname
            grab(child, local_path(host, urllib.parse.urlparse(child).path))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for route, name in PAGES.items():
        try:
            html = fetch(SITE + route).decode("utf-8")
        except urllib.error.HTTPError as e:
            html = e.read().decode("utf-8")
        (OUT / name).write_text(html, encoding="utf-8")
        log.append({"url": SITE + route, "path": name, "bytes": len(html.encode())})
        scan(SITE + route, html)
    for extra in ("sitemap.xml", "robots.txt"):
        data = fetch(f"{SITE}/{extra}")
        (OUT / ".source" ).mkdir(exist_ok=True)
        (OUT / ".source" / extra).write_bytes(data)
    (OUT / ".source" / "manifest.json").write_text(json.dumps(log, indent=1))
    print(f"downloaded {len(log)} files")


if __name__ == "__main__":
    main()
