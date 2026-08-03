"""
Convergence card-render pipeline — renderer.

Composites finished card faces (1500x2100 PNG) from:
  - data/cards.json  (stats/text, from extract_data.py)
  - the raw character art in  ../Raw art for card creation/<N> mana/
  - card_template.html  (the frame design) + bundled fonts/

Frame colour is driven by rarity (rulebook v1.0):
  Mythic=red, Legendary=yellow/gold, Epic=purple, Rare=black.

Run (via uv so Chromium + deps resolve outside the synced folder):
  uv run --python 3.13 --with playwright --with pillow python render_cards.py --cost 10
  uv run ... python render_cards.py --names "Neo,Flash" --out "<dir>"
  uv run ... python render_cards.py --test      # re-render the 2 finished cards for QA
"""
import argparse, base64, html, io, json, re, sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
CARD_ART = HERE.parent                      # .../Card art
RAW_ROOT = CARD_ART / "Raw art for card creation"
DONE_ROOT = CARD_ART / "Completed cards"
TEMPLATE = (HERE / "card_template.html").read_text(encoding="utf-8")

# ---------- per-rarity theme palettes ----------
THEMES = {
    "yellow": dict(  # Legendary — gold + emerald gems (matches Thanos)
        metal_light="#f6e08c", metal_mid="#caa23c", metal_dark="#6f4f12",
        rail_light="#7c6e34", rail_dark="#4a3f18",
        banner_light="#6f6228", banner_dark="#3c3414",
        panel_light="#5f5326", panel_dark="#2e2810",
        badge_light="#ffe9a6", badge_mid="#c89a36", badge_dark="#5e410f",
        gem_light="#9be8b0", gem_mid="#2faa5a", gem_dark="#0f5a2c"),
    "red": dict(     # Mythic — crimson + ruby gems (matches Saitama)
        metal_light="#dd8a70", metal_mid="#9c3327", metal_dark="#561310",
        rail_light="#5a3326", rail_dark="#331a13",
        banner_light="#6e241c", banner_dark="#3a120e",
        panel_light="#5a201a", panel_dark="#2c0f0c",
        badge_light="#f0b3a0", badge_mid="#b23a2e", badge_dark="#5e1410",
        gem_light="#f4a9a0", gem_mid="#c0303a", gem_dark="#6e1019"),
    "purple": dict(  # Epic — amethyst + teal gems (designed to match the set)
        metal_light="#caa0e6", metal_mid="#7d3fa8", metal_dark="#3a1858",
        rail_light="#42295c", rail_dark="#241038",
        banner_light="#4a2668", banner_dark="#26113c",
        panel_light="#3e2058", panel_dark="#1f0f30",
        badge_light="#e0c2f4", badge_mid="#8b46c0", badge_dark="#3f1a5e",
        gem_light="#9be8d6", gem_mid="#1fa6a0", gem_dark="#0c5a52"),
    "black": dict(   # Rare — gunmetal + sapphire gems
        metal_light="#9aa1aa", metal_mid="#474c54", metal_dark="#1b1e23",
        rail_light="#2c2f35", rail_dark="#15171b",
        banner_light="#3a3e45", banner_dark="#1c1e22",
        panel_light="#34383f", panel_dark="#16181c",
        badge_light="#cdd3da", badge_mid="#5a606a", badge_dark="#24272c",
        gem_light="#bfe4ff", gem_mid="#3f7fb0", gem_dark="#163a55"),
    "relic": dict(   # Ascension Relics — radiant teal/cyan (distinct from the 4 rarities)
        metal_light="#bdeffb", metal_mid="#2f9fbe", metal_dark="#0f4c63",
        rail_light="#1f5466", rail_dark="#0d2c38",
        banner_light="#1b6c83", banner_dark="#0c3947",
        panel_light="#174c5d", panel_dark="#0b2733",
        badge_light="#d6f6ff", badge_mid="#34a6c4", badge_dark="#114a5e",
        gem_light="#d8f7ff", gem_mid="#34a6c4", gem_dark="#114a5e"),
}

def theme_vars(color):
    t = THEMES.get(color, THEMES["black"])
    return ";".join(f"--{k.replace('_','-')}:{v}" for k, v in t.items())

# ---------- fonts -> base64 @font-face ----------
def font_faces():
    def b64(name):
        return base64.b64encode((HERE / "fonts" / name).read_bytes()).decode()
    return f"""
@font-face {{ font-family:'Baloo 2'; font-weight:400 800;
  src:url(data:font/ttf;base64,{b64('Baloo2.ttf')}) format('truetype'); }}
@font-face {{ font-family:'Nunito'; font-style:normal; font-weight:200 900;
  src:url(data:font/ttf;base64,{b64('Nunito.ttf')}) format('truetype'); }}
@font-face {{ font-family:'Nunito'; font-style:italic; font-weight:200 900;
  src:url(data:font/ttf;base64,{b64('Nunito-Italic.ttf')}) format('truetype'); }}
"""

# ---------- art location + embedding ----------
def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def find_art(card):
    folder = (RAW_ROOT / "Ascension Relics") if card.get("type") == "relic" \
             else (RAW_ROOT / f"{card['cost']} mana")
    if not folder.is_dir():
        return None
    cn = norm(card["name"])
    best, best_score = None, 0
    for f in folder.iterdir():
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
            continue
        st = norm(f.stem)
        if st == cn:
            return f
        score = 0
        if cn.startswith(st) or st.startswith(cn):
            score = len(st)
        else:  # token overlap
            score = len(set(cn.split()) & set(st.split()))
        if score > best_score:
            best, best_score = f, score
    return best

def trim_letterbox(im, thr=24, max_frac=0.35):
    """Crop near-solid black bars (letterboxing in movie-screenshot sources)
    from the edges. Conservative: only removes rows/cols that are >=96% very
    dark, never more than max_frac of a side."""
    g = im.convert("L")
    w, h = g.size
    sw, sh = min(w, 160), min(h, 160)
    s = g.resize((sw, sh))
    px = s.load()
    row_dark = lambda y: sum(px[x, y] < thr for x in range(sw)) >= sw * 0.96
    col_dark = lambda x: sum(px[x, y] < thr for y in range(sh)) >= sh * 0.96
    top = 0
    while top < sh * max_frac and row_dark(top): top += 1
    bot = sh - 1
    while bot > sh * (1 - max_frac) and row_dark(bot): bot -= 1
    left = 0
    while left < sw * max_frac and col_dark(left): left += 1
    right = sw - 1
    while right > sw * (1 - max_frac) and col_dark(right): right -= 1
    x0, x1 = int(left / sw * w), int((right + 1) / sw * w)
    y0, y1 = int(top / sh * h), int((bot + 1) / sh * h)
    if x1 - x0 >= w * 0.4 and y1 - y0 >= h * 0.4:
        return im.crop((x0, y0, x1, y1))
    return im

def art_data_uri(path, max_dim=1500):
    im = Image.open(path).convert("RGB")
    im = trim_letterbox(im)
    if max(im.size) > max_dim:
        r = max_dim / max(im.size)
        im = im.resize((int(im.size[0]*r), int(im.size[1]*r)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

# ---------- text auto-fit (runs in the page) ----------
FIT_JS = """
() => {
  const fit = (el, box, start, min, dim, allow) => {
    allow = allow || 0;
    let s = start;
    el.style.fontSize = s + 'px';
    const over = () => dim==='w' ? el.scrollWidth > box.clientWidth - allow
                                 : el.scrollHeight > box.clientHeight - allow;
    while (over() && s > min) { s -= 1; el.style.fontSize = s + 'px'; }
  };
  const name = document.querySelector('#banner .name');
  // allow=48 keeps long names clear of the banner's angled chevron ends
  fit(name, document.querySelector('#banner'), 46, 20, 'w', 48);

  // flavour sits in a fixed box anchored to the card bottom; fit it first
  const fl = document.querySelector('#flavor');
  const ftext = document.querySelector('#flavor .ftext');
  fit(ftext, fl, 34, 22, 'h', 4);

  // grow the description box downward so its bottom lands ~6px above the flavour text
  const desc = document.querySelector('#desc');
  const descTop = desc.getBoundingClientRect().top;
  const flavTop = ftext.getBoundingClientRect().top;
  desc.style.height = Math.max(150, (flavTop - 6) - descTop) + 'px';
  document.querySelectorAll('#camp,#align').forEach(r => { r.style.height = desc.style.height; });

  // finally fit the description text to the (now sized) box
  const txt = document.querySelector('#desc .txt');
  fit(txt, desc, 37, 20, 'h', 6);
}
"""

def build_html(card, art_uri):
    eff = html.escape(card["effect"]).replace("\n", "<br>")
    repl = {
        "{{FONT_FACES}}": font_faces(),
        "{{THEME_VARS}}": theme_vars(card["color"]),
        "{{ART}}": art_uri,
        "{{NAME}}": html.escape(card["name"]),
        "{{MANA}}": "" if card.get("cost") is None else str(card["cost"]),
        "{{ATK}}": "" if card.get("atk") is None else str(card["atk"]),
        "{{HP}}": "" if card.get("hp") is None else str(card["hp"]),
        "{{CAMP}}": html.escape(card["camp"]),
        "{{ALIGN}}": html.escape(card["alignment"]),
        "{{EFFECT}}": eff,
        "{{FLAVOR}}": (f'"{html.escape(card["flavor"].strip())}"' if card["flavor"].strip() else ""),
        "{{ORIGIN}}": html.escape(card["origin"]),
    }
    out = TEMPLATE
    for k, v in repl.items():
        out = out.replace(k, v)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cost", type=int)
    ap.add_argument("--names", type=str)
    ap.add_argument("--out", type=str)
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--all-missing", action="store_true",
                    help="render only cards not already in Completed cards/<cost> mana")
    ap.add_argument("--all", action="store_true",
                    help="render every card in the deck (all mana tiers + relics)")
    ap.add_argument("--relics", action="store_true",
                    help="render only the Ascension Relics")
    args = ap.parse_args()

    data = json.load(open(HERE / "data" / "cards.json", encoding="utf-8"))
    cards = data["cards"]

    if args.relics:
        sel = [c for c in cards if c.get("type") == "relic"]
    elif args.all:
        sel = list(cards)
    elif args.names:
        want = [n.strip().lower() for n in args.names.split(",")]
        sel = [c for c in cards if any(w in c["name"].lower() for w in want)]
    elif args.cost is not None:
        sel = [c for c in cards if c["cost"] == args.cost]
    else:
        sel = []

    if not sel:
        print("No cards selected. Use --all, --cost N, or --names 'A,B'."); sys.exit(1)

    def out_dir_for(c):
        if args.test:
            return HERE / "_qa_renders"
        if args.out:
            return Path(args.out)
        if c.get("type") == "relic":
            return DONE_ROOT / "Ascension Relics"
        return DONE_ROOT / f"{c['cost']} mana"

    def fname_for(c):
        base = c["name"].split(" - ")[0].strip()
        base = re.sub(r'[<>:"/\\|?*]', "", base).strip()  # strip Windows-illegal chars
        return base + ".png"

    # skip already-rendered unless --test
    if args.all_missing and not args.test:
        sel = [c for c in sel if not (out_dir_for(c) / fname_for(c)).exists()]

    print(f"Rendering {len(sel)} card(s)...")
    skipped, failed, ok = [], [], 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 750, "height": 1050}, device_scale_factor=2)
        for c in sel:
            art = find_art(c)
            if not art:
                print(f"  !! no art for {c['name']} (cost {c['cost']}) — skipped")
                skipped.append(c); continue
            try:
                d = out_dir_for(c); d.mkdir(parents=True, exist_ok=True)
                page.set_content(build_html(c, art_data_uri(art)), wait_until="load")
                page.evaluate("async () => { await document.fonts.ready; }")
                page.evaluate(FIT_JS)
                page.locator("#canvas").screenshot(path=str(d / fname_for(c)))
                ok += 1
                cl = c["cost"] if c.get("cost") is not None else "-"
                print(f"  ok  [{cl!s:>2}m] {fname_for(c):34} [{c['color']}]  <- {art.name}")
            except Exception as e:
                print(f"  XX FAILED {c['name']} (cost {c['cost']}): {e}")
                failed.append(c)
        browser.close()
    print(f"Done. Rendered {ok}, skipped(no art) {len(skipped)}, failed {len(failed)}.")
    if skipped:
        print("Missing art:", ", ".join(f"{c['name']} ({c['cost']}m)" for c in skipped))
    if failed:
        print("Failed:", ", ".join(f"{c['name']} ({c['cost']}m)" for c in failed))

if __name__ == "__main__":
    main()
