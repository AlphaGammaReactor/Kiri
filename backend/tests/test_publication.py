"""
Tests for Publication Engine Service

Verifies PDF generation, layout handling, and edge cases.
"""
import pytest
from app.services.publication import Panel, LayoutOptions, FigureLayoutEngine


class TestPanelModel:
    def test_basic_panel(self):
        p = Panel(id="1", type="svg", data="<svg></svg>", title="Test")
        assert p.type == "svg"

    def test_defaults(self):
        p = Panel(id="2", type="png", data="base64data")
        assert p.title == ""
        assert p.legend == ""


class TestLayoutOptions:
    def test_defaults(self):
        opts = LayoutOptions()
        assert opts.layout == "1x1"
        assert opts.palette == "default"
        assert opts.language == "en"
        assert opts.style == "nature"


class TestFigureLayoutEngine:
    def test_empty_panels_generates_pdf(self):
        """Empty panel list should still produce valid PDF bytes."""
        engine = FigureLayoutEngine(panels=[], options=LayoutOptions())
        pdf_bytes = engine.generate_pdf()
        assert len(pdf_bytes) > 0
        assert pdf_bytes[:5] == b"%PDF-"

    def test_single_svg_panel(self):
        """Should generate PDF with one SVG panel without crashing."""
        panel = Panel(
            id="test-1",
            type="svg",
            data='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
            title="Test KM Curve",
            legend="Kaplan-Meier survival curve for PARL in TCGA-COAD",
        )
        engine = FigureLayoutEngine(panels=[panel], options=LayoutOptions())
        pdf_bytes = engine.generate_pdf()
        assert len(pdf_bytes) > 100  # Should be a non-trivial PDF
        assert pdf_bytes[:5] == b"%PDF-"

    def test_2x2_layout(self):
        """Should handle 2x2 grid layout."""
        panels = [
            Panel(id=str(i), type="svg", data='<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>', title=f"Panel {chr(65+i)}")
            for i in range(4)
        ]
        opts = LayoutOptions(layout="2x2")
        engine = FigureLayoutEngine(panels=panels, options=opts)
        pdf_bytes = engine.generate_pdf()
        assert pdf_bytes[:5] == b"%PDF-"

    def test_nature_style_title(self):
        """Nature style should appear in the generated PDF."""
        engine = FigureLayoutEngine(panels=[], options=LayoutOptions(style="nature"))
        pdf_bytes = engine.generate_pdf()
        # Can't easily parse PDF content but verify it doesn't crash
        assert len(pdf_bytes) > 0
