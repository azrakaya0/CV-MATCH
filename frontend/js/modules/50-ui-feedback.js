function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icons = {
        success: "fa-check-circle",
        error: "fa-exclamation-circle",
        info: "fa-info-circle",
        warning: "fa-exclamation-triangle",
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${escapeHtml(String(message))}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading() {
    const el = document.getElementById("loading");
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-hidden", "false");
}

function hideLoading() {
    const el = document.getElementById("loading");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-busy", "false");
    el.setAttribute("aria-hidden", "true");
}

function isLocalDevHost() {
    const h = (location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "";
}

function emptyStateHtml(icon, title, description, actionHtml = "") {
    return `<div class="empty-state">
        <i class="fas fa-${icon}"></i>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(description)}</p>
        ${actionHtml ? `<div class="empty-state-actions">${actionHtml}</div>` : ""}
    </div>`;
}

function messageSenderLabel(msg, mine) {
    if (mine) return "Siz";
    if (msg.sender_label) return msg.sender_label;
    if (msg.sender_role === "employee") return "Aday";
    return msg.sender_username || "Şirket";
}

function renderMessageBubbleHtml(msg, meUsername) {
    const mine = msg.sender_username === meUsername;
    const showSender =
        !mine &&
        ((isCompany() && msg.sender_role === "company") ||
            (isEmployee() && msg.sender_role === "company"));
    const time = formatMessageDateTime(msg.created_at);
    return `<div class="msg-row ${mine ? "msg-row--mine" : "msg-row--theirs"}">
        <div class="msg-bubble ${mine ? "msg-bubble--mine" : "msg-bubble--theirs"}">
            ${showSender ? `<div class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</div>` : ""}
            <div class="msg-body">${escapeHtml(msg.body)}</div>
            <div class="msg-time" title="${escapeHtml(time)}">${escapeHtml(time)}</div>
        </div>
    </div>`;
}

function renderMessagesThreadHtml(msgs, meUsername) {
    if (!msgs?.length) return "";
    let html = "";
    let lastDay = "";
    msgs.forEach((msg) => {
        const day = formatMessageDayLabel(msg.created_at);
        if (day && day !== lastDay) {
            lastDay = day;
            html += `<div class="msg-day-sep"><span>${escapeHtml(day)}</span></div>`;
        }
        html += renderMessageBubbleHtml(msg, meUsername);
    });
    return html;
}

function setMessagesThreadOpen(open) {
    const layout = document.querySelector(".messages-layout");
    if (!layout) return;
    layout.classList.toggle("messages-thread-open", !!open);
}

function setupGlobalKeyboardShortcuts() {
    if (document.body.dataset.kbdWired === "1") return;
    document.body.dataset.kbdWired = "1";
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const openOverlay = document.querySelector(".modal-overlay:not(.hidden)");
        if (openOverlay) {
            openOverlay.classList.add("hidden");
            return;
        }
        if (!document.getElementById("detail-modal")?.classList.contains("hidden")) {
            closeDetailModal();
        }
        closeNotifDropdown();
    });
}

function applyDevOnlyUi() {
    const show = isLocalDevHost();
    document.querySelectorAll(".demo-dev-only").forEach((el) => {
        el.style.display = show ? "" : "none";
    });
}

async function renderDashboardAlerts() {
    const box = document.getElementById("dashboard-alerts");
    if (!box) return;
    const alerts = [];
    if (isCompany() && isCompanyHrScope()) {
        try {
            const p = await api("/api/company/profile");
            const hasContact = !!(p?.email?.trim() || p?.phone?.trim());
            if (!hasContact) {
                alerts.push({
                    type: "warning",
                    icon: "building",
                    text: "Şirket iletişim bilgileriniz eksik. Adaylar ilanlarda e-posta ve telefon göremez.",
                    action: `<button type="button" class="btn btn-sm btn-primary" id="dash-alert-profile-btn">Bilgileri ekle</button>`,
                });
            }
        } catch {
            /* ignore */
        }
    }
    if (isEmployee()) {
        try {
            const apps = await api("/api/applications/my");
            if (!apps.length) {
                alerts.push({
                    type: "info",
                    icon: "compass",
                    text: "Henüz başvuru yapmadınız. İlanlara göz atıp CV’nizle başvurabilirsiniz.",
                    action: `<button type="button" class="btn btn-sm btn-secondary" onclick="navigate('jobs-browse')">İlanlara git</button>`,
                });
            }
        } catch {
            /* ignore */
        }
    }
    if (!alerts.length) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }
    box.classList.remove("hidden");
    box.innerHTML = alerts
        .map(
            (a) => `
        <div class="alert-banner alert-banner--${a.type}">
            <i class="fas fa-${a.icon}"></i>
            <span>${escapeHtml(a.text)}</span>
            ${a.action ? `<div class="alert-banner-actions">${a.action}</div>` : ""}
        </div>`
        )
        .join("");
    document.getElementById("dash-alert-profile-btn")?.addEventListener("click", () => {
        navigate("settings");
        setTimeout(() => document.getElementById("settings-company-profile-card")?.scrollIntoView({ behavior: "smooth" }), 200);
    });
}

function launchConfetti() {
    const canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#6d9eff", "#8b7cf8", "#34c38f", "#e8b84a", "#f07178", "#3ecfbc", "#9d8df7"];
    const particles = [];

    for (let i = 0; i < 120; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 8 + 4,
            h: Math.random() * 4 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: Math.random() * 3 + 2,
            vx: (Math.random() - 0.5) * 2,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
        });
    }

    let frame = 0;
    const maxFrames = 180;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frame++;

        const fadeStart = maxFrames * 0.7;
        particles.forEach((p) => {
            p.y += p.vy;
            p.x += p.vx;
            p.rotation += p.rotSpeed;

            if (frame > fadeStart) {
                p.opacity = Math.max(0, 1 - (frame - fadeStart) / (maxFrames - fadeStart));
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });

        if (frame < maxFrames) {
            requestAnimationFrame(draw);
        } else {
            canvas.remove();
        }
    }

    requestAnimationFrame(draw);
}

let messagesWs = null;
let messagesWsPingTimer = null;

