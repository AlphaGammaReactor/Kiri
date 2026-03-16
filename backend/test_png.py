import urllib.request
import base64
import os
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

b64 = b'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAFiUAABYlAUlSJPAAAABKSURBVHhe7cABQAAAAMAg+7dHhyFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjWAiTqAAGy+oTqAAAAAElFTkSuQmCC'
img_data = base64.b64decode(b64)

c = canvas.Canvas('test_anchor.pdf', pagesize=(400, 400))

with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
    f.write(img_data)
    name = f.name
try:
    print("Drawing image...")
    c.drawImage(name, 100, 100, width=200, height=200, preserveAspectRatio=True, anchor='c')
    c.save()
    print("Success")
except Exception as e:
    print("Error:", e)
finally:
    os.remove(name)
