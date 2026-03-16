import urllib.request
import json
import base64

dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

payload = {
    "panels": [
        {"id": "1", "type": "png", "data": dummy_b64, "title": "Test 1"}
    ],
    "options": {
        "layout": "1x1",
        "format": "pdf"
    }
}

req = urllib.request.Request("http://localhost:8000/api/v1/export/generate", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as response:
        content = response.read()
        print("Success, length:", len(content))
        print("Mime:", response.getheader("Content-Type"))
except Exception as e:
    print(f"Error: {e}")
    if hasattr(e, "read"):
        print(e.read().decode("utf-8"))
