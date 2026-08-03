#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate design-reference/index.html from symbols.json.

symbols.json is the source of truth; the HTML is a self-contained viewer built
from it so it can be double-clicked with no server. Edit the JSON, run this.

    py -3.14 design-reference/build-reference.py
"""
from __future__ import annotations

import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "symbols.json"
OUT = HERE / "index.html"

d = json.loads(DATA.read_text(encoding="utf-8"))
shapes = d["shapes"]


def swatch(stat: dict, size: int = 84) -> str:
    path = shapes.get(stat["shape"], shapes["circle"])
    return f"""<figure class="sw">
  <svg viewBox="0 0 100 100" width="{size}" height="{size}" role="img"
       aria-label="{stat['stat']} shown as {stat['reads_as']}">
    <path d="{path}" fill="{stat['rim']}"/>
    <g transform="translate(50 50) scale(0.86) translate(-50 -50)">
      <path d="{path}" fill="{stat['fill']}"/>
    </g>
    <text x="50" y="58" text-anchor="middle" class="num">7</text>
  </svg>
  <figcaption><b>{stat['stat']}</b><span>{stat['reads_as']}</span><em>{stat['position']}</em></figcaption>
</figure>"""


cards = "\n".join(
    f"""<section class="game">
  <h2>{g['game']}</h2>
  <p class="note">{g['note']}</p>
  <div class="row">{''.join(swatch(s) for s in g['stats'])}</div>
  <p class="src">source: <code>{g['source']}</code></p>
</section>"""
    for g in d["games"]
)

conclusions = "\n".join(f"<li>{c}</li>" for c in d["conclusions"])

OUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card stat symbols — reference</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin:0; padding:32px; background:#14121a; color:#efeaf6;
         font:16px/1.55 "Segoe UI",system-ui,sans-serif; }}
  h1 {{ font-size:1.7rem; margin:0 0 6px; }}
  .lede {{ color:#b7aecb; max-width:70ch; margin:0 0 28px; }}
  .game {{ background:#1d1a26; border:1px solid #322c42; border-radius:14px;
           padding:20px 22px; margin:0 0 18px; }}
  h2 {{ font-size:1.15rem; margin:0 0 6px; color:#ffd98a; }}
  .note {{ color:#b7aecb; margin:0 0 16px; max-width:78ch; }}
  .row {{ display:flex; flex-wrap:wrap; gap:26px; }}
  .sw {{ margin:0; text-align:center; }}
  .num {{ fill:#fff; font:700 34px "Segoe UI",sans-serif;
          paint-order:stroke; stroke:rgba(0,0,0,.55); stroke-width:3px; }}
  figcaption {{ display:flex; flex-direction:column; gap:1px; margin-top:6px; font-size:.8rem; }}
  figcaption b {{ text-transform:uppercase; letter-spacing:.06em; }}
  figcaption span {{ color:#b7aecb; }}
  figcaption em {{ color:#7d7391; font-style:normal; font-size:.74rem; }}
  .src {{ color:#7d7391; font-size:.78rem; margin:14px 0 0; }}
  code {{ background:#262032; padding:1px 5px; border-radius:4px; }}
  ul {{ max-width:78ch; }} li {{ margin-bottom:9px; }}
</style></head><body>
<h1>Card stat symbols — how other games make it obvious</h1>
<p class="lede">{d['_about']}</p>
{cards}
<section class="game"><h2>What to take from it</h2><ul>{conclusions}</ul></section>
<p class="src">Generated from <code>symbols.json</code> by <code>build-reference.py</code> — edit the JSON, not this file.</p>
</body></html>
""", encoding="utf-8")
print(f"wrote {OUT.relative_to(HERE.parent)}  ({len(d['games'])} games)")
