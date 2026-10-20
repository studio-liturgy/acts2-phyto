#!/usr/bin/env python3
"""Build public/psalms-seedbed.json from the Seedbed Psalter (psalms.seedbed.com).

The metrical psalms are by Tim and Julie Tennent, free for public worship with
acknowledgement of the source (credited in the Terms), not for commercial use.

  1. Download the 150 posts once (WordPress JSON API) into a cache dir:
       for n in $(seq 1 150); do curl -s \
         "https://psalms.seedbed.com/wp-json/wp/v2/posts?slug=psalm-$n&_fields=slug,title,content" \
         -o "$CACHE/$n.json"; sleep 0.3; done
  2. python3 scripts/seedbed-psalter.py "$CACHE" public/psalms-seedbed.json

One lyric body is one setting (a psalm can have two). The meters and tunes
listed before it are the ways to sing it; the entry's album is the first meter
and tune ("C.M. · Crimond"). Verse numbers are dropped, all-caps headings
(ALEPH) become [Section] labels, and editorial notes are left out.
"""
import json, re, html, os, sys


D = sys.argv[1] if len(sys.argv) > 1 else "seedbed"
TOKEN = re.compile(
    r"\[vc_tta_section title=\W*(.*?)\W*tab_id|\[vc_column_text[^\]]*\](.*?)\[/vc_column_text\]",
    re.S,
)


def tidy(s):
    s = s.replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def body_lines(body):
    t = re.sub(r"<br\s*/?>\s*", "\n", body)
    t = re.sub(r"</p>\s*<p[^>]*>", "\n\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    return [tidy(l) for l in t.split("\n")]


NOTE = re.compile(r"^(This psalm|Note|\*|The metrical setting)", re.I)


def parse(n):
    c = html.unescape(json.load(open(f"{D}/{n}.json"))[0]["content"]["rendered"])
    settings, meters, tunes, notes = [], [], [], []
    for m in TOKEN.finditer(c):
        tune, body = m.group(1), m.group(2)
        if tune:
            tunes.append(tidy(tune))
            continue
        if "<audio" in body or "<img" in body:
            continue
        lines = body_lines(body)
        real = [l for l in lines if l]
        if not real:
            continue
        if len(real) <= 2 and all(len(l) < 60 for l in real):
            meters.append(" ".join(real))
            continue
        stanzas, cur = [], []
        for l in lines + [""]:
            if not l:
                if cur:
                    stanzas.append(cur)
                cur = []
                continue
            if NOTE.match(l) and len(l) > 60:
                notes.append(l)
                continue
            l = re.sub(r"^\d+(?:\s*[/–-]\s*\d+)?\s*(?=\D)", "", l)
            if re.fullmatch(r"[A-Z’' ]{2,20}", l) and not cur:
                stanzas.append(["[" + l.title() + "]"])
                continue
            cur.append(l)
        if not stanzas:
            continue
        if settings and not meters and not tunes:
            # a second lyric body with no tunes of its own continues the last
            settings[-1]["stanzas"] += stanzas
            continue
        settings.append({"meters": meters, "tunes": tunes, "stanzas": stanzas})
        meters, tunes = [], []
    return settings, notes


def to_text(stanzas):
    return "\n\n".join("\n".join(st) for st in stanzas)


def build():
    out = []
    for n in range(1, 151):
        settings, _ = parse(n)
        pend_m, pend_t, keep = [], [], []
        for s in settings:
            # A two-line "body" is a note about meters, not a setting.
            if sum(len(st) for st in s["stanzas"]) <= 2:
                pend_m += s["meters"]
                pend_t += s["tunes"]
                continue
            keep.append(dict(s, meters=pend_m + s["meters"], tunes=pend_t + s["tunes"]))
            pend_m, pend_t = [], []
        for s in keep:
            meter = re.sub(r"\s*\(.*?\)\*?|\*", "", (s["meters"] or [""])[0]).strip()
            meter = re.sub(r"^Alternate setting[,*]?\s*", "", meter).strip()
            tune = re.sub(r"\s*\(.*$", "", s["tunes"][0]).strip() if s["tunes"] else ""
            out.append(
                {
                    "title": f"Psalm {n}",
                    "artist": "Seedbed Psalter",
                    "album": " · ".join(x for x in (meter, tune) if x),
                    "lyrics": to_text(s["stanzas"]),
                }
            )
    return out


if __name__ == "__main__":
    dest = sys.argv[2] if len(sys.argv) > 2 else "public/psalms-seedbed.json"
    data = build()
    with open(dest, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data)} settings -> {dest}")
