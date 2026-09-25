from pathlib import Path

p = Path(r"c:\Users\azrka\cvmatch\frontend\index.html")
t = p.read_text(encoding="utf-8")
old = """            <motion.div class="card" id="jobs-my-applications-wrap">
                <div class="jobs-applications-card-head">
                    <h2><i class="fas fa-paper-plane"></i> Başvurularım</h2>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="navigate('employee-applications')">Tümü</button>
                </div>
                <div id="jobs-my-applications-body"><p class="text-muted">Yükleniyor…</p></div>
            </div>
"""
old = old.replace("<motion.div", "<div").replace("</motion>", "")
if old not in t:
    old = """            <div class="card" id="jobs-my-applications-wrap">
                <div class="jobs-applications-card-head">
                    <h2><i class="fas fa-paper-plane"></i> Başvurularım</h2>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="navigate('employee-applications')">Tümü</button>
                </div>
                <div id="jobs-my-applications-body"><p class="text-muted">Yükleniyor…</p></motion>
            </div>
"""
    old = old.replace("</motion>", "</div>")
p.write_text(t.replace(old, ""), encoding="utf-8")
print("done")
