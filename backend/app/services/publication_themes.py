"""
Kiri — Publication Theme Presets

Journal-specific style presets for figure generation.
Each preset defines fonts, colors, line widths, and labeling conventions
that match the submission guidelines of major journals.

Colors follow the convention:
  - Primary (high/tumor): warm tones
  - Secondary (low/normal): cool tones
  - Labels: neutral dark
"""

from __future__ import annotations
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ThemeColors:
    """Color palette for a journal theme."""
    primary: str       # High expression / Tumor
    secondary: str     # Low expression / Normal
    accent: str        # Highlights, significant markers
    label: str         # Axis labels, titles
    grid: str          # Grid lines
    background: str    # Plot background
    p_significant: str # Color for p < 0.05 annotations
    ci_fill: str       # Confidence interval fill (with alpha)


@dataclass(frozen=True)
class ThemeFonts:
    """Font configuration for a journal theme."""
    family: str
    title_size: int
    axis_label_size: int
    tick_size: int
    legend_size: int
    annotation_size: int


@dataclass(frozen=True)
class ThemeLayout:
    """Layout parameters for a journal theme."""
    line_width: float
    marker_size: float
    border_width: float
    margin_top: int
    margin_bottom: int
    margin_left: int
    margin_right: int
    dpi: int


@dataclass(frozen=True)
class PublicationTheme:
    """Complete journal theme preset."""
    name: str
    journal: str
    colors: ThemeColors
    fonts: ThemeFonts
    layout: ThemeLayout
    panel_label_style: str  # 'uppercase' | 'lowercase' | 'bold-uppercase'


# ══════════════════════════════
#  Theme Presets
# ══════════════════════════════

NATURE_THEME = PublicationTheme(
    name="nature",
    journal="Nature / Nature Cell Biology",
    colors=ThemeColors(
        primary="#C82423",      # Nature red (tumor / high)
        secondary="#2E75B6",    # Nature blue (normal / low)
        accent="#E6A817",       # Gold accent
        label="#333333",        # Near-black labels
        grid="#E0E0E0",         # Light gray grid
        background="#FFFFFF",   # White background
        p_significant="#C82423",
        ci_fill="rgba(200, 36, 35, 0.15)",
    ),
    fonts=ThemeFonts(
        family="Arial, Helvetica, sans-serif",
        title_size=14,
        axis_label_size=12,
        tick_size=10,
        legend_size=10,
        annotation_size=9,
    ),
    layout=ThemeLayout(
        line_width=1.5,
        marker_size=4.0,
        border_width=0.75,
        margin_top=40,
        margin_bottom=60,
        margin_left=60,
        margin_right=20,
        dpi=300,
    ),
    panel_label_style="bold-uppercase",
)

CELL_THEME = PublicationTheme(
    name="cell",
    journal="Cell / Cell Press",
    colors=ThemeColors(
        primary="#D64550",      # Cell red
        secondary="#4A90D9",    # Cell blue
        accent="#50C878",       # Emerald green
        label="#2C2C2C",
        grid="#ECECEC",
        background="#FFFFFF",
        p_significant="#D64550",
        ci_fill="rgba(214, 69, 80, 0.12)",
    ),
    fonts=ThemeFonts(
        family="Helvetica Neue, Helvetica, Arial, sans-serif",
        title_size=13,
        axis_label_size=11,
        tick_size=10,
        legend_size=9,
        annotation_size=8,
    ),
    layout=ThemeLayout(
        line_width=1.25,
        marker_size=3.5,
        border_width=0.5,
        margin_top=35,
        margin_bottom=55,
        margin_left=55,
        margin_right=15,
        dpi=300,
    ),
    panel_label_style="bold-uppercase",
)

SCIENCE_THEME = PublicationTheme(
    name="science",
    journal="Science / AAAS",
    colors=ThemeColors(
        primary="#B22222",      # Firebrick
        secondary="#1F4E79",    # Dark blue
        accent="#DAA520",       # Goldenrod
        label="#1A1A1A",
        grid="#D9D9D9",
        background="#FFFFFF",
        p_significant="#B22222",
        ci_fill="rgba(178, 34, 34, 0.12)",
    ),
    fonts=ThemeFonts(
        family="Times New Roman, serif",
        title_size=12,
        axis_label_size=10,
        tick_size=9,
        legend_size=9,
        annotation_size=8,
    ),
    layout=ThemeLayout(
        line_width=1.0,
        marker_size=3.0,
        border_width=0.5,
        margin_top=30,
        margin_bottom=50,
        margin_left=50,
        margin_right=15,
        dpi=300,
    ),
    panel_label_style="uppercase",
)

PNAS_THEME = PublicationTheme(
    name="pnas",
    journal="PNAS",
    colors=ThemeColors(
        primary="#CC3333",
        secondary="#336699",
        accent="#339966",
        label="#262626",
        grid="#E5E5E5",
        background="#FFFFFF",
        p_significant="#CC3333",
        ci_fill="rgba(204, 51, 51, 0.12)",
    ),
    fonts=ThemeFonts(
        family="Arial, Helvetica, sans-serif",
        title_size=12,
        axis_label_size=10,
        tick_size=9,
        legend_size=9,
        annotation_size=8,
    ),
    layout=ThemeLayout(
        line_width=1.25,
        marker_size=3.5,
        border_width=0.5,
        margin_top=35,
        margin_bottom=55,
        margin_left=55,
        margin_right=15,
        dpi=300,
    ),
    panel_label_style="uppercase",
)


# ── Registry ──

THEMES: dict[str, PublicationTheme] = {
    "nature": NATURE_THEME,
    "cell": CELL_THEME,
    "science": SCIENCE_THEME,
    "pnas": PNAS_THEME,
}


def get_theme(name: str) -> PublicationTheme:
    """Get a theme by name, falling back to Nature."""
    return THEMES.get(name, NATURE_THEME)


def list_themes() -> list[dict]:
    """Return theme metadata for the frontend."""
    return [
        {
            "key": key,
            "name": theme.journal,
            "fonts": theme.fonts.family.split(",")[0].strip(),
            "primary": theme.colors.primary,
            "secondary": theme.colors.secondary,
        }
        for key, theme in THEMES.items()
    ]


def theme_to_echarts_options(theme: PublicationTheme) -> dict:
    """
    Convert a PublicationTheme to ECharts-compatible style overrides.

    Used by the frontend to apply journal-specific styles to
    all charts before export.
    """
    return {
        "textStyle": {
            "fontFamily": theme.fonts.family,
            "color": theme.colors.label,
        },
        "title": {
            "textStyle": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.title_size,
                "color": theme.colors.label,
                "fontWeight": "bold",
            },
        },
        "xAxis": {
            "axisLabel": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.tick_size,
                "color": theme.colors.label,
            },
            "nameTextStyle": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.axis_label_size,
                "color": theme.colors.label,
            },
            "axisLine": {"lineStyle": {"color": theme.colors.label, "width": theme.layout.border_width}},
            "splitLine": {"lineStyle": {"color": theme.colors.grid}},
        },
        "yAxis": {
            "axisLabel": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.tick_size,
                "color": theme.colors.label,
            },
            "nameTextStyle": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.axis_label_size,
                "color": theme.colors.label,
            },
            "axisLine": {"lineStyle": {"color": theme.colors.label, "width": theme.layout.border_width}},
            "splitLine": {"lineStyle": {"color": theme.colors.grid}},
        },
        "legend": {
            "textStyle": {
                "fontFamily": theme.fonts.family,
                "fontSize": theme.fonts.legend_size,
                "color": theme.colors.label,
            },
        },
        "color": [theme.colors.primary, theme.colors.secondary, theme.colors.accent],
        "backgroundColor": theme.colors.background,
        "series_defaults": {
            "lineStyle": {"width": theme.layout.line_width},
            "symbolSize": theme.layout.marker_size,
        },
        "grid": {
            "top": theme.layout.margin_top,
            "bottom": theme.layout.margin_bottom,
            "left": theme.layout.margin_left,
            "right": theme.layout.margin_right,
        },
    }
