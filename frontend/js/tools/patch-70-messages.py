from pathlib import Path

p = Path(r"c:\Users\azrka\cvmatch\frontend\js\modules\70-messages.js")
t = p.read_text(encoding="utf-8")

# append helpers if missing
if "function filterMessagesConversations" not in t:
    t += """

let messagesSearchQuery = "";
let messagesThreadMessages = [];

function filterMessagesConversations(convs, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return convs || [];
    return (convs || []).filter((c) => {
        const label = (isEmployee() ? c.company_name : c.employee_label) || "";
        const preview = c.last_message || "";
        return label.toLowerCase().includes(s) || preview.toLowerCase().includes(s);
    });
}

function renderMessagesConvList(convs) {
    const listEl = document.getElementById("messages-conv-list");
    if (!listEl) return;
    const filtered = filterMessagesConversations(convs, messagesSearchQuery);
    listEl.innerHTML = filtered.length
        ? filtered
              .map(
                  (c) => `
            <button type="button" class="messages-conv-item ${c.id === state.messagesActiveConvId ? "active" : ""}" data-conv-id="${escapeHtml(c.id)}">
                <strong>${escapeHtml(isEmployee() ? c.company_name : c.employee_label)}</strong>
                ${c.unread ? `<span class="msg-unread-badge">${c.unread}</span>` : ""}
                <span class="text-muted msg-preview">${escapeHtml(c.last_message || "—")}</span>
            </button>`
              )
              .join("")
        : emptyStateHtml(
              "search",
              messagesSearchQuery ? "Sonuç yok" : "Henüz sohbet yok",
              messagesSearchQuery
                  ? "Arama kriterinize uygun sohbet bulunamadı."
                  : "İlan başvuruları, eşleştirme veya karşılaştırma ekranından «Mesaj gönder» ile yazışma başlatın."
          );
    listEl.querySelectorAll("[data-conv-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.messagesActiveConvId = btn.getAttribute("data-conv-id");
            setMessagesThreadOpen(true);
            void openMessagesConversation(state.messagesActiveConvId);
        });
    });
}

function filterThreadMessagesBySearch(msgs, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return msgs || [];
    return (msgs || []).filter((m) => (m.body || "").toLowerCase().includes(s));
}

async function loadMessagesContextPanel(convId) {
    const panel = document.getElementById("messages-context-panel");
    if (!panel) return;
    try {
        const ctx = await api(`/api/messages/conversations/${encodeURIComponent(convId)}/context`);
        let html = "";
        if (ctx.job?.title) {
            html += `<p class="messages-ctx-job"><i class="fas fa-briefcase"></i> ${escapeHtml(ctx.job.title)}</p>`;
        }
        if (isEmployee() && ctx.company_profile) {
            html += formatCompanyProfileHtml(ctx.company_profile, { heading: "Şirket" });
        }
        if (isCompany() && ctx.cv_summary) {
            const cv = ctx.cv_summary;
            html += `<div class="messages-ctx-cv">
                <p class="company-profile-heading">Aday CV</p>
                <p><strong>${escapeHtml(cv.name)}</strong></p>
                ${cv.email ? `<p class="text-muted"><i class="fas fa-envelope"></i> ${escapeHtml(cv.email)}</p>` : ""}
                ${cv.phone ? `<p class="text-muted"><i class="fas fa-phone"></i> ${escapeHtml(cv.phone)}</p>` : ""}
                ${cv.skills?.length ? `<p class="text-muted">Beceriler: ${escapeHtml(cv.skills.join(", "))}</p>` : ""}
                <button type="button" class="btn btn-sm btn-secondary" data-cv-open="${escapeHtml(cv.id)}">CV detayı</button>
            </div>`;
        }
        if (!html) html = '<p class="text-muted">Ek bilgi yok.</p>';
        panel.innerHTML = html;
        panel.querySelector("[data-cv-open]")?.addEventListener("click", (e) => {
            const id = e.currentTarget.getAttribute("data-cv-open");
            if (id) goToCvDetail(id);
        });
    } catch {
        panel.innerHTML = '<p class="text-muted">Bilgiler yüklenemedi.</p>';
    }
}

function wireMessagesSearch() {
    const inp = document.getElementById("messages-search");
    if (!inp || inp.dataset.wired === "1") return;
    inp.dataset.wired = "1";
    inp.addEventListener("input", () => {
        messagesSearchQuery = inp.value.trim();
        renderMessagesConvList(state.messagesConversations);
        const me = localStorage.getItem(AUTH_USER_KEY);
        const threadEl = document.getElementById("messages-thread");
        if (threadEl && messagesThreadMessages.length) {
            const filtered = filterThreadMessagesBySearch(messagesThreadMessages, messagesSearchQuery);
            threadEl.innerHTML = filtered.length
                ? renderMessagesThreadHtml(filtered, me)
                : emptyStateHtml("search", "Mesaj bulunamadı", "Bu sohbette arama metnine uygun mesaj yok.");
        }
    });
}

function wireMessagesContextToggle() {
    const btn = document.getElementById("messages-context-toggle");
    const panel = document.getElementById("messages-context-panel");
    if (!btn || !panel || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
        panel.classList.toggle("hidden");
    });
}
"""

# replace list rendering in loadMessagesPage
t = t.replace(
    """        listEl.innerHTML = convs.length
            ? convs
                  .map(
                      (c) => `
            <button type="button" class="messages-conv-item ${c.id === state.messagesActiveConvId ? "active" : ""}" data-conv-id="${escapeHtml(c.id)}">
                <strong>${escapeHtml(isEmployee() ? c.company_name : c.employee_label)}</strong>
                ${c.unread ? `<span class="msg-unread-badge">${c.unread}</span>` : ""}
                <span class="text-muted msg-preview">${escapeHtml(c.last_message || "—")}</span>
            </button>`
                  )
                  .join("")
            : emptyStateHtml(
                  "comments",
                  "Henüz sohbet yok",
                  "İlan başvuruları, eşleştirme veya karşılaştırma ekranından «Mesaj gönder» ile yazışma başlatın."
              );

        listEl.querySelectorAll("[data-conv-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.messagesActiveConvId = btn.getAttribute("data-conv-id");
                setMessagesThreadOpen(true);
                void openMessagesConversation(state.messagesActiveConvId);
            });
        });""",
    """        renderMessagesConvList(convs);
        wireMessagesSearch();
        wireMessagesContextToggle();""",
)

t = t.replace(
    """        threadEl.innerHTML = msgs.length
            ? msgs.map((msg) => renderMessageBubbleHtml(msg, me)).join("")
            : emptyStateHtml("comment-dots", "İlk mesajı gönderin", "Bu sohbette henüz mesaj yok.");""",
    """        messagesThreadMessages = msgs;
        const showMsgs = filterThreadMessagesBySearch(msgs, messagesSearchQuery);
        threadEl.innerHTML = showMsgs.length
            ? renderMessagesThreadHtml(showMsgs, me)
            : messagesSearchQuery
              ? emptyStateHtml("search", "Mesaj bulunamadı", "Arama metnine uygun mesaj yok.")
              : emptyStateHtml("comment-dots", "İlk mesajı gönderin", "Bu sohbette henüz mesaj yok.");
        const sub = document.getElementById("messages-thread-sub");
        if (sub && data.conversation?.job_id) {
            sub.textContent = data.conversation.job_id ? "" : "";
        }
        void loadMessagesContextPanel(convId);""",
)

# fix sub - use job from context - simpler remove bad sub line
t = t.replace(
    """        const sub = document.getElementById("messages-thread-sub");
        if (sub && data.conversation?.job_id) {
            sub.textContent = data.conversation.job_id ? "" : "";
        }
        void loadMessagesContextPanel(convId);""",
    """        const sub = document.getElementById("messages-thread-sub");
        if (sub) sub.textContent = "";
        void loadMessagesContextPanel(convId);""",
)

p.write_text(t, encoding="utf-8")
print("patched 70-messages")
