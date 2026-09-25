function stopNotificationPolling() {
    if (notifPollTimer) {
        clearInterval(notifPollTimer);
        notifPollTimer = null;
    }
}

async function refreshNotificationBadge() {
    if (isAdmin() || !getToken()) return;
    if (!isCompany() && !isEmployee()) return;
    try {
        const r = await fetch("/api/notifications/unread-count", { headers: authHeaders() });
        if (!r.ok) return;
        const d = await r.json();
        const n = Number(d.count) || 0;
        const badge = document.getElementById("sidebar-notif-badge");
        if (!badge) return;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.classList.toggle("hidden", n === 0);
    } catch {
        /* ignore */
    }
}

function startNotificationPolling() {
    stopNotificationPolling();
    if (isAdmin() || !getToken()) return;
    if (!isCompany() && !isEmployee()) return;
    void refreshNotificationBadge();
    notifPollTimer = setInterval(() => {
        void refreshNotificationBadge();
    }, 45000);
}

function positionNotifDropdown() {
    const btn = document.getElementById("sidebar-notifications-btn");
    const panel = document.getElementById("notif-dropdown");
    if (!btn || !panel || panel.classList.contains("hidden")) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(376, window.innerWidth - 16);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    panel.style.width = `${w}px`;
    panel.style.left = `${left}px`;
    const margin = 6;
    const estH = Math.min(320, window.innerHeight * 0.55);
    let top = r.bottom + margin;
    if (top + estH > window.innerHeight - 8) {
        top = Math.max(8, r.top - estH - margin);
    }
    panel.style.top = `${top}px`;
}

function closeNotifDropdown() {
    const panel = document.getElementById("notif-dropdown");
    const bell = document.getElementById("sidebar-notifications-btn");
    if (panel) panel.classList.add("hidden");
    bell?.classList.remove("is-notif-open");
    window.removeEventListener("resize", positionNotifDropdown);
}

function notifRowIconClass(n) {
    const k = n.kind || "";
    if (k === "message") return "fa-comment";
    if (k === "application_submitted") return "fa-paper-plane";
    if (k === "application_new") return "fa-user-check";
    const m = String(n.message || "").toLowerCase();
    if (m.includes("mesaj")) return "fa-comment";
    if (m.includes("başvuru")) return "fa-user-check";
    return "fa-bell";
}

async function handleNotificationClick(n) {
    if (n.kind === "message" && n.conversation_id) {
        state.messagesActiveConvId = n.conversation_id;
        navigate("messages");
        // Clear notification badge when clicking messages
        await refreshNotificationBadge();
        return;
    }
    if (n.kind === "application_submitted") {
        navigate("employee-applications");
        return;
    }
    if ((n.kind === "application_new" || n.job_id) && isCompany()) {
        if (n.job_id) state.applicantsJobId = n.job_id;
        navigate("job-applicants");
        return;
    }
    if (n.job_id && isCompany()) {
        state.applicantsJobId = n.job_id;
        navigate("job-applicants");
    }
}

async function openNotificationsPanel() {
    const body = document.getElementById("notif-dropdown-body");
    if (!body) return;
    body.innerHTML =
        '<div class="notif-loading"><span class="notif-loading__dot"></span><span class="notif-loading__dot"></span><span class="notif-loading__dot"></span></div>';
    try {
        const list = await api("/api/notifications");
        if (!list.length) {
            body.innerHTML = `<div class="notif-empty" role="status">
                <span class="notif-empty__circle"><i class="fas fa-bell-slash" aria-hidden="true"></i></span>
                <p class="notif-empty__title">Henüz bildirim yok</p>
                <p class="notif-empty__hint">Başvuru ve mesajlar burada görünür.</p>
            </div>`;
            return;
        }
        body.innerHTML = list
            .map((n) => {
                const ic = notifRowIconClass(n);
                const jobMeta = n.job_title
                    ? `<span class="notif-row__job"><i class="fas fa-briefcase" aria-hidden="true"></i>${escapeHtml(n.job_title)}</span>`
                    : "";
                const chev = '<span class="notif-row__chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>';
                return `<button type="button" class="notif-row ${n.read ? "is-read" : "is-unread"}" data-nid="${escapeHtml(n.id)}">
                    <span class="notif-row__icon" aria-hidden="true"><i class="fas ${ic}"></i></span>
                    <span class="notif-row__body">
                        <span class="notif-row__msg">${escapeHtml(n.message || "")}</span>
                        ${jobMeta}
                        <span class="notif-row__time">${escapeHtml(formatRelativeNotifTime(n.created_at))}</span>
                    </span>
                    ${chev}
                </button>`;
            })
            .join("");
        body.querySelectorAll(".notif-row").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const nid = btn.getAttribute("data-nid");
                const n = list.find((x) => x.id === nid);
                if (nid) {
                    try {
                        await api(`/api/notifications/${encodeURIComponent(nid)}/read`, {
                            method: "POST",
                        });
                    } catch {
                        /* ignore */
                    }
                    await refreshNotificationBadge();
                    btn.classList.remove("is-unread");
                    btn.classList.add("is-read");
                }
                closeNotifDropdown();
                if (n) await handleNotificationClick(n);
            });
        });
    } catch {
        body.innerHTML = `<div class="notif-empty notif-empty--error" role="alert">
                <span class="notif-empty__circle notif-empty__circle--warn"><i class="fas fa-plug" aria-hidden="true"></i></span>
                <p class="notif-empty__title">Liste yüklenemedi</p>
                <p class="notif-empty__hint">Bağlantınızı kontrol edip tekrar deneyin.</p>
            </div>`;
    }
}

function toggleNotifDropdown() {
    const panel = document.getElementById("notif-dropdown");
    const bell = document.getElementById("sidebar-notifications-btn");
    if (!panel) return;
    if (!panel.classList.contains("hidden")) {
        closeNotifDropdown();
        return;
    }
    setTimeout(() => {
        panel.classList.remove("hidden");
        bell?.classList.add("is-notif-open");
        positionNotifDropdown();
        window.addEventListener("resize", positionNotifDropdown);
        void openNotificationsPanel();
    }, 0);
}
