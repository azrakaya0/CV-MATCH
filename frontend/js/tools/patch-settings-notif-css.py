from pathlib import Path

# Settings HTML
idx = Path(r"c:\Users\azrka\cvmatch\frontend\index.html")
t = idx.read_text(encoding="utf-8")
old = """                <motion.div class="card settings-card" id="settings-appearance-card">
                    <h2><i class="fas fa-palette"></i> Görünüm ve bildirimler</h2>
                    <div class="form-group">
                        <label for="settings-theme">Tema</label>
                        <select id="settings-theme" class="form-control">
                            <option value="dark">Koyu mod</option>
                            <option value="light">Açık mod</option>
                            <option value="system">Sistem (otomatik)</option>
                        </select>
                        <p class="text-muted" style="font-size:0.75rem;margin:0.35rem 0 0">Kenar çubuğundaki düğme Koyu / Açık mod arasında geçiş yapar.</p>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="settings-notify-email" checked>
                            <span>E-posta bildirimleri (yeni mesaj; şirket hesaplarında yeni başvuru)</span>
                        </label>
                        <p class="text-muted" style="font-size:0.75rem;margin:0.35rem 0 0">SMTP yapılandırılmış olmalıdır. Mesajda gönderen kişi ve şirket adı belirtilir.</p>
                    </div>
                </div>"""
old = old.replace("<motion.div", "<div").replace("</motion>", "")
new = """                <div class="card settings-card">
                    <h2><i class="fas fa-palette"></i> Görünüm</h2>
                    <motion.div class="form-group">
                        <label for="settings-theme">Tema</label>
                        <select id="settings-theme" class="form-control">
                            <option value="dark">Koyu mod</option>
                            <option value="light">Açık mod</option>
                            <option value="system">Sistem (otomatik)</option>
                        </select>
                        <p class="text-muted" style="font-size:0.75rem;margin:0.35rem 0 0">Kenar çubuğundan da Koyu / Açık mod arasında geçebilirsiniz.</p>
                    </div>
                </div>
                <div class="card settings-card">
                    <h2><i class="fas fa-bell"></i> Bildirimler</h2>
                    <p class="text-muted" style="font-size:0.85rem;margin:0 0 0.75rem">Sol alttaki zil simgesinden uygulama içi bildirimlere bakın (başvuru, mesaj).</p>
                    <div class="form-group" style="margin-bottom:0">
                        <label class="checkbox-label">
                            <input type="checkbox" id="settings-notify-email" checked>
                            <span>Ayrıca e-posta gönder (SMTP gerekir)</span>
                        </label>
                    </div>
                </div>"""
new = new.replace("<motion.div", "<div").replace("</motion>", "")
if old in t:
    t = t.replace(old, new)
else:
  print("settings block not found, skip")
t = t.replace(
    '<p class="notif-dropdown-sub">Başvurular ve ilan güncellemeleri</p>',
    '<p class="notif-dropdown-sub">Başvuru, mesaj ve durum güncellemeleri</p>',
)
idx.write_text(t, encoding="utf-8")

css = Path(r"c:\Users\azrka\cvmatch\frontend\css\style.css")
c = css.read_text(encoding="utf-8")
# palette tweak
c = c.replace("--bg-primary: #0c0e12;", "--bg-primary: #111318;")
c = c.replace("--bg-secondary: #12151a;", "--bg-secondary: #161a21;")
c = c.replace("--bg-card: #181c23;", "--bg-card: #1c2129;")
c = c.replace("[data-theme=\"light\"] {\n    color-scheme: light;\n    --bg-primary: #e8eaef;", "[data-theme=\"light\"] {\n    color-scheme: light;\n    --bg-primary: #eef0f4;")

append = """
/* —— Mesajlar (WhatsApp tarzı) —— */
.page-messages-fill {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 5.5rem);
    padding-bottom: 0;
}
.page-messages-fill .messages-layout {
    flex: 1;
    min-height: calc(100vh - 6rem);
    max-height: none;
    display: flex;
}
.messages-sidebar-head {
    padding: 0.85rem 0.85rem 0.5rem;
    border-bottom: 1px solid var(--border);
}
.messages-sidebar-title {
    font-size: 1.05rem;
    margin: 0 0 0.5rem;
    font-weight: 600;
}
.messages-search {
    width: 100%;
    padding: 0.45rem 0.65rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 0.85rem;
}
.messages-thread-head-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.messages-thread-sub {
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.messages-body-split {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
}
.messages-context-panel {
    width: 260px;
    flex-shrink: 0;
    border-left: 1px solid var(--border);
    padding: 0.85rem;
    overflow-y: auto;
    background: var(--bg-secondary);
    font-size: 0.85rem;
}
.messages-context-panel.hidden {
    display: none;
}
.messages-ctx-cv .btn {
    margin-top: 0.5rem;
}
.msg-row {
    display: flex;
    margin-bottom: 0.35rem;
    clear: both;
}
.msg-row--mine {
    justify-content: flex-end;
}
.msg-row--theirs {
    justify-content: flex-start;
}
.msg-bubble {
    max-width: min(78%, 520px);
    padding: 0.5rem 0.7rem 0.35rem;
    border-radius: 14px;
    position: relative;
    box-shadow: var(--shadow-sm);
}
.msg-bubble--mine {
    background: var(--primary);
    color: #fff;
    border-bottom-right-radius: 4px;
}
.msg-bubble--theirs {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-bottom-left-radius: 4px;
}
.msg-bubble .msg-sender {
    font-size: 0.7rem;
    opacity: 0.85;
    margin-bottom: 0.2rem;
}
.msg-bubble .msg-body {
    font-size: 0.9rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
}
.msg-bubble .msg-time {
    font-size: 0.65rem;
    opacity: 0.75;
    text-align: right;
    margin-top: 0.25rem;
}
.msg-day-sep {
    text-align: center;
    margin: 0.75rem 0;
}
.msg-day-sep span {
    display: inline-block;
    padding: 0.2rem 0.65rem;
    font-size: 0.72rem;
    color: var(--text-muted);
    background: var(--bg-elevated);
    border-radius: 999px;
}
.messages-thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.85rem;
    background: var(--bg-primary);
}
.messages-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}
[data-theme="light"] .stat-card {
    background: var(--bg-card);
    border-color: var(--border);
    box-shadow: var(--shadow-sm);
}
[data-theme="light"] .stat-card::before {
    background: var(--primary);
}
[data-theme="light"] .stat-icon {
    color: var(--text-muted);
}
[data-theme="light"] .messages-thread {
    background: #e4e7ec;
}
[data-theme="light"] .msg-bubble--theirs {
    background: #fff;
}
[data-theme="light"] .notif-dropdown {
    background: #fff;
    border-color: var(--border);
    color: var(--text-primary);
}
[data-theme="light"] .notif-row:hover {
    background: rgba(15, 23, 42, 0.04);
}
.settings-avatar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
}
"""
if "page-messages-fill" not in c:
    c += append
css.write_text(c, encoding="utf-8")
print("settings+css done")
