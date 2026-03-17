from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.responses import success_response
from app.services.publication import FigureLayoutEngine, Panel, LayoutOptions
from app.services.publication_themes import list_themes, get_theme, theme_to_echarts_options

router = APIRouter(prefix="/export", tags=["export"])

class ExportRequest(BaseModel):
    panels: list[Panel]
    options: LayoutOptions = LayoutOptions()

@router.post("/generate")
async def generate_figure(body: ExportRequest):
    """
    Generate a publication-ready figure from selected panels.
    Returns the file directly (PDF or SVG based on options.format).
    """
    # Initialize engine
    engine = FigureLayoutEngine(panels=body.panels, options=body.options)
    

    
    if body.options.format == "svg":
        svg_content = engine.generate_svg()
        return Response(
            content=svg_content.encode("utf-8"),
            media_type="image/svg+xml",
            headers={"Content-Disposition": "attachment; filename=kiriresearch_export.svg"},
        )
    else:
        pdf_bytes = engine.generate_pdf()
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=kiriresearch_export.pdf"},
        )


@router.get("/themes")
async def get_themes():
    """
    Return available publication themes with ECharts style overrides.
    Frontend uses this to apply journal-specific visual styles to charts.
    """
    themes = list_themes()
    themes_with_echarts = []
    for theme_meta in themes:
        theme = get_theme(theme_meta["key"])
        themes_with_echarts.append({
            **theme_meta,
            "echarts": theme_to_echarts_options(theme),
        })
    return success_response(
        data=themes_with_echarts,
        source="kiri-publication",
        method="Publication theme registry",
    )
