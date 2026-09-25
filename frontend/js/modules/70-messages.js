function messagesWsUrl() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = encodeURIComponent(getToken() || "");
    return `${proto}//${window.location.host}/api/messages/ws?token=${token}`;
}

function disconnectMessagesWs() {
    if (messagesWsPingTimer) {
        clearInterval(messagesWsPingTimer);
        messagesWsPingTimer = null;
    }
    if (messagesWs) {
        try {
            messagesWs.close();
        } catch {
            /* ignore */
        }
        messagesWs = null;
    }
}

function connectMessagesWs() {
    if (!getToken() || isAdmin()) return;
    if (messagesWs && messagesWs.readyState === WebSocket.OPEN) return;
    disconnectMessagesWs();
    try {
        messagesWs = new WebSocket(messagesWsUrl());
        messagesWs.onopen = () => {
            messagesWsPingTimer = setInterval(() => {
                if (messagesWs?.readyState === WebSocket.OPEN) messagesWs.send("ping");
            }, 25000);
        };
        messagesWs.onmessage = (ev) => {
            if (ev.data === "pong") return;
            let data;
            try {
                data = JSON.parse(ev.data);
            } catch {
                return;
            }
            if (data.type === "message") {
                void onRealtimeMessage(data);
            }
        };
        messagesWs.onclose = () => {
            if (getToken() && !isAdmin()) {
                setTimeout(connectMessagesWs, 4000);
            }
        };
    } catch {
        /* ignore */
    }
}

async function onRealtimeMessage(data) {
    const convId = data.conversation_id;
    const msg = data.message;
    if (!convId || !msg) return;
    if (state.messagesActiveConvId === convId) {
        appendChatMessage(msg);
        try {
            await api(`/api/messages/conversations/${encodeURIComponent(convId)}/read`, { method: "POST" });
        } catch {
            /* ignore */
        }
    }
    void refreshMessagesBadge();
    void refreshNotificationBadge();
    if (state.currentPage === "messages") {
        await loadMessagesPage({ keepActive: true });
    }
}

async function refreshMessagesBadge() {
    const badge = document.getElementById("sidebar-messages-badge");
    if (!badge || isAdmin()) return;
    try {
        const list = await api("/api/messages/conversations");
        const n = (list || []).reduce((s, c) => s + (c.unread || 0), 0);
        if (n > 0) {
            badge.textContent = n > 99 ? "99+" : String(n);
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    } catch {
        badge.classList.add("hidden");
    }
}

function enrichMessageClient(msg) {
    const conv = state.messagesActiveConv;
    if (!conv || msg.sender_label) return msg;
    const m = { ...msg };
    if (m.sender_role === "company") {
        const parts = [conv.company_name, conv.company_participant_department, conv.company_participant_label]
            .filter(Boolean);
        m.sender_label = parts.join(" · ") || conv.company_participant_username || "Şirket";
    } else {
        m.sender_label = conv.employee_label || m.sender_username || "Aday";
    }
    return m;
}

function appendChatMessage(msg) {
    const box = document.getElementById("messages-thread");
    if (!box) return;
    const me = localStorage.getItem(AUTH_USER_KEY);
    messagesThreadMessages.push(enrichMessageClient(msg));
    renderMessagesThreadWithSearch(box, messagesThreadMessages, me);
}

async function loadJobCompanyPreview() {
    const box = document.getElementById("job-company-preview");
    const linkWrap = document.getElementById("job-company-preview-link-wrap");
    if (!box || !isCompany()) return;
    try {
        const p = await api("/api/company/profile");
        const html = formatCompanyProfileHtml(p, { heading: "Adaylara görünecek şirket bilgileri" });
        if (html) {
            box.innerHTML = html;
            box.classList.remove("hidden");
        } else {
            box.innerHTML =
                '<p class="text-muted">Şirket iletişim bilgisi henüz girilmemiş. Ayarlar’dan ekleyin.</p>';
            box.classList.remove("hidden");
        }
        if (linkWrap) {
            if (isCompanyHrScope()) {
                linkWrap.classList.remove("hidden");
                if (!document.getElementById("job-company-settings-link")) {
                    linkWrap.innerHTML =
                        '<a href="#" id="job-company-settings-link">Şirket iletişim bilgilerini Ayarlar’da düzenle</a>';
                }
            } else {
                linkWrap.innerHTML =
                    '<span class="text-muted" style="font-size:0.75rem">İletişim bilgileri yalnızca İK tarafından güncellenir.</span>';
                linkWrap.classList.remove("hidden");
            }
        }
        const settingsLink = document.getElementById("job-company-settings-link");
        if (settingsLink) {
            settingsLink.onclick = (e) => {
                e.preventDefault();
                navigate("settings");
                setTimeout(() => document.getElementById("settings-company-profile-card")?.scrollIntoView({ behavior: "smooth" }), 200);
            };
        }
    } catch {
        box.classList.add("hidden");
        linkWrap?.classList.add("hidden");
    }
}

async function openChatWithApplicant(employeeUsername, jobId) {
    if (!isCompany() || !employeeUsername) return;
    try {
        const conv = await api("/api/messages/conversations", {
            method: "POST",
            body: JSON.stringify({ employee_username: employeeUsername, job_id: jobId || null }),
        });
        state.messagesActiveConvId = conv.id;
        navigate("messages");
    } catch {
        /* toast */
    }
}

async function openChatWithCompany(companyId, jobId) {
    if (!isEmployee() || !companyId) return;
    if (!jobId) {
        showToast("Mesajlaşma yalnızca başvurduğunuz ilan üzerinden başlatılır.", "warning");
        return;
    }
    try {
        const conv = await api("/api/messages/conversations", {
            method: "POST",
            body: JSON.stringify({ company_id: companyId, job_id: jobId || null }),
        });
        state.messagesActiveConvId = conv.id;
        navigate("messages");
    } catch {
        /* toast */
    }
}

function msgSendToApplicantHtml(employeeUsername, jobId, btnClass = "btn btn-sm btn-secondary") {
    if (!isCompany() || !employeeUsername) return "";
    return `<button type="button" class="${btnClass} btn-msg-send" data-emp="${escapeHtml(employeeUsername)}" data-job="${escapeHtml(jobId || "")}"><i class="fas fa-paper-plane"></i> Mesaj gönder</button>`;
}

function msgSendToCompanyHtml(companyId, jobId, btnClass = "btn btn-sm btn-secondary") {
    if (!isEmployee() || !companyId) return "";
    return `<button type="button" class="${btnClass} btn-msg-send-emp" data-company-id="${escapeHtml(companyId)}" data-job="${escapeHtml(jobId || "")}"><i class="fas fa-paper-plane"></i> Mesaj gönder</button>`;
}

function wireContextMessageButtons(root) {
    const scope = root || document;
    scope.querySelectorAll(".btn-msg-send").forEach((btn) => {
        if (btn.dataset.msgWired === "1") return;
        btn.dataset.msgWired = "1";
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const emp = btn.getAttribute("data-emp");
            const jid = btn.getAttribute("data-job");
            if (emp) void openChatWithApplicant(emp, jid);
        });
    });
    scope.querySelectorAll(".btn-msg-send-emp").forEach((btn) => {
        if (btn.dataset.msgWired === "1") return;
        btn.dataset.msgWired = "1";
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const cid = btn.getAttribute("data-company-id");
            const jid = btn.getAttribute("data-job");
            if (cid) void openChatWithCompany(cid, jid);
        });
    });
}

async function applicantsByCvForJob(jobId) {
    if (!jobId) return {};
    try {
        const apps = await api(`/api/applications/job/${encodeURIComponent(jobId)}`);
        return Object.fromEntries((apps || []).filter((a) => a.cv_id).map((a) => [a.cv_id, a.applicant_username]));
    } catch {
        return {};
    }
}

async function loadMessagesPage(opts = {}) {
    if (isAdmin()) {
        navigate("admin");
        return;
    }
    connectMessagesWs();
    const listEl = document.getElementById("messages-conv-list");
    const threadEl = document.getElementById("messages-thread");
    const headerEl = document.getElementById("messages-thread-header");
    if (!listEl) return;

    try {
        const convs = await api("/api/messages/conversations");
        state.messagesConversations = convs || [];
        if (!opts.keepActive && !state.messagesActiveConvId && convs.length) {
            state.messagesActiveConvId = convs[0].id;
        }
        renderMessagesConvList(convs);
        wireMessagesSearch();
        wireMessagesContextToggle();

        if (state.messagesActiveConvId) {
            setMessagesThreadOpen(true);
            await openMessagesConversation(state.messagesActiveConvId);
        } else {
            setMessagesThreadOpen(false);
            if (threadEl) {
                threadEl.innerHTML = emptyStateHtml(
                    "inbox",
                    "Sohbet seçin",
                    "Soldan mevcut bir sohbeti seçin."
                );
            }
            const titleEl = document.getElementById("messages-thread-title");
            if (titleEl) titleEl.textContent = "Mesajlar";
        }
        void refreshMessagesBadge();
    } catch {
        listEl.innerHTML = emptyStateHtml(
            "triangle-exclamation",
            "Yüklenemedi",
            "Mesaj listesi alınamadı.",
            `<button type="button" class="btn btn-sm btn-secondary" onclick="loadMessagesPage()">Tekrar dene</button>`
        );
    }
}

async function openMessagesConversation(convId) {
    if (!convId) return;
    state.messagesActiveConvId = convId;
    const threadEl = document.getElementById("messages-thread");
    const titleEl = document.getElementById("messages-thread-title");
    const inputEl = document.getElementById("messages-input");
    if (!threadEl) return;
    setMessagesThreadOpen(true);
    threadEl.innerHTML = '<p class="text-muted">Yükleniyor…</p>';
    try {
        const data = await api(`/api/messages/conversations/${encodeURIComponent(convId)}/messages`);
        const conv = data.conversation;
        const title = isEmployee()
            ? conv.contact_label || conv.company_name || "Şirket"
            : conv.employee_label || "Aday";
        if (titleEl) titleEl.textContent = title;
        state.messagesActiveConv = conv;
        const me = localStorage.getItem(AUTH_USER_KEY);
        const msgs = data.messages || [];
        messagesThreadMessages = msgs;
        messagesThreadSearchQuery = "";
        const threadSearchInp = document.getElementById("messages-thread-search");
        if (threadSearchInp) threadSearchInp.value = "";
        renderMessagesThreadWithSearch(threadEl, msgs, me);
        const sub = document.getElementById("messages-thread-sub");
        if (sub) {
            sub.textContent = conv.job_title || "";
        }
        void loadMessagesContextPanel(convId);
        threadEl.scrollTop = threadEl.scrollHeight;
        document.querySelectorAll(".messages-conv-item").forEach((el) => {
            el.classList.toggle("active", el.getAttribute("data-conv-id") === convId);
        });
        if (inputEl) inputEl.focus();
        void refreshMessagesBadge();
    } catch {
        threadEl.innerHTML = emptyStateHtml(
            "triangle-exclamation",
            "Sohbet açılamadı",
            "Bağlantı veya yetki sorunu olabilir.",
            `<button type="button" class="btn btn-sm btn-secondary" id="msg-thread-retry-btn">Tekrar dene</button>`
        );
        document.getElementById("msg-thread-retry-btn")?.addEventListener("click", () => {
            void openMessagesConversation(convId);
        });
    }
}

async function sendCurrentMessage() {
    const input = document.getElementById("messages-input");
    const convId = state.messagesActiveConvId;
    if (!input || !convId) {
        showToast("Önce bir sohbet seçin.", "warning");
        return;
    }
    const body = input.value.trim();
    if (!body) return;
    try {
        const msg = await api(`/api/messages/conversations/${encodeURIComponent(convId)}/messages`, {
            method: "POST",
            body: JSON.stringify({ body }),
        });
        input.value = "";
        appendChatMessage(msg);
    } catch {
        /* toast */
    }
}



let messagesConvSearchQuery = "";
let messagesThreadSearchQuery = "";
let messagesThreadMessages = [];
let messagesSearchMatchIndex = 0;

function filterMessagesConversations(convs, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return convs || [];
    return (convs || []).filter((c) => {
        const label = (isEmployee() ? c.contact_label || c.company_name : c.employee_label) || "";
        const preview = c.last_message || "";
        const job = c.job_title || "";
        const dept = c.company_participant_department || "";
        return (
            label.toLowerCase().includes(s) ||
            preview.toLowerCase().includes(s) ||
            job.toLowerCase().includes(s) ||
            dept.toLowerCase().includes(s)
        );
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
                <span class="messages-conv-item-top">
                    <strong>${escapeHtml(isEmployee() ? c.contact_label || c.company_name : c.employee_label)}</strong>
                    ${c.unread ? `<span class="msg-unread-badge">${c.unread}</span>` : ""}
                </span>
                ${c.job_title ? `<span class="msg-conv-job text-muted">${escapeHtml(c.job_title)}</span>` : ""}
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
            ${showSender ? `<div class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</div>` : ""}
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
            if (pos < 0) hl = false;
            else if (pos === messagesSearchMatchIndex) hl = true;
            else hl = false;
        }
        html += renderMessageBubbleHtmlWithHighlight(msg, me, hl);
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
            if (sub && isEmployee()) {
                const conv = ctx.conversation;
                sub.textContent = [conv?.job_title || ctx.job?.title, conv?.contact_label]
                    .filter(Boolean)
                    .join(" · ");
            } else if (sub && !sub.textContent) {
                sub.textContent = ctx.job.title;
            }
        }
        if (isEmployee() && ctx.company_profile) {
            html += formatCompanyProfileHtml(ctx.company_profile, { heading: "Şirket" });
            html += `<button type="button" class="btn btn-sm btn-secondary messages-ctx-action" data-company-profile-open>Şirket detayı</button>`;
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
            if (id) void openCvDetailModal(id);
        });
        panel.querySelector("[data-company-profile-open]")?.addEventListener("click", () => {
            openCompanyProfileModal(ctx.company_profile, ctx.company_profile?.name || "Şirket");
        });
    } catch {
        panel.innerHTML = '<p class="text-muted">Bilgiler yüklenemedi.</p>';
    }
}

async function deleteActiveConversation() {
    const convId = state.messagesActiveConvId;
    if (!convId) {
        showToast("Silinecek sohbet seçin.", "warning");
        return;
    }
    if (!confirm("Bu sohbet ve tüm mesajlar kalıcı olarak silinsin mi?")) return;
    try {
        await api(`/api/messages/conversations/${encodeURIComponent(convId)}`, { method: "DELETE" });
        state.messagesActiveConvId = null;
        messagesThreadMessages = [];
        showToast("Sohbet silindi.", "success");
        await loadMessagesPage();
    } catch {
        /* toast */
    }
}

function wireMessagesSearch() {
    wireMessagesConvSearch();
    wireMessagesThreadSearch();
    wireMessagesContextToggle();
    wireMessagesDeleteBtn();
}

function wireMessagesDeleteBtn() {
    const btn = document.getElementById("messages-delete-conv-btn");
    if (!btn || btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
        void deleteActiveConversation();
    });
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
