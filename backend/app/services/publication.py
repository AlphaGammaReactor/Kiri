"""
Publication Engine Service

Handles generation of PDF/SVG figures from provided panels.
Applies journal-specific themes from publication_themes.
"""

import io
import os
import tempfile
import base64
import logging
import math
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.services.publication_themes import get_theme, list_themes as get_available_themes

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import inch
    from reportlab.graphics import renderPDF
    from reportlab.lib.utils import ImageReader
    _HAS_REPORTLAB = True
except ImportError:
    _HAS_REPORTLAB = False

try:
    from svglib.svglib import svg2rlg
    _HAS_SVGLIB = True
except ImportError:
    _HAS_SVGLIB = False

class Panel(BaseModel):
    id: str
    type: str  # 'svg' or 'png'
    data: str
    title: str = ""
    legend: str = ""
    dataSource: Optional[str] = None
    citation: Optional[str] = None

class LayoutOptions(BaseModel):
    layout: str = "1x1"
    palette: str = "default"
    language: str = "en"
    style: str = "nature"
    format: str = "pdf"

class FigureLayoutEngine:
    def __init__(self, panels: list[Panel], options: LayoutOptions):
        self.panels = panels
        self.options = options
        self.theme = get_theme(options.style)

    def _parse_layout(self) -> tuple[int, int]:
        """Parse layout string like '2x3' into (rows, cols)."""
        parts = self.options.layout.split("x")
        rows = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 1
        cols = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 1
        return rows, cols

    def _draw_svg(self, c, svg_string: str, x: float, y: float, w: float, h: float):
        if not _HAS_SVGLIB:
            # Can't render SVG without svglib — draw placeholder text
            c.setFont("Helvetica", 9)
            c.drawString(x + 5, y + h / 2, "[SVG: install svglib to render]")
            return
        fd, tmp_name = tempfile.mkstemp(suffix=".svg")
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(svg_string)
            drawing = svg2rlg(tmp_name)
            if drawing and drawing.width > 0 and drawing.height > 0:
                scale_x = w / drawing.width
                scale_y = h / drawing.height
                scale = min(scale_x, scale_y)
                drawing.width = drawing.width * scale
                drawing.height = drawing.height * scale
                drawing.scale(scale, scale)
                # Adjust Y so it draws from bottom-left
                renderPDF.draw(drawing, c, x, y)
        finally:
            try:
                os.remove(tmp_name)
            except OSError:
                pass

    def _draw_png(self, c, b64_string: str, x: float, y: float, w: float, h: float):
        if b64_string.startswith("data:image"):
            b64_string = b64_string.split(",", 1)[1]
        try:
            img_data = base64.b64decode(b64_string)

            # Try PIL first for proper transparency compositing
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(img_data))
                img.load()  # force decode

                # Flatten transparency onto white background
                if img.mode in ('RGBA', 'LA', 'PA') or (img.mode == 'P' and 'transparency' in img.info):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    alpha = img.convert("RGBA").split()[3]
                    bg.paste(img.convert("RGBA"), mask=alpha)
                    img = bg
                elif img.mode != 'RGB':
                    img = img.convert("RGB")

                fd, tmp_name = tempfile.mkstemp(suffix=".png")
                try:
                    with os.fdopen(fd, 'wb') as f:
                        img.save(f, format="PNG")
                    c.drawImage(tmp_name, x, y, width=w, height=h, preserveAspectRatio=True, anchor='c')
                finally:
                    try:
                        os.remove(tmp_name)
                    except OSError:
                        pass
                return  # success via PIL path

            except Exception:
                pass  # fall through to ImageReader path

            # Fallback: use reportlab's ImageReader directly (handles most standard PNGs)
            if _HAS_REPORTLAB:
                reader = ImageReader(io.BytesIO(img_data))
                c.drawImage(reader, x, y, width=w, height=h, preserveAspectRatio=True, anchor='c')
            else:
                logging.getLogger(__name__).warning("Cannot render PNG: no PIL and no reportlab ImageReader")

        except Exception as e:
            logging.getLogger(__name__).error("Error drawing PNG panel: %s", e, exc_info=True)

    def generate_pdf(self) -> bytes:
        buffer = io.BytesIO()
        page_width, page_height = landscape(A4)
        c = canvas.Canvas(buffer, pagesize=landscape(A4))
        
        margin_x = 50
        margin_y = 50
        content_w = page_width - 2 * margin_x
        content_h = page_height - 2 * margin_y - 60  # leave room for footer/title
        
        # Determine grid
        n_panels = len(self.panels)
        if not n_panels:
            c.drawString(100, page_height - 100, "No panels provided.")
            c.showPage()
            c.save()
            return buffer.getvalue()
        
        rows, cols = self._parse_layout()
        panels_per_page = rows * cols
        
        cell_w = content_w / cols
        cell_h = content_h / rows
        
        # Title — theme-aware font
        theme_font = self.theme.fonts.family.split(',')[0].strip()
        # ReportLab only supports built-in fonts; map to nearest
        pdf_font = "Helvetica" if "Arial" in theme_font or "Helvetica" in theme_font else "Times-Roman"
        pdf_font_bold = "Helvetica-Bold" if pdf_font == "Helvetica" else "Times-Bold"
        
        n_pages = math.ceil(n_panels / panels_per_page)
        
        for page_idx in range(n_pages):
            c.setFont(pdf_font_bold, self.theme.fonts.title_size + 2)
            title = f"Publication Export — {self.theme.journal}"
            if n_pages > 1:
                title += f" (Page {page_idx + 1}/{n_pages})"
            c.drawString(margin_x, page_height - margin_y, title)
            
            c.setFont("Helvetica", 10)
            
            start_idx = page_idx * panels_per_page
            end_idx = min(start_idx + panels_per_page, n_panels)
            
            for i in range(start_idx, end_idx):
                panel = self.panels[i]
                r = (i - start_idx) // cols
                col = (i - start_idx) % cols
                
                x = margin_x + col * cell_w
                y = page_height - margin_y - 40 - (r + 1) * cell_h
                
                # Panel label (A, B, C...) — theme-aware style
                label = chr(65 + i)
                if self.theme.panel_label_style == "bold-uppercase":
                    label = label.upper()
                    c.setFont(pdf_font_bold, self.theme.fonts.title_size)
                elif self.theme.panel_label_style == "lowercase":
                    label = label.lower()
                    c.setFont(pdf_font, self.theme.fonts.title_size)
                else:
                    c.setFont(pdf_font_bold, self.theme.fonts.title_size)
                c.drawString(x, y + cell_h - 15, label)
                
                # Panel title
                if panel.title:
                    c.setFont(pdf_font, 9)
                    c.drawString(x + 18, y + cell_h - 15, panel.title[:60])
                
                c.setFont(pdf_font, self.theme.fonts.axis_label_size)
                
                img_margin = 20
                img_w = cell_w - 2 * img_margin
                img_h = cell_h - 2 * img_margin - 15  # extra room for source annotation
                img_x = x + img_margin
                img_y = y + img_margin + 15
                
                if panel.type == 'svg':
                    self._draw_svg(c, panel.data, img_x, img_y, img_w, img_h)
                elif panel.type == 'png':
                    self._draw_png(c, panel.data, img_x, img_y, img_w, img_h)
                
                # Source and citation annotation below the panel image
                annotation_y = y + 5
                c.setFont("Helvetica", 7)
                annotation_parts = []
                if panel.dataSource:
                    annotation_parts.append(f"Source: {panel.dataSource}")
                if panel.citation:
                    annotation_parts.append(panel.citation)
                if annotation_parts:
                    c.setFillColorRGB(0.5, 0.5, 0.5)
                    c.drawString(x + 5, annotation_y, " | ".join(annotation_parts)[:120])
                    c.setFillColorRGB(0, 0, 0)
                elif panel.legend:
                    c.setFont("Helvetica-Oblique", 7)
                    c.setFillColorRGB(0.5, 0.5, 0.5)
                    c.drawString(x + 5, annotation_y, panel.legend[:100] + ("..." if len(panel.legend) > 100 else ""))
                    c.setFillColorRGB(0, 0, 0)
            
            # Footer — theme-aware
            c.setFont(pdf_font, 8)
            footer_y = 20
            lang_suffix = " (中文)" if self.options.language == "zh" else ""
            c.drawString(
                margin_x, footer_y,
                f"Generated by Kiri Research Platform | {self.theme.journal} Style{lang_suffix} | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
            
            c.showPage()
            
        c.save()
        return buffer.getvalue()

    def generate_svg(self) -> str:
        """Generate a composite SVG document with panels arranged in a grid.
        Expand height if panels exceed one page."""
        rows, cols = self._parse_layout()
        n_panels = len(self.panels)
        panels_per_page = rows * cols
        n_pages = math.ceil(n_panels / panels_per_page) if n_panels else 1
        
        svg_width = 841
        page_height = 595
        svg_height = page_height * n_pages
        margin = 40
        content_w = svg_width - 2 * margin
        content_h = page_height - 2 * margin - 50  # room for header/footer
        
        cell_w = content_w / cols
        cell_h = content_h / rows
        
        parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" '
            f'viewBox="0 0 {svg_width} {svg_height}">',
            f'<rect width="{svg_width}" height="{svg_height}" fill="white"/>',
        ]
        
        for page_idx in range(n_pages):
            page_offset_y = page_idx * page_height
            
            title_text = f"Publication Export — {self.theme.journal}"
            if n_pages > 1:
                title_text += f" (Page {page_idx + 1}/{n_pages})"
                
            parts.append(
                f'<text x="{margin}" y="{page_offset_y + margin + 5}" font-family="Arial, sans-serif" font-size="16" '
                f'font-weight="bold" fill="#333">{title_text}</text>'
            )
            
            start_idx = page_idx * panels_per_page
            end_idx = min(start_idx + panels_per_page, n_panels)
            
            for i in range(start_idx, end_idx):
                panel = self.panels[i]
                r = (i - start_idx) // cols
                col = (i - start_idx) % cols
                
                x = margin + col * cell_w
                y = page_offset_y + margin + 25 + r * cell_h
                
                label = chr(65 + i)
                
                # Cell border
                parts.append(
                    f'<rect x="{x}" y="{y}" width="{cell_w - 4}" height="{cell_h - 4}" '
                    f'fill="#fafafa" stroke="#e5e5e5" stroke-width="1" rx="2"/>'
                )
                
                # Label
                parts.append(
                    f'<text x="{x + 8}" y="{y + 16}" font-family="Arial, sans-serif" font-size="14" '
                    f'font-weight="bold" fill="#333">{label}</text>'
                )
                
                # Title
                if panel.title:
                    parts.append(
                        f'<text x="{x + 24}" y="{y + 16}" font-family="Arial, sans-serif" font-size="9" '
                        f'fill="#666">{_escape_xml(panel.title[:50])}</text>'
                    )
                
                # Image — embed as data URI for PNG, inline for SVG
                img_x = x + 8
                img_y = y + 24
                img_w = cell_w - 20
                img_h = cell_h - 48
                
                if panel.type == 'png':
                    data_uri = panel.data if panel.data.startswith('data:') else f'data:image/png;base64,{panel.data}'
                    parts.append(
                        f'<image x="{img_x}" y="{img_y}" width="{img_w}" height="{img_h}" '
                        f'href="{data_uri}" preserveAspectRatio="xMidYMid meet"/>'
                    )
                elif panel.type == 'svg':
                    # Embed as foreign object
                    parts.append(
                        f'<foreignObject x="{img_x}" y="{img_y}" width="{img_w}" height="{img_h}">'
                        f'<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden">'
                        f'{panel.data}'
                        f'</div></foreignObject>'
                    )
                
                # Source annotation
                ann_y = y + cell_h - 12
                if panel.dataSource:
                    parts.append(
                        f'<text x="{x + 8}" y="{ann_y}" font-family="Arial, sans-serif" font-size="7" '
                        f'fill="#999">Source: {_escape_xml(panel.dataSource[:60])}</text>'
                    )
            
            # Footer
            lang_suffix = " (中文)" if self.options.language == "zh" else ""
            footer_text = f"Generated by Kiri Research Platform | {self.theme.journal} Style{lang_suffix}"
            parts.append(
                f'<text x="{margin}" y="{page_offset_y + page_height - 15}" font-family="Arial, sans-serif" '
                f'font-size="8" fill="#999">{_escape_xml(footer_text)}</text>'
            )
        
        parts.append('</svg>')
        return '\n'.join(parts)


def _escape_xml(s: str) -> str:
    """Escape special characters for XML/SVG text content."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
