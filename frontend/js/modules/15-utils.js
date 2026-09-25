function getScoreColor(score) {
    if (score >= 80) return "#5a9a7a";
    if (score >= 60) return "#6b7fd7";
    if (score >= 40) return "#b8954a";
    return "#c46b6b";
}

function wirePasswordToggleBtn(btn) {
    if (btn.dataset.pwWired === "1") return;
    btn.dataset.pwWired = "1";
    const wrap = btn.closest(".password-input-wrap");
    const input = wrap?.querySelector("input");
    if (!input) return;
    btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        const icon = btn.querySelector("i");
        if (icon) {
            icon.classList.toggle("fa-eye", !show);
            icon.classList.toggle("fa-eye-slash", show);
        }
        btn.setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");
    });
}

function wrapPasswordInputWithToggle(input) {
    if (!input || input.closest(".password-input-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "password-input-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "password-toggle-btn";
    btn.setAttribute("data-password-toggle", "");
    btn.setAttribute("aria-label", "Şifreyi göster");
    btn.setAttribute("tabindex", "-1");
    btn.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i>';
    wrap.appendChild(btn);
    wirePasswordToggleBtn(btn);
}

function initPasswordToggles() {
    const autoWrap = [
        "#reg-password",
        "#reg-password2",
        "#reset-new-password",
        "#reset-new-password2",
        "#settings-pw-current",
        "#settings-pw-new",
        "#settings-pw-new2",
        "#settings-new-team-password",
    ];
    autoWrap.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) wrapPasswordInputWithToggle(el);
    });
    document.querySelectorAll("[data-password-toggle]").forEach(wirePasswordToggleBtn);
}

function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function formatMessageDateTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return time;
    return `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })} ${time}`;
}

function formatMessageDayLabel(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = (startOf(now) - startOf(d)) / 86400000;
    if (diff === 0) return "Bugün";
    if (diff === 1) return "Dün";
    return d.toLocaleDateString("tr-TR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

function formatRelativeNotifTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const now = Date.now();
    const diffMs = now - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 45) return "Az önce";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} dk önce`;
    const h = Math.floor(min / 60);
    if (h < 24) return h === 1 ? "1 saat önce" : `${h} saat önce`;
    const days = Math.floor(h / 24);
    if (days === 1) return "Dün";
    if (days < 7) return `${days} gün önce`;
    return formatDate(isoString);
}

function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.substring(0, len) + "..." : str;
}

let ragMode = "selected";
let ragJobIdForRag = "";

const RAG_FOLLOW_UPS = {
    skills: [
        "İş deneyimleri neler?",
        "Hangi üniversiteden mezun?",
        "Yabancı dil biliyor mu?",
    ],
    education: [
        "Teknik becerileri neler?",
        "Kaç yıl deneyimi var?",
        "Hangi şirketlerde çalışmış?",
    ],
    experience: [
        "Teknik becerileri neler?",
        "Eğitim bilgileri neler?",
        "İletişim bilgileri neler?",
    ],
    languages: [
        "Teknik becerileri neler?",
        "Hangi üniversiteden mezun?",
        "Kaç yıl deneyimi var?",
    ],
    contact: [
        "Teknik becerileri neler?",
        "İş deneyimleri neler?",
        "Eğitim bilgileri neler?",
    ],
    general: [
        "Teknik becerileri neler?",
        "İş deneyimleri neler?",
        "Yabancı dil biliyor mu?",
    ],
};

const RAG_FOLLOW_UPS_ALL = [
    "Python bilen adaylar kimler?",
    "Adayların eğitim bilgileri neler?",
    "İngilizce bilen adaylar kimler?",
];

let ragSelectedCvIds = [];

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function renderPaginationBar(containerId, page, totalPages, onPage) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (totalPages <= 1) {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
    }
    el.classList.remove("hidden");
    el.innerHTML = `
        <button type="button" class="btn btn-sm btn-secondary" ${page <= 0 ? "disabled" : ""} data-page-prev>Önceki</button>
        <span class="text-muted">Sayfa ${page + 1} / ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-secondary" ${page >= totalPages - 1 ? "disabled" : ""} data-page-next>Sonraki</button>
    `;
    el.querySelector("[data-page-prev]")?.addEventListener("click", () => {
        if (page > 0) onPage(page - 1);
    });
    el.querySelector("[data-page-next]")?.addEventListener("click", () => {
        if (page < totalPages - 1) onPage(page + 1);
    });
}

