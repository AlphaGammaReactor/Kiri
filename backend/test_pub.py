import requests, json

headers = {"Content-Type": "application/json"}
data = {
    "panels": [
        {
            "id": "1",
            "title": "Test panel",
            "type": "png",
            "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
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
r = requests.post("http://localhost:8000/api/v1/publication/generate", json=data)
print(r.status_code)
if r.status_code == 200:
    with open("test_out.pdf", "wb") as f:
        f.write(r.content)
    print("Saved test_out.pdf of size", len(r.content))
else:
    print(r.text)
