# decreate website

A static copy of [www.decreate.co](https://www.decreate.co) (a Framer site, published 1 April 2026) and of the decreate studio deck (a [Figma prototype](https://www.figma.com/proto/3BQu5B2JA1FPW3HpCI5Qjv/decreate)), captured on 12 November 2026 for hosting on GitHub Pages.

## Layout

| Path | Contents |
|------|----------|
| `site/` | Everything GitHub Pages serves |
| `site/index.html`, `site/404.html` | The Framer pages as published |
| `site/_framer/` | Framer's JavaScript modules, images and fonts, from framerusercontent.com |
| `site/_fonts/` | Google Fonts files (Inter, Plus Jakarta Sans) |
| `site/deck/` | The studio deck: a slide viewer, every slide at 1920 and 3840 pixels wide, and `decreate-studio-deck.pdf` |
| `tools/` | The scripts that produced `site/` |
| `.github/workflows/pages.yml` | Publishes `site/` on every push to `main` |

## Differences from the live site

- Every asset loads from `site/`; the page contacts no other host.
- "View our deck" opens `deck/` in place of the Figma prototype.
- Framer's analytics script (events.framer.com) is removed.
- Framer's on-page editor bar (framer.com/edit) is disabled.
- The deck is a screenshot of each Figma frame. Slides 2, 3 and 5 animate in a loop in Figma; here each shows one frame. The three links on slide 10 (decreate.co, hello@decreate.co, LinkedIn) are clickable in the viewer and in the PDF; their positions are in `tools/deck_links.json`.

## Preview locally

```bash
python3 -m http.server -d site 8000
```

Then open http://localhost:8000.

## Publish

1. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. Push to `main`. The workflow publishes the site at `https://<owner>.github.io/decreate_website/`.
3. To serve it at www.decreate.co, enter the custom domain under **Settings → Pages** and point the domain's DNS at GitHub Pages, as GitHub's [custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) describes. Until DNS moves, www.decreate.co keeps serving from Framer.

## Refresh the copy

Edits made in Framer or Figma do not reach this repository. To pick them up, rerun the capture and commit the result. It needs Python 3 with Pillow, and Node with Playwright and its Chromium. The Figma capture renders WebGL in software, so it takes about half an hour.

```bash
python3 tools/mirror.py build/raw
```

```bash
python3 tools/localize.py build/raw site ./deck/
```

```bash
node tools/figma_capture.js https://www.figma.com/proto/3BQu5B2JA1FPW3HpCI5Qjv/decreate build/deck-raw
```

Some slides animate in a loop. For those, the capture keeps every distinct frame and `deck_build.py` uses the brightest, which for a build-up animation is the most complete. It prints which frame each slide used. To choose a different one, name it in `build/deck-raw/picks.json`, e.g. `{"3": "frames/slide-03-02.png"}`, and rerun it.

```bash
python3 tools/deck_build.py build/deck-raw site/deck tools/deck_template.html tools/deck_links.json
```

```bash
node tools/deck_pdf.js site/deck site/deck/decreate-studio-deck.pdf 3840 tools/deck_links.json
```

If a slide's layout changes in Figma, re-measure its link areas in `tools/deck_links.json`. Each box is left, top, width and height as percentages of the slide.

`tools/check.js` loads a page in Chromium, lists any request that leaves its origin or fails, and saves a full-page screenshot:

```bash
node tools/check.js http://localhost:8000/ build/check.png 1440
```
