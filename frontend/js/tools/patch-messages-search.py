from pathlib import Path

p = Path(r"c:\Users\azrka\cvmatch\frontend\js\modules\70-messages.js")
t = p.read_text(encoding="utf-8")

# fix openMessagesConversation render
t = t.replace(
    """        messagesThreadMessages = msgs;
        const showMsgs = filterThreadMessagesBySearch(msgs, messagesSearchQuery);
        threadEl.innerHTML = showMsgs.length
            ? renderMessagesThreadHtml(showMsgs, me)
            : messagesSearchQuery
              ? emptyStateHtml("search", "Mesaj bulunamadı", "Arama metnine uygun mesaj yok.")
              : emptyStateHtml("comment-dots", "İlk mesajı gönderin", "Bu sohbette henüz mesaj yok.");""",
    """        messagesThreadMessages = msgs;
        messagesThreadSearchQuery = "";
        const threadSearchInp = document.getElementById("messages-thread-search");
        if (threadSearchInp) threadSearchInp.value = "";
        renderMessagesThreadWithSearch(threadEl, msgs, me);""",
)

old_tail = t[t.find("let messagesSearchQuery") :]
new_tail = r'''let messagesConvSearchQuery = "";
let messagesThreadSearchQuery = "";
let messagesThreadMessages = [];
let messagesSearchMatchIndex = 0;

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
    const filtered = filterMessagesConversations(convs, messagesConvSearchQuery);
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
              messagesConvSearchQuery ? "Sonuç yok" : "Henüz sohbet yok",
              messagesConvSearchQuery
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

function getThreadSearchMatchIndices(msgs, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return [];
    const idx = [];
    (msgs || []).forEach((m, i) => {
        if ((m.body || "").toLowerCase().includes(s)) idx.push(i);
    });
    return idx;
}

function renderMessageBubbleHtmlWithHighlight(msg, meUsername, highlight) {
    const mine = msg.sender_username === meUsername;
    const showSender =
        !mine &&
        ((isCompany() && msg.sender_role === "company") ||
            (isEmployee() && msg.sender_role === "company"));
    const time = formatMessageDateTime(msg.created_at);
    const dim = highlight === false ? " msg-row--dimmed" : "";
    const hit = highlight === true ? " msg-row--hit" : "";
    return `<div class="msg-row ${mine ? "msg-row--mine" : "msg-row--theirs"}${dim}${hit}" data-msg-idx="${msg._idx ?? ""}">
        <div class="msg-bubble ${mine ? "msg-bubble--mine" : "msg-bubble--theirs"}">
            ${showSender ? `<div class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</motion>` : ""}
            <div class="msg-body">${escapeHtml(msg.body)}</div>
            <div class="msg-time" title="${escapeHtml(time)}">${escapeHtml(time)}</div>
        </div>
    </div>`;
}

function renderMessagesThreadWithSearch(threadEl, msgs, me) {
    if (!threadEl) return;
    const q = messagesThreadSearchQuery.trim().toLowerCase();
    if (!msgs?.length) {
        threadEl.innerHTML = emptyStateHtml("comment-dots", "İlk mesajı gönderin", "Bu sohbette henüz mesaj yok.");
        updateMessagesSearchNav(0, 0);
        return;
    }
  msgs.forEach((m, i) => {
        m._idx = i;
    });
    const matchIdx = getThreadSearchMatchIndices(msgs, q);
    if (q && !matchIdx.length) {
        threadEl.innerHTML = emptyStateHtml("search", "Mesaj bulunamadı", "Bu sohbette arama metnine uygun mesaj yok.");
        updateMessagesSearchNav(0, 0);
        return;
    }
    if (messagesSearchMatchIndex >= matchIdx.length) messagesSearchMatchIndex = 0;
    let html = "";
    let lastDay = "";
    msgs.forEach((msg, i) => {
        const day = formatMessageDayLabel(msg.created_at);
        if (day && day !== lastDay) {
            lastDay = day;
            html += `<div class="msg-day-sep"><span>${escapeHtml(day)}</span></div>`;
        }
        let hl = null;
        if (q) {
            const pos = matchIdx.indexOf(i);
            hl = pos >= 0;
            if (pos === messagesSearchMatchIndex) hl = true;
            else if (pos >= 0) hl = false;
            else hl = false;
        }
        html += renderMessageBubbleHtmlWithHighlight(msg, me, q ? hl : null);
    });
    threadEl.innerHTML = html;
    updateMessagesSearchNav(matchIdx.length, messagesSearchMatchIndex + 1);
    if (q && matchIdx.length) {
        const hit = threadEl.querySelector(".msg-row--hit");
        if (hit) hit.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
        threadEl.scrollTop = threadEl.scrollHeight;
    }
}

function updateMessagesSearchNav(total, current) {
    const nav = document.getElementById("messages-search-nav");
    const countEl = document.getElementById("messages-search-count");
    if (!nav || !countEl) return;
    if (!messagesThreadSearchQuery.trim() || total === 0) {
        nav.classList.add("hidden");
        return;
    }
    nav.classList.remove("hidden");
    countEl.textContent = `${current}/${total}`;
}

function scrollToThreadSearchMatch(delta) {
    const q = messagesThreadSearchQuery.trim().toLowerCase();
    if (!q) return;
    const matchIdx = getThreadSearchMatchIndices(messagesThreadMessages, q);
    if (!matchIdx.length) return;
    messagesSearchMatchIndex = (messagesSearchMatchIndex + delta + matchIdx.length) % matchIdx.length;
    const me = localStorage.getItem(AUTH_USER_KEY);
    const threadEl = document.getElementById("messages-thread");
    renderMessagesThreadWithSearch(threadEl, messagesThreadMessages, me);
}

async function loadMessagesContextPanel(convId) {
    const panel = document.getElementById("messages-context-panel");
    if (!panel) return;
    try {
        const ctx = await api(`/api/messages/conversations/${encodeURIComponent(convId)}/context`);
        let html = "";
        if (ctx.job?.title) {
            html += `<p class="messages-ctx-job"><i class="fas fa-briefcase"></i> ${escapeHtml(ctx.job.title)}</p>`;
            const sub = document.getElementById("messages-thread-sub");
            if (sub) sub.textContent = ctx.job.title;
        }
        if (isEmployee() && ctx.company_profile) {
            html += formatCompanyProfileHtml(ctx.company_profile, { heading: "Şirket" });
        }
        if (isCompany() && ctx.cv_summary) {
            const cv = ctx.cv_summary;
            html += `<motion class="messages-ctx-cv">
                <p class="company-profile-heading">Aday CV</p>
                <p><strong>${escapeHtml(cv.name)}</strong></p>
                ${cv.email ? `<p class="text-muted"><i class="fas fa-envelope"></i> ${escapeHtml(cv.email)}</p>` : ""}
                ${cv.phone ? `<p class="text-muted"><i class="fas fa-phone"></i> ${escapeHtml(cv.phone)}</p>` : ""}
                ${cv.skills?.length ? `<p class="text-muted">Beceriler: ${escapeHtml(cv.skills.join(", "))}</p>` : ""}
                <button type="button" class="btn btn-sm btn-secondary" data-cv-open="${escapeHtml(cv.id)}">CV detayı</button>
            </div>`;
        }
        if (!html) html = '<p class="text-muted">Ek bilgi yok.</p>';
        panel.innerHTML = html.replace("<motion class=", "<motion class=").replace('</motion>', '</div>').replace("<motion class=", "<div class=");
        while "<motion" in panel.innerHTML:
            panel.innerHTML = panel.innerHTML.replace("<motion", "<div", 1).replace("</motion>", "</div>", 1)
        panel.querySelector("[data-cv-open]")?.addEventListener("click", (e) => {
            const id = e.currentTarget.getAttribute("data-cv-open");
            if (id) goToCvDetail(id);
        });
    } catch {
        panel.innerHTML = '<p class="text-muted">Bilgiler yüklenemedi.</p>';
    }
}

function wireMessagesSearch() {
    wireMessagesConvSearch();
    wireMessagesThreadSearch();
    wireMessagesContextToggle();
}

function wireMessagesConvSearch() {
    const inp = document.getElementById("messages-conv-search");
    if (!inp || inp.dataset.wired === "1") return;
    inp.dataset.wired = "1";
    inp.addEventListener("input", () => {
        messagesConvSearchQuery = inp.value.trim();
        renderMessagesConvList(state.messagesConversations);
    });
}

function wireMessagesThreadSearch() {
    const inp = document.getElementById("messages-thread-search");
    if (!inp || inp.dataset.wired === "1") return;
    inp.dataset.wired = "1";
    inp.addEventListener("input", () => {
        messagesThreadSearchQuery = inp.value.trim();
        messagesSearchMatchIndex = 0;
        const me = localStorage.getItem(AUTH_USER_KEY);
        renderMessagesThreadWithSearch(document.getElementById("messages-thread"), messagesThreadMessages, me);
    });
    document.getElementById("messages-search-prev")?.addEventListener("click", () => scrollToThreadSearchMatch(-1));
    document.getElementById("messages-search-next")?.addEventListener("click", () => scrollToThreadSearchMatch(1));
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
'''

# clean motion typos in new_tail
new_tail = new_tail.replace("<motion class=", "<div class=").replace("</motion>", "</motion>")
new_tail = new_tail.replace('</motion>', '</motion>')
while "<motion" in new_tail:
    new_tail = new_tail.replace("<motion", "<div", 1)
while "</motion>" in new_tail:
    new_tail = new_tail.replace("</motion>", "</div>", 1)
# fix renderMessageBubbleHtmlWithHighlight sender line
new_tail = new_tail.replace(
    '${showSender ? `<motion class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</motion>` : ""}',
    '${showSender ? `<div class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</div>` : ""}',
)
new_tail = new_tail.replace(
    'html += `<motion class="messages-ctx-cv">',
    'html += `<div class="messages-ctx-cv">',
)
# remove broken panel.innerHTML replace loop - simplify loadMessagesContextPanel
new_tail = new_tail.replace(
    """        panel.innerHTML = html.replace("<motion class=", "<motion class=").replace('</motion>', '</motion>').replace("<motion class=", "<motion class=");
        while "<motion" in panel.innerHTML:
            panel.innerHTML = panel.innerHTML.replace("<motion", "<div", 1).replace("</motion>", "</motion>", 1)
""",
    "        panel.innerHTML = html;",
)

# fix highlight logic - simplify renderMessageBubbleHtmlWithHighlight
new_tail = new_tail.replace(
    """        let hl = null;
        if (q) {
            const pos = matchIdx.indexOf(i);
            hl = pos >= 0;
            if (pos === messagesSearchMatchIndex) hl = true;
            else if (pos >= 0) hl = false;
            else hl = false;
        }
        html += renderMessageBubbleHtmlWithHighlight(msg, me, q ? hl : null);""",
    """        let hl = null;
        if (q) {
            const pos = matchIdx.indexOf(i);
            if (pos < 0) hl = false;
            else if (pos === messagesSearchMatchIndex) hl = true;
            else hl = false;
        }
        html += renderMessageBubbleHtmlWithHighlight(msg, me, hl);""",
)

if "let messagesSearchQuery" in t:
    t = t[: t.find("let messagesSearchQuery")] + new_tail

# appendChatMessage update messagesThreadMessages
if "messagesThreadMessages.push" not in t:
    t = t.replace(
        """function appendChatMessage(msg) {
    const box = document.getElementById("messages-thread");
    if (!box) return;
    const me = localStorage.getItem(AUTH_USER_KEY);
    const wrap = document.createElement("motion.div");
    wrap.innerHTML = renderMessageBubbleHtml(msg, me);
    const el = wrap.firstElementChild;
    if (el) {
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    }
}""".replace("<motion.div", "<div"),
        """function appendChatMessage(msg) {
    const box = document.getElementById("messages-thread");
    if (!box) return;
    messagesThreadMessages.push(msg);
    const me = localStorage.getItem(AUTH_USER_KEY);
    renderMessagesThreadWithSearch(box, messagesThreadMessages, me);
}""",
    )

# fix append if still old
t = t.replace(
    """    const wrap = document.createElement("div");
    wrap.innerHTML = renderMessageBubbleHtml(msg, me);
    const el = wrap.firstElementChild;
    if (el) {
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    }""",
    """    messagesThreadMessages.push(msg);
    renderMessagesThreadWithSearch(box, messagesThreadMessages, me);""",
)

p.write_text(t, encoding="utf-8")
print("patched 70-messages")
