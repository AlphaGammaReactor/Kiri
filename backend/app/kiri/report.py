"""Notebook report: the project's notebook entries as a PDF or a self-contained HTML file.

Figures are the SVGs the app sent to the notebook, so they stay vector in both
formats. Headings come translated from the app (`labels`).
"""

from __future__ import annotations

import html
import io
import os
import re
from datetime import datetime

DEFAULT_LABELS = {
    "question": "Question", "reliability": "Reliability", "note": "Note", "generated": "Made with Kiri",
    "pass": "pass", "caution": "caution", "problem": "problem", "data": "Data",
}


def _when(ts: str) -> str:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return ts


def _checks_line(checks: list, L: dict) -> str:
    n = {k: sum(1 for c in checks if c.get("status") == k) for k in ("pass", "caution", "problem")}
    return f"{L['reliability']}: {n['pass']} {L['pass']}, {n['caution']} {L['caution']}, {n['problem']} {L['problem']}"


def build(fmt: str, title: str, project: dict, notes: list, labels: dict, intro: list[str] | None = None) -> bytes:
    L = DEFAULT_LABELS | {k: v for k, v in labels.items() if isinstance(v, str)}
    intro = [x for x in (intro or []) if isinstance(x, str) and x.strip()]
    if fmt == "docx":
        return _docx(title, project, notes, L, intro)
    return _pdf(title, project, notes, L, intro) if fmt == "pdf" else _html(title, project, notes, L, intro)


def _flatten_opacity(svg: str) -> str:
    """Bitmap rendering ignores fill-opacity, so blend translucent fills with the white background."""
    def tag(m: re.Match) -> str:
        t = m.group(0)
        op = re.search(r'fill-opacity="([0-9.]+)"', t)
        col = re.search(r'fill="#([0-9a-fA-F]{6})"', t)
        if not (op and col):
            return t
        a = float(op.group(1))
        rgb = [int(col.group(1)[i:i + 2], 16) for i in (0, 2, 4)]
        mixed = "".join(f"{round(255 - (255 - c) * a):02x}" for c in rgb)
        return t.replace(col.group(0), f'fill="#{mixed}"').replace(op.group(0), "")
    return re.sub(r"<[^>]+>", tag, svg)


def svg_drawing(svg: str, bitmap: bool = False):
    """An app SVG as a ReportLab drawing. svglib cannot pick fonts per glyph, so a figure
    with Chinese text is drawn entirely in the CJK font."""
    from svglib.svglib import svg2rlg

    svg = svg.split("?>", 1)[-1]
    if bitmap:
        svg = _flatten_opacity(svg)
    if _CJK.search(svg):
        font = _cjk_font()
        svg = re.sub(r'font-family="[^"]*"', f'font-family="{font}"', svg)
        svg = re.sub(r"font-family:[^;\"]*", f"font-family:{font}", svg)
    return svg2rlg(io.BytesIO(svg.encode("utf-8")))


def _docx(title: str, project: dict, notes: list, L: dict, intro: list[str]) -> bytes:
    """A Word document students can keep editing: headings, figures as 300 dpi pictures, captions."""
    from docx import Document
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor
    from reportlab.graphics import renderPM

    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "PingFang SC")  # Chinese text in Word on Mac; Word substitutes elsewhere
    grey = RGBColor(0x57, 0x51, 0x4A)

    def meta(text: str):
        r = doc.add_paragraph().add_run(text)
        r.font.size = Pt(9)
        r.font.color.rgb = grey

    doc.add_heading(title, level=0)
    if project.get("question") and project["question"].strip() != title.strip():
        meta(f"{L['question']}: {project['question']}")
    for x in intro:
        meta(x)
    fig = 0
    for n in notes:
        b = n["body"]
        doc.add_heading(b.get("title") or (L["note"] if n["kind"] == "text" else ""), level=2)
        meta(_when(n["created_at"]))
        if b.get("svg"):
            fig += 1
            try:
                d = svg_drawing(b["svg"], bitmap=True)
                if d is not None:
                    png = renderPM.drawToString(d, fmt="PNG", dpi=300)
                    doc.add_picture(io.BytesIO(png), width=Inches(min(6.3, d.width / 72)))
            except Exception:  # noqa: BLE001 - a figure that cannot be drawn is left out, the text stays
                pass
        if b.get("caption"):
            p = doc.add_paragraph()
            r = p.add_run(_renumber(b["caption"], fig))
            r.font.size = Pt(9)
            r.italic = True
        for key in ("summary", "text"):
            if b.get(key):
                doc.add_paragraph(b[key])
        if b.get("checks"):
            meta(_checks_line(b["checks"], L))
    meta(L["generated"])
    buf = io.BytesIO()
    doc.core_properties.title = title
    doc.save(buf)
    return buf.getvalue()


def _html(title: str, project: dict, notes: list, L: dict, intro: list[str]) -> bytes:
    e = html.escape
    parts = [f"<!doctype html><html><head><meta charset='utf-8'><title>{e(title)}</title><style>"
             "body{font-family:-apple-system,'PingFang SC',Helvetica,Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#1e1c18;line-height:1.5}"
             "h1{font-family:Georgia,'Songti SC',serif;font-weight:400}h2{font-size:17px;margin:28px 0 4px}"
             ".meta{color:#57514a;font-size:13px}.fig svg{max-width:100%;height:auto}.cap{font-size:13px;color:#57514a}"
             ".rel{font-size:13px;background:#f4f0e6;padding:8px 12px;border-radius:6px}</style></head><body>",
             f"<h1>{e(title)}</h1>"]
    if project.get("question") and project["question"].strip() != title.strip():
        parts.append(f"<p class='meta'>{e(L['question'])}: {e(project['question'])}</p>")
    parts += [f"<p class='meta'>{e(x)}</p>" for x in intro]
    fig = 0
    for n in notes:
        b = n["body"]
        fig += 1 if b.get("svg") else 0
        parts.append(f"<h2>{e(b.get('title') or (L['note'] if n['kind'] == 'text' else ''))}</h2><p class='meta'>{e(_when(n['created_at']))}</p>")
        if b.get("svg"):
            svg = b["svg"].split("?>", 1)[-1]
            parts.append(f"<div class='fig'>{svg}</div>")
        if b.get("caption"):
            parts.append(f"<p class='cap'>{e(_renumber(b['caption'], fig))}</p>")
        if b.get("summary"):
            parts.append(f"<p>{e(b['summary'])}</p>")
        if b.get("text"):
            parts.append(f"<p>{e(b['text'])}</p>")
        if b.get("checks"):
            parts.append(f"<p class='rel'>{e(_checks_line(b['checks'], L))}</p>")
    parts.append(f"<p class='meta'>{e(L['generated'])} · {e(_when(datetime.utcnow().isoformat()))}</p></body></html>")
    return "".join(parts).encode("utf-8")


_CJK = re.compile(r"[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]")
# Fonts that cover Chinese, embedded (subset) so the PDF reads the same everywhere. macOS first.
_CJK_FONTS = [
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0),
    ("/Library/Fonts/Arial Unicode.ttf", 0),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 2),
    ("/usr/share/fonts/truetype/arphic/uming.ttc", 0),
]


def _renumber(caption: str, n: int) -> str:
    """Captions are written in the workspace as "Figure 1"; in the report figures count in order."""
    return re.sub(r"^(Figure|图)\s*\d+", lambda m: f"{m.group(1)} {n}", caption)


def _cjk_font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont

    if "KiriCJK" in pdfmetrics.getRegisteredFontNames():
        return "KiriCJK"
    for path, idx in _CJK_FONTS:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("KiriCJK", path, subfontIndex=idx))
                return "KiriCJK"
            except Exception:  # noqa: BLE001 - try the next font
                continue
    # Last resort: a standard CID font. Not embedded, so the reader must supply it.
    if "STSong-Light" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


def _pdf(title: str, project: dict, notes: list, L: dict, intro: list[str]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer

    cjk = _cjk_font()
    st = {}
    for name, kw in {
        "h1": dict(fontSize=20, leading=26, spaceAfter=8),
        "h2": dict(fontSize=13, leading=17, spaceBefore=14, spaceAfter=2),
        "meta": dict(fontSize=9, leading=12, textColor="#57514a"),
        "p": dict(fontSize=10.5, leading=15),
        "cap": dict(fontSize=9, leading=12, textColor="#57514a"),
    }.items():
        st[name] = ParagraphStyle(name, fontName="Helvetica-Bold" if name in ("h1", "h2") else "Helvetica", **kw)
        st[name + "_cjk"] = ParagraphStyle(name + "_cjk", fontName=cjk, **kw)

    def Para(text: str, style: str):  # noqa: N802 - mirrors reportlab's Paragraph
        # Latin text uses Helvetica, which every PDF reader has; text with Chinese uses the CJK font.
        return Paragraph(text, st[style + "_cjk"] if _CJK.search(text) else st[style])

    e = html.escape
    story = [Para(e(title), "h1")]
    if project.get("question") and project["question"].strip() != title.strip():
        story.append(Para(e(f"{L['question']}: {project['question']}"), "meta"))
    story += [Para(e(x), "meta") for x in intro]
    width = A4[0] - 40 * mm
    fig = 0
    for n in notes:
        b = n["body"]
        block = [Para(e(b.get("title") or (L["note"] if n["kind"] == "text" else "")), "h2"), Para(e(_when(n["created_at"])), "meta")]
        if b.get("svg"):
            fig += 1
            try:
                d = svg_drawing(b["svg"])
                if d is not None:
                    scale = min(1.0, width / d.width)
                    d.width, d.height = d.width * scale, d.height * scale
                    d.scale(scale, scale)
                    block += [Spacer(1, 4), d]
            except Exception:  # noqa: BLE001 - a figure that cannot be drawn is left out, the text stays
                pass
        for key, style in (("caption", "cap"), ("summary", "p"), ("text", "p")):
            if b.get(key):
                text = _renumber(b[key], fig) if key == "caption" else b[key]
                block.append(Para(e(text), style))
        if b.get("checks"):
            block.append(Para(e(_checks_line(b["checks"], L)), "cap"))
        # A heading never sits alone at the foot of a page, away from its figure.
        story.append(KeepTogether(block))
    story += [Spacer(1, 12), Para(e(L["generated"]), "meta")]
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                      title=title).build(story)
    return buf.getvalue()
