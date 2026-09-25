function _ragStorageKey() {
    if (ragActiveKey) return ragActiveKey;
    if (!ragJobIdForRag) return "ragv2__draft";
    if (state.ragScopeAll) return `ragv2all__${ragJobIdForRag}`;
    if (ragSelectedCvIds.length === 0) return "ragv2__draft";
    const sorted = [...ragSelectedCvIds].sort().join("__");
    return `ragv2__${ragJobIdForRag}__${sorted}`;
}

function _getAllRagKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k === "ragv2__draft") continue;
        if (k.startsWith("ragv2__") || k.startsWith("ragv2all__")) keys.push(k);
    }
    return keys;
}

function _loadRagStored() {
    try {
        const raw = JSON.parse(localStorage.getItem(_ragStorageKey()) || "null");
        if (!raw) return { meta: {}, messages: [] };
        if (Array.isArray(raw)) return { meta: {}, messages: raw };
        return { meta: raw.meta || {}, messages: raw.messages || [] };
    } catch { return { meta: {}, messages: [] }; }
}

function _loadRagHistory() {
    return _loadRagStored().messages;
}

function _saveRagStored(stored) {
    try {
        stored.messages = stored.messages.slice(-50);
        localStorage.setItem(_ragStorageKey(), JSON.stringify(stored));
    } catch {}
}

function _saveRagHistory(messages) {
    const stored = _loadRagStored();
    stored.messages = messages;
    _saveRagStored(stored);
}

function _pushRagMsg(role, text, sources) {
    const stored = _loadRagStored();
    stored.messages.push({ role, text, sources: sources || [] });
    if (!stored.meta.cvName) {
        stored.meta = _buildRagMeta();
    }
    _saveRagStored(stored);
}

function _buildRagMeta() {
    const js = document.getElementById("rag-job-select");
    const jobLabel = js && js.selectedIndex > 0 ? js.options[js.selectedIndex].text : "İlan";
    const scope = state.ragScopeAll ? "tüm başvuranlar" : `${ragSelectedCvIds.length} seçili`;
    return {
        mode: ragMode,
        cvName: `${jobLabel} · ${scope}`,
    };
}

function _detectCategory(question) {
    const q = question.toLowerCase();
    const map = {
        skills: ["beceri", "skill", "teknik", "programlama", "yazılım", "biliyor mu", "kullanıyor mu"],
        education: ["eğitim", "üniversite", "okul", "mezun", "lisans", "bölüm", "fakülte"],
        experience: ["deneyim", "tecrübe", "çalış", "iş", "şirket", "pozisyon", "kaç yıl", "staj"],
        languages: ["dil", "ingilizce", "almanca", "fransızca", "yabancı dil"],
        contact: ["iletişim", "email", "telefon", "numara", "adres", "mail"],
    };
    for (const [cat, keywords] of Object.entries(map)) {
        if (keywords.some(kw => q.includes(kw))) return cat;
    }
    return "general";
}

function setRagScope(allApplicants) {
    state.ragScopeAll = !!allApplicants;
    ragActiveKey = null;
    document.getElementById("rag-scope-all")?.classList.toggle("active", state.ragScopeAll);
    document.getElementById("rag-scope-pick")?.classList.toggle("active", !state.ragScopeAll);
    document.getElementById("rag-cv-multi-selector")?.classList.toggle("hidden", state.ragScopeAll);
    renderRagChat();
    renderRagHistoryBar();
}

async function refreshRagApplicantCheckboxes(jobId) {
    const checkboxDiv = document.getElementById("rag-cv-checkboxes");
    if (!checkboxDiv) return;
    if (!jobId) {
        checkboxDiv.innerHTML = "<p class=\"text-muted\">İlan seçin</p>";
        return;
    }
    try {
        const rows = await api(`/api/applications/job/${jobId}`);
        ragSelectedCvIds = ragSelectedCvIds.filter((id) => rows.some((r) => r.cv_id === id));
        if (!rows.length) {
            checkboxDiv.innerHTML = "<p class=\"text-muted\">Başvuru yok</p>";
            return;
        }
        checkboxDiv.innerHTML = rows
            .map((r) => {
                const id = r.cv_id;
                const lab = r.applicant_label || `CV #${r.cv_display_id ?? "?"}`;
                const tip = escapeHtml((r.cv_summary || "").slice(0, 400));
                const ch = ragSelectedCvIds.includes(id) ? "checked" : "";
                return `<label class="checkbox-label rag-cv-row" title="${tip}"><input type="checkbox" value="${id}" class="rag-cv-checkbox" ${ch} onchange="onRagCvCheckChange()"><span class="rag-cv-row-text"><strong>${escapeHtml(lab)}</strong><small>${escapeHtml((r.cv_summary || "").slice(0, 120))}${(r.cv_summary || "").length > 120 ? "…" : ""}</small></span></label>`;
            })
            .join("");
    } catch {
        checkboxDiv.innerHTML = "<p class=\"text-muted\">Liste yüklenemedi.</p>";
    }
}

async function loadRagPage() {
    if (!isCompany()) return;
    const allBtn = document.getElementById("rag-scope-all");
    const pickBtn = document.getElementById("rag-scope-pick");
    if (allBtn) allBtn.classList.toggle("hidden", !isCompanyHrScope());
    if (pickBtn) pickBtn.classList.toggle("hidden", !isCompanyHrScope());
    if (!isCompanyHrScope()) {
        state.ragScopeAll = true;
    }
    if (allBtn && !allBtn.dataset.wired) {
        allBtn.dataset.wired = "1";
        allBtn.addEventListener("click", () => setRagScope(true));
    }
    if (pickBtn && !pickBtn.dataset.wired) {
        pickBtn.dataset.wired = "1";
        pickBtn.addEventListener("click", () => setRagScope(false));
    }
    try {
        const jobSel = document.getElementById("rag-job-select");
        if (jobSel) {
            try {
                const jobs = await api(buildJobListUrl());
                jobSel.innerHTML =
                    '<option value="">-- İş ilanı seçin --</option>' +
                    jobs
                        .map((j) => `<option value="${j.id}">${escapeHtml(j.title)}</option>`)
                        .join("");
                jobSel.onchange = async function () {
                    ragJobIdForRag = this.value;
                    ragActiveKey = null;
                    ragSelectedCvIds = [];
                    await refreshRagApplicantCheckboxes(this.value);
                    renderRagHistoryBar();
                    renderRagChat();
                };
                if (ragJobIdForRag) jobSel.value = ragJobIdForRag;
                await refreshRagApplicantCheckboxes(jobSel.value);
            } catch {
                jobSel.innerHTML = '<option value="">—</option>';
            }
        }
    } catch (e) {}

    setRagScope(state.ragScopeAll);
    renderRagHistoryBar();
    renderRagChat();
}

function onRagCvCheckChange() {
    ragActiveKey = null;
    ragSelectedCvIds = [...document.querySelectorAll(".rag-cv-checkbox:checked")].map((cb) => cb.value);
    renderRagChat();
    renderRagHistoryBar();
}

function renderRagHistoryBar() {
    const bar = document.getElementById("rag-history-bar");
    if (!bar) return;

    const keys = _getAllRagKeys();
    if (keys.length === 0) {
        bar.innerHTML = "";
        return;
    }

    const items = [];
    for (const key of keys) {
        try {
            const raw = JSON.parse(localStorage.getItem(key) || "null");
            if (!raw) continue;

            const isNewFormat = raw && !Array.isArray(raw) && raw.messages;
            const msgs = isNewFormat ? raw.messages : (Array.isArray(raw) ? raw : []);
            const meta = isNewFormat ? (raw.meta || {}) : {};
            if (msgs.length === 0) continue;

            const firstQ = msgs.find(m => m.role === "user");
            const label = firstQ ? firstQ.text.slice(0, 30) : "Sohbet";
            const cvName = meta.cvName || "İlan / adaylar";
            const icon = "fa-comments";

            const isActive = key === _ragStorageKey();

            items.push({ key, cvName, label, isActive, icon });
        } catch {}
    }

    if (items.length === 0) {
        bar.innerHTML = "";
        return;
    }

    bar.innerHTML = `
        <div class="rag-history-header">
            <i class="fas fa-clock"></i> <span>Geçmiş Sohbetler</span>
            <div class="rag-history-actions">
                <button class="rag-history-new-btn" onclick="startNewRagChat()" title="Yeni sohbet">
                    <i class="fas fa-plus"></i> Yeni Sohbet
                </button>
                <button class="rag-history-clear-btn" onclick="clearCurrentRagChat()" title="Aktif sohbeti sil">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
        <div class="rag-history-list">
            ${items.map(it => `
                <button class="rag-history-item ${it.isActive ? 'active' : ''}"
                        onclick="loadRagConversationByKey('${it.key}')">
                    <div class="rag-history-item-icon">
                        <i class="fas ${it.icon}"></i>
                    </div>
                    <div class="rag-history-item-info">
                        <span class="rag-history-item-name">${it.cvName}</span>
                        <span class="rag-history-item-preview">${escapeHtml(it.label)}${it.label.length >= 30 ? '...' : ''}</span>
                    </div>
                    <button class="rag-history-item-delete" onclick="event.stopPropagation(); deleteRagConversation('${it.key}')" title="Sohbeti sil">
                        <i class="fas fa-times"></i>
                    </button>
                </button>
            `).join("")}
        </div>
    `;
}

let ragActiveKey = null;

function loadRagConversationByKey(key) {
    ragActiveKey = key;
    if (key === "ragv2__draft") {
        renderRagHistoryBar();
        renderRagChat();
        return;
    }
    if (key.startsWith("ragv2all__")) {
        state.ragScopeAll = true;
        ragJobIdForRag = key.replace("ragv2all__", "");
        ragMode = "selected";
        ragSelectedCvIds = [];
        const js = document.getElementById("rag-job-select");
        if (js && ragJobIdForRag) js.value = ragJobIdForRag;
        document.getElementById("rag-scope-all")?.classList.add("active");
        document.getElementById("rag-scope-pick")?.classList.remove("active");
        document.getElementById("rag-cv-multi-selector")?.classList.add("hidden");
        renderRagHistoryBar();
        renderRagChat();
        return;
    }
    if (!key.startsWith("ragv2__")) {
        renderRagHistoryBar();
        renderRagChat();
        return;
    }
    state.ragScopeAll = false;
    ragMode = "selected";
    const body = key.slice(7);
    const parts = body.split("__").filter(Boolean);
    ragJobIdForRag = parts[0] || "";
    ragSelectedCvIds = parts.slice(1);
    const js = document.getElementById("rag-job-select");
    if (js && ragJobIdForRag) js.value = ragJobIdForRag;
    document.getElementById("rag-scope-all")?.classList.remove("active");
    document.getElementById("rag-scope-pick")?.classList.add("active");
    document.getElementById("rag-cv-multi-selector")?.classList.remove("hidden");
    refreshRagApplicantCheckboxes(ragJobIdForRag).then(() => {
        document.querySelectorAll(".rag-cv-checkbox").forEach((cb) => {
            cb.checked = ragSelectedCvIds.includes(cb.value);
        });
        ragSelectedCvIds = [...document.querySelectorAll(".rag-cv-checkbox:checked")].map((cb) => cb.value);
        renderRagHistoryBar();
        renderRagChat();
    });
}

function deleteRagConversation(key) {
    localStorage.removeItem(key);
    if (key === _ragStorageKey()) {
        renderRagChat();
    }
    renderRagHistoryBar();
}

function clearCurrentRagChat() {
    const key = _ragStorageKey();
    const history = _loadRagHistory();
    if (history.length === 0) return;
    localStorage.removeItem(key);
    ragActiveKey = null;
    renderRagHistoryBar();
    renderRagChat();
}

function startNewRagChat() {
    const key = _ragStorageKey();
    const stored = _loadRagStored();
    if (stored.messages.length > 0) {
        const ts = Date.now();
        localStorage.setItem(key + "_" + ts, JSON.stringify(stored));
        localStorage.removeItem(key);
    }
    ragActiveKey = null;
    renderRagHistoryBar();
    renderRagChat();
}

function renderRagChat() {
    const container = document.getElementById("rag-messages");
    if (!container) return;
    container.innerHTML = "";

    const history = _loadRagHistory();

    if (history.length === 0) {
        container.innerHTML = `
            <div class="rag-welcome">
                <i class="fas fa-robot"></i>
                <h3>Asistan</h3>
                <p>${state.ragScopeAll ? "Tüm başvuranlar" : "Seçili başvuranlar"}</p>
                <div class="rag-suggestions">
                    ${RAG_FOLLOW_UPS_ALL.map(q =>
                        `<button class="rag-suggestion-btn" onclick="askSuggestion(this)">${q}</button>`
                    ).join("")}
                </div>
            </div>
        `;
        return;
    }

    history.forEach(msg => {
        _appendRagBubble(container, msg.role, msg.text, msg.sources, false);
    });

    _appendFollowUps(container, history);
    container.scrollTop = container.scrollHeight;
}

function _appendFollowUps(container, history) {
    const lastUserMsg = [...history].reverse().find(m => m.role === "user");
    if (!lastUserMsg) return;

    const cat = _detectCategory(lastUserMsg.text);
    const suggestions =
        state.ragScopeAll || ragSelectedCvIds.length > 1
            ? RAG_FOLLOW_UPS_ALL
            : RAG_FOLLOW_UPS[cat] || RAG_FOLLOW_UPS.general;

    const askedQuestions = history.filter(m => m.role === "user").map(m => m.text.toLowerCase());
    const filtered = suggestions.filter(s => !askedQuestions.includes(s.toLowerCase()));
    if (filtered.length === 0) return;

    const div = document.createElement("div");
    div.className = "rag-followup-suggestions";
    div.innerHTML = filtered.map(q =>
        `<button class="rag-suggestion-btn" onclick="askSuggestion(this)">${q}</button>`
    ).join("");
    container.appendChild(div);
}

function askSuggestion(btn) {
    const input = document.getElementById("rag-input");
    input.value = btn.textContent;
    askRag();
}

async function askRag() {
    ragActiveKey = null;
    const input = document.getElementById("rag-input");
    const question = input.value.trim();
    if (!question) return;

    ragJobIdForRag = document.getElementById("rag-job-select")?.value || ragJobIdForRag;
    if (!ragJobIdForRag) {
        showToast("Önce iş ilanı seçin.", "warning");
        return;
    }
    if (!state.ragScopeAll && ragSelectedCvIds.length < 1) {
        showToast("“Seçili başvuranlar” modunda en az bir aday işaretleyin veya “Tüm başvuranlar”a geçin.", "warning");
        return;
    }

    const welcome = document.querySelector(".rag-welcome");
    if (welcome) welcome.remove();
    const oldFollowups = document.querySelector(".rag-followup-suggestions");
    if (oldFollowups) oldFollowups.remove();

    _pushRagMsg("user", question);
    const container = document.getElementById("rag-messages");
    _appendRagBubble(container, "user", question);

    input.value = "";
    const typingId = addRagTyping();

    try {
        const payload = state.ragScopeAll
            ? { question, mode: "job", job_id: ragJobIdForRag }
            : {
                question,
                mode: "selected",
                cv_ids: ragSelectedCvIds,
                job_id: ragJobIdForRag,
            };

        const result = await api("/api/rag/ask", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        removeRagTyping(typingId);
        _pushRagMsg("ai", result.answer, result.sources);
        _appendRagBubble(container, "ai", result.answer, result.sources);

        _appendFollowUps(container, _loadRagHistory());
        renderRagHistoryBar();
    } catch (e) {
        removeRagTyping(typingId);
        _pushRagMsg("ai", "Bir hata oluştu. Lütfen tekrar deneyin.");
        _appendRagBubble(container, "ai", "Bir hata oluştu. Lütfen tekrar deneyin.");
    }
    container.scrollTop = container.scrollHeight;
}

function _appendRagBubble(container, role, text, sources) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `rag-msg rag-msg-${role}`;

    let html = "";
    if (role === "ai") {
        html += `<div class="rag-msg-avatar"><i class="fas fa-robot"></i></div>`;
    }
    html += `<div class="rag-msg-bubble">`;
    html += role === "user"
        ? `<p>${escapeHtml(text)}</p>`
        : `<p>${formatRagAnswer(text, sources)}</p>`;

    if (sources && sources.length > 0) {
        const srcId = `rag-src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        html += `
            <div class="rag-sources">
                <button class="rag-sources-toggle" onclick="toggleRagSources('${srcId}')">
                    <i class="fas fa-book-open"></i> Kaynaklar (${sources.length})
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="rag-sources-list hidden" id="${srcId}">
                    ${sources.map(s => `
                        <div class="rag-source-item">
                            <div class="rag-source-header">
                                <span class="rag-source-name"><i class="fas fa-file-pdf"></i> ${s.cv_name}</span>
                                <span class="rag-source-actions">
                                    <a href="#" class="rag-source-view" onclick="event.preventDefault(); goToCvDetail('${s.cv_id}')" title="CV'yi görüntüle">
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                    <span class="rag-source-sim">${(s.similarity * 100).toFixed(0)}%</span>
                                </span>
                            </div>
                            <p class="rag-source-text">${escapeHtml(s.text)}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    html += role === "user"
        ? `</div><div class="rag-msg-avatar"><i class="fas fa-user"></i></div>`
        : `</div>`;

    msgDiv.innerHTML = html;
    container.appendChild(msgDiv);
}

function addRagTyping() {
    const container = document.getElementById("rag-messages");
    const id = `typing-${Date.now()}`;
    const div = document.createElement("div");
    div.className = "rag-msg rag-msg-ai";
    div.id = id;
    div.innerHTML = `
        <div class="rag-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="rag-msg-bubble rag-typing">
            <span></span><span></span><span></span>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeRagTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function toggleRagSources(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden");
}

function formatRagAnswer(text, sources) {
    let html = escapeHtml(text);

    html = html.replace(/\*\*(.+?)\*\*/g, (match, name) => {
        const cvId = _findCvIdByName(name, sources);
        if (cvId) {
            return `<a class="rag-cv-link" href="#" onclick="event.preventDefault(); goToCvDetail('${cvId}')">${name}</a>`;
        }
        return `<strong>${name}</strong>`;
    });

    html = html.replace(/📌/g, "<br>📌");
    html = html.replace(/\n/g, "<br>");
    return html;
}

