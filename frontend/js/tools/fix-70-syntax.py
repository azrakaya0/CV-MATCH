from pathlib import Path

p = Path(__file__).resolve().parents[1] / "modules" / "70-messages.js"
t = p.read_text(encoding="utf-8")
start = t.find("        panel.innerHTML = html.replace")
end = t.find("        panel.querySelector(\"[data-cv-open]\")")
if start == -1 or end == -1:
    raise SystemExit("markers not found")
fixed = t[:start] + "        panel.innerHTML = html;\n" + t[end:]
p.write_text(fixed, encoding="utf-8")
print("fixed")
