from pathlib import Path

p = Path(__file__).resolve().parents[2] / "index.html"
text = p.read_text(encoding="utf-8")
marker = '<motion.div id="demo-info-modal"'
if marker not in text:
    marker = '<div id="demo-info-modal"'
start = text.find(marker)
end = text.find('<div id="apply-cv-modal"')
if start < 0 or end <= start:
    raise SystemExit(f"markers not found: {start} {end}")
p.write_text(text[:start] + text[end:], encoding="utf-8")
print("ok")
