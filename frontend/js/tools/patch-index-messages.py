from pathlib import Path

p = Path(r"c:\Users\azrka\cvmatch\frontend\index.html")
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
start = next(i for i, l in enumerate(lines) if 'id="page-messages"' in l)
end = next(i for i, l in enumerate(lines[start:], start) if l.strip() == "</section>" and i > start)
new = """        <section id="page-messages" class="page page-messages-fill">
            <div class="messages-layout card">
                <aside class="messages-sidebar">
                    <div class="messages-sidebar-head">
                        <h2 class="messages-sidebar-title">Mesajlar</h2>
                        <input type="search" id="messages-search" class="messages-search" placeholder="Kişi veya mesaj ara…" autocomplete="off">
                    </div>
                    <div id="messages-conv-list" class="messages-conv-list" role="list"></div>
                </aside>
                <div class="messages-main">
                    <header class="messages-thread-header" id="messages-thread-header">
                        <button type="button" class="btn btn-ghost btn-sm messages-back-btn" id="messages-back-btn" aria-label="Sohbet listesine dön"><i class="fas fa-arrow-left"></i></button>
                        <div class="messages-thread-head-text">
                            <span class="messages-thread-title" id="messages-thread-title">Mesajlar</span>
                            <span class="messages-thread-sub text-muted" id="messages-thread-sub"></span>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm" id="messages-context-toggle" title="Bilgi paneli" aria-label="Bilgi paneli"><i class="fas fa-circle-info"></i></button>
                    </header>
                    <div class="messages-body-split">
                        <div id="messages-thread" class="messages-thread" role="log" aria-live="polite"></div>
                        <aside id="messages-context-panel" class="messages-context-panel hidden" aria-label="Sohbet bilgileri"></aside>
                    </div>
                    <form id="messages-compose-form" class="messages-compose">
                        <input type="text" id="messages-input" placeholder="Mesajınızı yazın…" maxlength="4000" autocomplete="off">
                        <button type="submit" class="btn btn-primary" id="messages-send-btn" title="Gönder"><i class="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>
        </section>
"""
lines[start : end + 1] = [new + "\n"]
p.write_text("".join(lines), encoding="utf-8")
print("ok", start, end)
