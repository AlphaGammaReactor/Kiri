import requests, json

headers = {"Content-Type": "application/json"}
data = {
    "panels": [
        {
            "id": "1",
            "title": "Transparent Red Dot",
            "type": "png",
            "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BwAQAAMgEx+q3zEwAAAABJRU5ErkJggg==",
            "sourceModule": "atlas"
        }
    ],
    "options": {
         "layout": "1x1",
         "style": "nature",
         "palette": "default",
         "format": "pdf",
         "language": "en"
    }
}
r = requests.post("http://localhost:8000/api/v1/export/generate", json=data)
print(r.status_code)
if r.status_code == 200:
    with open("test_out_real.pdf", "wb") as f:
        f.write(r.content)
    print("Saved test_out_real.pdf of size", len(r.content))
else:
    print(r.text)
