import sys
import os

from app.services.publication import FigureLayoutEngine, Panel, LayoutOptions

# Dummy base64 PNG (1x1 transparent)
dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

panels = [
    Panel(id="1", type="png", data=dummy_b64, title="Test 1")
]

options = LayoutOptions()
engine = FigureLayoutEngine(panels=panels, options=options)

try:
    pdf_bytes = engine.generate_pdf()
    print("PDF size:", len(pdf_bytes))
    with open("test_out.pdf", "wb") as f:
        f.write(pdf_bytes)
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
