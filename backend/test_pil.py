import base64
import io
import os
import tempfile
from PIL import Image
from reportlab.pdfgen import canvas

# A valid 1x1 transparent red PNG
b64 = b'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BwAQAAMgEx+q3zEwAAAABJRU5ErkJggg=='
img_data = base64.b64decode(b64)

c = canvas.Canvas('test_pil.pdf', pagesize=(400, 400))
fd, tmp_name = tempfile.mkstemp(suffix=".png")
try:
    img = Image.open(io.BytesIO(img_data))
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.convert("RGBA").split()[3])
        img = bg
    else:
        img = img.convert("RGB")
    
    with os.fdopen(fd, 'wb') as f:
        img.save(f, format="PNG")
    
    c.drawImage(tmp_name, 100, 100, width=200, height=200, preserveAspectRatio=True, anchor='c')
    c.save()
    print("Success")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    try:
        os.remove(tmp_name)
    except OSError:
        pass
