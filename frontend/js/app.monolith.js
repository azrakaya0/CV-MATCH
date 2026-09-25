

const state = {
    cvs: [],
    jobs: [],
    employeeJobs: [],
    currentPage: "dashboard",
    charts: {},
    applicantsJobId: null,
    editingCvId: null,
    kvkkVersion: "1.0",
    jobBrowseFilter: "all",
    pendingApplyJobId: null,
    jobDeptFilter: "",
    ragScopeAll: true,
    jobBrowseSearch: "",
    applicantsJobsSnapshot: [],
    applicantsJobFilter: "",
    ikJobServerDeptFilter: "",
    adminJobCompanyFilter: "",
    adminJobDeptFilter: "",
    jobsPerPage: 9,
    jobListPage: 0,
    jobsBrowsePage: 0,
    matchPrefillCvId: null,
    matchPrefillJobId: null,
    messagesActiveConvId: null,
    messagesConversations: [],
    employeeApplications: [],
};

const AUTH_TOKEN_KEY = "cvmatch_token";
const AUTH_ROLE_KEY = "cvmatch_role";
const AUTH_USER_KEY = "cvmatch_username";
const AUTH_DISPLAY_NAME_KEY = "cvmatch_display_name";
const AUTH_AVATAR_URL_KEY = "cvmatch_avatar_url";
const AUTH_COMPANY_ACCESS_KEY = "cvmatch_company_access";
const AUTH_DEPARTMENT_LABEL_KEY = "cvmatch_company_department";
const AUTH_MANAGED_COMPANIES_KEY = "cvmatch_managed_companies_json";
const AUTH_ACTIVE_COMPANY_ID_KEY = "cvmatch_active_company_id";
const AUTH_THEME_KEY = "cvmatch_theme";

let notifPollTimer = null;

function getThemePreference() {
    return localStorage.getItem(AUTH_THEME_KEY) || "dark";
}

function resolveTheme(pref) {
    if (pref === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return pref === "light" ? "light" : "dark";
}

function updateThemeToggleIcon(resolved) {
    const icon = document.getElementById("sidebar-theme-icon");
    if (!icon) return;
    icon.className = resolved === "light" ? "fas fa-sun" : "fas fa-moon";
}

function applyTheme(pref) {
    const p = pref || getThemePreference();
    const resolved = resolveTheme(p);
    document.documentElement.setAttribute("data-theme", resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "light" ? "#f4f6fa" : "#080a0f";
    updateThemeToggleIcon(resolved);
    const sel = document.getElementById("settings-theme");
    if (sel && sel.value !== p) sel.value = p;
}

function cycleThemePreference() {
    const order = ["dark", "light", "system"];
    const cur = getThemePreference();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem(AUTH_THEME_KEY, next);
    applyTheme(next);
    const labels = { dark: "Koyu tema", light: "Açık tema", system: "Sistem teması" };
    showToast(labels[next] || "Tema güncellendi", "info");
}

function initTheme() {
    applyTheme(getThemePreference());
    try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (getThemePreference() === "system") applyTheme("system");
        });
    } catch {
        /* ignore */
    }
}

function getManagedCompaniesFromStorage() {
    try {
        const raw = localStorage.getItem(AUTH_MANAGED_COMPANIES_KEY);
        if (!raw) return [];
        const j = JSON.parse(raw);
        return Array.isArray(j) ? j : [];
    } catch {
        return [];
    }
}

function setManagedCompaniesList(list) {
    if (!list || !list.length) {
        localStorage.removeItem(AUTH_MANAGED_COMPANIES_KEY);
        localStorage.removeItem(AUTH_ACTIVE_COMPANY_ID_KEY);
        return;
    }
    localStorage.setItem(AUTH_MANAGED_COMPANIES_KEY, JSON.stringify(list));
}

function getActiveCompanyId() {
    const managed = getManagedCompaniesFromStorage();
    if (!managed.length) {
        return (localStorage.getItem(AUTH_ACTIVE_COMPANY_ID_KEY) || "").trim() || null;
    }
    const ids = new Set(managed.map((c) => c.id));
    let id = (localStorage.getItem(AUTH_ACTIVE_COMPANY_ID_KEY) || "").trim();
    if (!id || !ids.has(id)) {
        id = managed[0].id;
        localStorage.setItem(AUTH_ACTIVE_COMPANY_ID_KEY, id);
    }
    return id;
}

function syncCompanyTenantFromMe(data) {
    if (!data || data.role !== "company") {
        localStorage.removeItem(AUTH_MANAGED_COMPANIES_KEY);
        localStorage.removeItem(AUTH_ACTIVE_COMPANY_ID_KEY);
        return;
    }
    let list = [];
    if (Array.isArray(data.companies) && data.companies.length) {
        list = data.companies.map((c) => ({
            id: String(c.id || "").trim(),
            name: String(c.name || "").trim(),
        })).filter((c) => c.id);
    } else if (Array.isArray(data.managed_company_ids) && data.managed_company_ids.length) {
        list = data.managed_company_ids
            .map((id) => ({ id: String(id).trim(), name: "" }))
            .filter((c) => c.id);
    } else if (data.company_id) {
        list = [
            {
                id: String(data.company_id).trim(),
                name: String(data.company_name || "").trim(),
            },
        ].filter((c) => c.id);
    }
    if (!list.length) {
        localStorage.removeItem(AUTH_MANAGED_COMPANIES_KEY);
        localStorage.removeItem(AUTH_ACTIVE_COMPANY_ID_KEY);
        return;
    }
    setManagedCompaniesList(list);
    const ids = new Set(list.map((c) => c.id));
    let active = (localStorage.getItem(AUTH_ACTIVE_COMPANY_ID_KEY) || "").trim();
    const pref = String(data.company_id || "").trim();
    if (active && ids.has(active)) {
        /* keep */
    } else if (pref && ids.has(pref)) {
        active = pref;
        localStorage.setItem(AUTH_ACTIVE_COMPANY_ID_KEY, active);
    } else {
        active = list[0].id;
        localStorage.setItem(AUTH_ACTIVE_COMPANY_ID_KEY, active);
    }
}

function populateSettingsNewTeamCompanySelect() {
    const wrap = document.getElementById("settings-new-team-company-wrap");
    const sel = document.getElementById("settings-new-team-target-company");
    if (!wrap || !sel) return;
    const list = getManagedCompaniesFromStorage();
    const show = list.length > 1 && isCompany() && isCompanyHrScope();
    wrap.classList.toggle("hidden", !show);
    if (!show) return;
    const cur = getActiveCompanyId();
    sel.innerHTML = list
        .map((c) => {
            const label = c.name ? `${c.name}` : c.id;
            return `<option value="${escapeHtml(c.id)}">${escapeHtml(label)}</option>`;
        })
        .join("");
    if (cur && [...sel.options].some((o) => o.value === cur)) {
        sel.value = cur;
    }
}

function refreshSidebarCompanySwitch() {
    const wrap = document.getElementById("sidebar-company-switch-wrap");
    const sel = document.getElementById("sidebar-active-company");
    if (!wrap || !sel) return;
    const list = getManagedCompaniesFromStorage();
    const multi = list.length > 1 && isCompany();
    wrap.classList.toggle("hidden", !multi);
    if (!multi) return;
    const cur = getActiveCompanyId() || list[0].id;
    sel.innerHTML = list
        .map((c) => {
            const label = c.name ? `${c.name}` : c.id;
            return `<option value="${escapeHtml(c.id)}">${escapeHtml(label)}</option>`;
        })
        .join("");
    sel.value = cur;
    if (!sel.dataset.wired) {
        sel.dataset.wired = "1";
        sel.addEventListener("change", () => {
            localStorage.setItem(AUTH_ACTIVE_COMPANY_ID_KEY, sel.value);
            populateSettingsNewTeamCompanySelect();
            showToast("Şirket bağlamı güncellendi.", "success");
            void reloadCurrentCompanyScopedPage();
        });
    }
}

async function reloadCurrentCompanyScopedPage() {
    const p = state.currentPage;
    try {
        if (p === "dashboard") await loadDashboard();
        else if (p === "job") await loadJobs();
        else if (p === "job-applicants") await loadJobApplicantsPage();
        else if (p === "match") await loadMatchPage();
        else if (p === "compare") await loadComparePage();
        else if (p === "rag") await loadRagPage();
        else if (p === "messages") await loadMessagesPage();
        else if (p === "settings") await loadSettingsPage();
    } catch {
        /* loaders toast */
    }
    if (isCompany()) void refreshNotificationBadge();
}

function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getRole() {
    const r = localStorage.getItem(AUTH_ROLE_KEY);
    if (r === "manager") return "company";
    return r || "";
}

function isCompany() {
    return getRole() === "company";
}

function isAdmin() {
    return getRole() === "admin";
}

function isEmployee() {
    return getRole() === "employee";
}

function isCompanyHrScope() {
    if (!isCompany()) return false;
    return (localStorage.getItem(AUTH_COMPANY_ACCESS_KEY) || "hr") === "hr";
}

function buildJobListUrl() {
    const path = "/api/job/list";
    const q = new URLSearchParams();
    if (isAdmin()) {
        const cid = (state.adminJobCompanyFilter || "").trim();
        if (cid) q.set("company_id", cid);
        const d = (state.adminJobDeptFilter || "").trim();
        if (d) q.set("department", d);
    } else if (isCompany() && isCompanyHrScope()) {
        const d = (state.ikJobServerDeptFilter || "").trim();
        if (d) q.set("department", d);
    }
    const s = q.toString();
    return s ? `${path}?${s}` : path;
}

function syncCompanyJobDepartmentInput() {
    const inp = document.getElementById("job-department");
    if (!inp || !isCompany()) return;
    if (isCompanyHrScope()) {
        inp.removeAttribute("readonly");
        return;
    }
    const d = localStorage.getItem(AUTH_DEPARTMENT_LABEL_KEY) || "";
    inp.value = d;
    inp.setAttribute("readonly", "readonly");
}

function isManager() {
    return isCompany() || isAdmin();
}

function authHeaders() {
    const t = getToken();
    const h = {};
    if (t) h.Authorization = `Bearer ${t}`;
    const cid = getActiveCompanyId();
    if (isCompany() && cid) h["X-Company-Id"] = cid;
    return h;
}

function setSession(token, role, username, displayName, avatarUrl, companyAccess, departmentLabel) {
    if (role === "manager") role = "company";
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_ROLE_KEY, role);
    localStorage.setItem(AUTH_USER_KEY, username);
    if (displayName) localStorage.setItem(AUTH_DISPLAY_NAME_KEY, displayName);
    else localStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
    if (avatarUrl) localStorage.setItem(AUTH_AVATAR_URL_KEY, avatarUrl);
    else localStorage.removeItem(AUTH_AVATAR_URL_KEY);
    if (role === "company") {
        localStorage.setItem(AUTH_COMPANY_ACCESS_KEY, companyAccess || "hr");
        if (departmentLabel) localStorage.setItem(AUTH_DEPARTMENT_LABEL_KEY, departmentLabel);
        else localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
    } else {
        localStorage.removeItem(AUTH_COMPANY_ACCESS_KEY);
        localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
        localStorage.removeItem(AUTH_MANAGED_COMPANIES_KEY);
        localStorage.removeItem(AUTH_ACTIVE_COMPANY_ID_KEY);
    }
}

function clearSession() {
    disconnectMessagesWs();
    state.messagesActiveConvId = null;
    state.messagesConversations = [];
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_ROLE_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
    localStorage.removeItem(AUTH_AVATAR_URL_KEY);
    localStorage.removeItem(AUTH_COMPANY_ACCESS_KEY);
    localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
    localStorage.removeItem(AUTH_MANAGED_COMPANIES_KEY);
    localStorage.removeItem(AUTH_ACTIVE_COMPANY_ID_KEY);
}

function cvListLabel(cv) {
    if (isCompany() && cv.display_id != null) {
        return `CV #${cv.display_id}`;
    }
    return cv.data.name || cv.filename || "CV";
}

function refreshSidebarAvatar() {
    const img = document.getElementById("sidebar-avatar-img");
    const fb = document.getElementById("sidebar-avatar-fallback");
    if (!img || !fb) return;
    const url = localStorage.getItem(AUTH_AVATAR_URL_KEY);
    if (url) {
        img.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        img.classList.remove("hidden");
        fb.classList.add("hidden");
    } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        fb.classList.remove("hidden");
    }
}

function stopNotificationPolling() {
    if (notifPollTimer) {
        clearInterval(notifPollTimer);
        notifPollTimer = null;
    }
}

async function refreshNotificationBadge() {
    if (!isCompany() || !getToken()) return;
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
    if (!isCompany() || !getToken()) return;
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
    const m = String(n.message || "").toLowerCase();
    if (m.includes("başvuru")) return "fa-user-check";
    if (m.includes("ilan")) return "fa-briefcase";
    return "fa-bell";
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
                <p class="notif-empty__hint">Yeni başvurular burada görünecek.</p>
            </div>`;
            return;
        }
        body.innerHTML = list
            .map((n) => {
                const ic = notifRowIconClass(n);
                const jobMeta = n.job_title
                    ? `<span class="notif-row__job"><i class="fas fa-briefcase" aria-hidden="true"></i>${escapeHtml(n.job_title)}</span>`
                    : "";
                const chev = n.job_id
                    ? '<span class="notif-row__chev" aria-hidden="true"><i class="fas fa-chevron-right"></i></span>'
                    : "";
                return `<button type="button" class="notif-row ${n.read ? "is-read" : "is-unread"}" data-nid="${escapeHtml(n.id)}" data-job="${escapeHtml(n.job_id || "")}">
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
                const jid = btn.getAttribute("data-job");
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
                if (jid && isCompany()) {
                    state.applicantsJobId = jid;
                    navigate("job-applicants");
                }
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

function updateSettingsAvatarPreview(url) {
    const img = document.getElementById("settings-avatar-preview-img");
    const ic = document.getElementById("settings-avatar-preview-icon");
    if (!img || !ic) return;
    if (url) {
        img.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        img.classList.remove("hidden");
        ic.classList.add("hidden");
    } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        ic.classList.remove("hidden");
    }
}

async function uploadSettingsAvatar() {
    const inp = document.getElementById("settings-avatar-input");
    const upBtn = document.getElementById("settings-avatar-upload");
    const f = inp?.files?.[0];
    if (!f) {
        showToast("Dosya seçin.", "warning");
        return;
    }
    showLoading();
    try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/auth/avatar", {
            method: "POST",
            headers: authHeaders(),
            body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg =
                typeof data.detail === "string" ? data.detail : "Yükleme başarısız";
            throw new Error(msg);
        }
        if (data.avatar_url) {
            localStorage.setItem(AUTH_AVATAR_URL_KEY, data.avatar_url);
            refreshSidebarAvatar();
            updateSettingsAvatarPreview(data.avatar_url);
        }
        showToast("Fotoğraf güncellendi.", "success");
        if (inp) inp.value = "";
        if (upBtn) upBtn.disabled = true;
    } catch (e) {
        showToast(e.message || "Hata", "error");
    } finally {
        hideLoading();
    }
}

let _cameraStream = null;

function stopCameraStream() {
    if (_cameraStream) {
        _cameraStream.getTracks().forEach((t) => t.stop());
        _cameraStream = null;
    }
    const video = document.getElementById("camera-preview");
    if (video) video.srcObject = null;
}

function closeCameraModal() {
    stopCameraStream();
    document.getElementById("camera-modal")?.classList.add("hidden");
}

async function openCameraModal() {
    const modal = document.getElementById("camera-modal");
    const video = document.getElementById("camera-preview");
    const captureBtn = document.getElementById("camera-capture-btn");
    const hint = document.getElementById("camera-permission-hint");
    if (!modal || !video) return;
    modal.classList.remove("hidden");
    if (hint) hint.textContent = "Kamera izni isteniyor…";
    if (captureBtn) captureBtn.disabled = true;
    stopCameraStream();
    try {
        _cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
        });
        video.srcObject = _cameraStream;
        if (hint) hint.textContent = "Kadrajı ayarlayıp fotoğraf çekin.";
        if (captureBtn) captureBtn.disabled = false;
    } catch {
        if (hint) hint.textContent = "Kamera açılamadı. Tarayıcı izinlerini kontrol edin veya dosya yükleyin.";
        showToast("Kamera izni gerekli.", "warning");
    }
}

function captureAvatarFromCamera() {
    const video = document.getElementById("camera-preview");
    const canvas = document.getElementById("camera-canvas");
    const inp = document.getElementById("settings-avatar-input");
    const up = document.getElementById("settings-avatar-upload");
    if (!video || !canvas || !inp) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
        (blob) => {
            if (!blob) {
                showToast("Fotoğraf alınamadı.", "error");
                return;
            }
            const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
            const dt = new DataTransfer();
            dt.items.add(file);
            inp.files = dt.files;
            if (up) up.disabled = false;
            closeCameraModal();
            showToast("Fotoğraf hazır — Kaydet ile yükleyin.", "success");
        },
        "image/jpeg",
        0.9
    );
}

function applyRoleUI() {
    document.querySelectorAll("[data-company-only]").forEach((el) => {
        el.style.display = isCompany() ? "" : "none";
    });
    const employeeOnly = document.querySelectorAll("[data-employee-only]");
    employeeOnly.forEach((el) => {
        el.style.display = isEmployee() ? "" : "none";
    });
    const adminOnly = document.querySelectorAll("[data-admin-only]");
    adminOnly.forEach((el) => {
        el.style.display = isAdmin() ? "" : "none";
    });
    const nameEl = document.querySelector(".profile-name");
    const roleEl = document.querySelector(".profile-role");
    if (nameEl) {
        nameEl.textContent =
            localStorage.getItem(AUTH_DISPLAY_NAME_KEY) ||
            localStorage.getItem(AUTH_USER_KEY) ||
            "Kullanıcı";
    }
    if (roleEl) {
        let base = isAdmin()
            ? "Admin"
            : isCompany()
              ? isCompanyHrScope()
                  ? "İnsan Kaynakları"
                  : "Departman Yetkilisi"
              : "Aday";
        const mc = getManagedCompaniesFromStorage();
        if (isCompany() && mc.length >= 1) {
            const id = getActiveCompanyId();
            const row = mc.find((c) => c.id === id) || mc[0];
            if (row?.name) {
                base += ` · ${row.name}`;
                const dept = localStorage.getItem(AUTH_DEPARTMENT_LABEL_KEY);
                if (dept && !isCompanyHrScope()) {
                    base += ` · ${dept}`;
                }
            }
        }
        roleEl.textContent = base;
    }
    const footerSettings = document.getElementById("sidebar-settings-btn");
    if (footerSettings) {
        footerSettings.style.display =
            isEmployee() || isCompany() || isAdmin() ? "" : "none";
    }
    const footerBell = document.getElementById("sidebar-notifications-btn");
    if (footerBell) {
        footerBell.style.display = isCompany() ? "" : "none";
    }
    stopNotificationPolling();
    startNotificationPolling();
    refreshSidebarAvatar();
    document.querySelectorAll("[data-company-hr-only]").forEach((el) => {
        el.style.display = isCompany() && isCompanyHrScope() ? "" : "none";
    });
    document.querySelectorAll("[data-company-dept-only]").forEach((el) => {
        el.style.display = isCompany() && !isCompanyHrScope() ? "" : "none";
    });
    refreshSidebarCompanySwitch();
    populateSettingsNewTeamCompanySelect();
    updateDashboardQuickStartSteps();
    document.querySelectorAll("[data-messaging-only]").forEach((el) => {
        el.style.display = isEmployee() || isCompany() ? "" : "none";
    });
    const msgLead = document.getElementById("messages-page-lead");
    if (msgLead) {
        msgLead.textContent = isEmployee()
            ? "Başvurduğunuz şirketlerle yazışın. Mesajlar anlık iletilir."
            : isCompany()
              ? isCompanyHrScope()
                  ? "Adaylar ve departman ekibiyle (ortak sohbet) yazışın. İnceleyici ataması ayrı bir süreçtir."
                  : "Başvurduğunuz departman ilanlarındaki adaylarla yazışın."
              : "";
    }
    if (isEmployee() || isCompany()) {
        connectMessagesWs();
        void refreshMessagesBadge();
    } else {
        disconnectMessagesWs();
    }
    applyDevOnlyUi();
}

function updateDashboardQuickStartSteps() {
    const s1 = document.getElementById("dash-step-1-title");
    const s2 = document.getElementById("dash-step-2-title");
    const s3 = document.getElementById("dash-step-3-title");
    const step1 = document.getElementById("dash-step-1");
    const step2 = document.getElementById("dash-step-2");
    const step3 = document.getElementById("dash-step-3");
    if (!s1 || !step1) return;
    if (isAdmin()) {
        s1.textContent = "Yönetim";
        s2.textContent = "Başvurular";
        s3.textContent = "KVKK";
        step1.onclick = () => navigate("admin");
        step2.onclick = () => openAdminApplicationsSection();
        step3.onclick = () => {
            navigate("admin");
            setTimeout(() => document.getElementById("admin-kvkk-html")?.scrollIntoView({ behavior: "smooth" }), 200);
        };
        step2.style.display = "";
        step3.style.display = "";
        return;
    }
    if (isEmployee()) {
        s1.textContent = "CV Hazırla";
        s2.textContent = "İlanlara Göz At";
        s3.textContent = "Mesajlar";
        step1.onclick = () => navigate("employee-cv");
        step2.onclick = () => navigate("jobs-browse");
        step3.onclick = () => navigate("messages");
        step2.style.display = "";
        step3.style.display = "";
        return;
    }
    s1.textContent = "Başvurular";
    s2.textContent = "Mesajlar";
    s3.textContent = "Eşleştir";
    step1.onclick = () => navigate("job-applicants");
    step2.onclick = () => navigate("messages");
    step3.onclick = () => navigate("match");
    step2.style.display = "";
    step3.style.display = "";
}

function showAppShell() {
    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("main-app")?.classList.remove("hidden");
}

function showLoginScreen() {
    document.getElementById("login-screen")?.classList.remove("hidden");
    document.getElementById("main-app")?.classList.add("hidden");
}

async function api(url, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    if (options.body && typeof options.body === "string") {
        headers["Content-Type"] = "application/json";
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 && getToken()) {
            clearSession();
            showLoginScreen();
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                detail: "Bir hata oluştu",
            }));
            const msg = typeof error.detail === "string" ? error.detail : "Bir hata oluştu";
            throw new Error(msg);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            showToast("Bağlantı hatası", "error");
        } else {
            showToast(error.message, "error");
        }
        throw error;
    }
}

async function apiUploadManagerCv(url, file, kvkkAccepted) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kvkk_accepted", kvkkAccepted ? "true" : "false");

    const response = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
    });

    if (response.status === 401 && getToken()) {
        clearSession();
        showLoginScreen();
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Yükleme başarısız" }));
        const msg = typeof error.detail === "string" ? error.detail : "Yükleme başarısız";
        throw new Error(msg);
    }

    return response.json();
}

function cloneEmpTemplate(templateId, listId) {
    const t = document.getElementById(templateId);
    const list = document.getElementById(listId);
    if (!t || !list) return;
    list.appendChild(t.content.cloneNode(true));
}

function initDefaultEmployeeCvRows() {
    if (document.getElementById("emp-exp-list")?.children.length === 0) {
        cloneEmpTemplate("emp-exp-template", "emp-exp-list");
    }
    if (document.getElementById("emp-edu-list")?.children.length === 0) {
        cloneEmpTemplate("emp-edu-template", "emp-edu-list");
    }
    if (document.getElementById("emp-lang-list")?.children.length === 0) {
        cloneEmpTemplate("emp-lang-template", "emp-lang-list");
    }
}

function initEmployeeCvFormUI() {
    const form = document.getElementById("employee-cv-form");
    if (!form) return;
    initDefaultEmployeeCvRows();
    form.addEventListener("click", (e) => {
        if (e.target.closest(".emp-add-exp")) {
            e.preventDefault();
            cloneEmpTemplate("emp-exp-template", "emp-exp-list");
        }
        if (e.target.closest(".emp-add-edu")) {
            e.preventDefault();
            cloneEmpTemplate("emp-edu-template", "emp-edu-list");
        }
        if (e.target.closest(".emp-add-lang")) {
            e.preventDefault();
            cloneEmpTemplate("emp-lang-template", "emp-lang-list");
        }
        if (e.target.closest(".emp-add-ref")) {
            e.preventDefault();
            cloneEmpTemplate("emp-ref-template", "emp-ref-list");
        }
        if (e.target.closest(".emp-remove-entry")) {
            e.preventDefault();
            const card = e.target.closest("[data-emp-entry]");
            const kind = card?.dataset.empEntry;
            if (!card || !kind) return;
            const listId =
                kind === "exp"
                    ? "emp-exp-list"
                    : kind === "edu"
                      ? "emp-edu-list"
                      : kind === "ref"
                        ? "emp-ref-list"
                        : "emp-lang-list";
            const list = document.getElementById(listId);
            if (!list) return;
            const same = list.querySelectorAll(`[data-emp-entry="${kind}"]`);
            if (same.length <= 1) return;
            card.remove();
        }
    });
}

function collectEmployeeCvPayload() {
    const experiences = [];
    document.querySelectorAll('#emp-exp-list [data-emp-entry="exp"]').forEach((row) => {
        experiences.push({
            title: row.querySelector(".js-exp-title")?.value?.trim() || "",
            company: row.querySelector(".js-exp-company")?.value?.trim() || "",
            start: row.querySelector(".js-exp-start")?.value?.trim() || "",
            end: row.querySelector(".js-exp-end")?.value?.trim() || "",
            current: !!row.querySelector(".js-exp-current")?.checked,
            description: row.querySelector(".js-exp-desc")?.value?.trim() || "",
        });
    });
    const educations = [];
    document.querySelectorAll('#emp-edu-list [data-emp-entry="edu"]').forEach((row) => {
        educations.push({
            institution: row.querySelector(".js-edu-inst")?.value?.trim() || "",
            field: row.querySelector(".js-edu-field")?.value?.trim() || "",
            degree: row.querySelector(".js-edu-degree")?.value?.trim() || "",
            year: row.querySelector(".js-edu-year")?.value?.trim() || "",
        });
    });
    const languages = [];
    document.querySelectorAll('#emp-lang-list [data-emp-entry="lang"]').forEach((row) => {
        languages.push({
            name: row.querySelector(".js-lang-name")?.value?.trim() || "",
            level: row.querySelector(".js-lang-level")?.value?.trim() || "",
        });
    });
    return {
        full_name: document.getElementById("emp-full-name")?.value?.trim() || "",
        email: document.getElementById("emp-email")?.value?.trim() || "",
        phone: document.getElementById("emp-phone")?.value?.trim() || "",
        summary: document.getElementById("emp-summary")?.value?.trim() || "",
        experiences,
        educations,
        skills: [...(tagData["emp-skills"] || [])],
        languages,
        references: (() => {
            const refs = [];
            document.querySelectorAll('#emp-ref-list [data-emp-entry="ref"]').forEach((row) => {
                refs.push({
                    name: row.querySelector(".js-ref-name")?.value?.trim() || "",
                    title: row.querySelector(".js-ref-title")?.value?.trim() || "",
                    company: row.querySelector(".js-ref-company")?.value?.trim() || "",
                    phone: row.querySelector(".js-ref-phone")?.value?.trim() || "",
                    email: row.querySelector(".js-ref-email")?.value?.trim() || "",
                });
            });
            return refs;
        })(),
        certifications: [...(tagData["emp-certs"] || [])],
    };
}

function parseCvDuration(duration) {
    const d = (duration || "").trim();
    if (!d) return { start: "", end: "", current: false };
    if (/devam/i.test(d)) {
        const start = d.split(/\s*[—\-–]\s*/)[0]?.trim() || "";
        return { start, end: "", current: true };
    }
    const parts = d.split(/\s*[—\-–]\s*/);
    return {
        start: (parts[0] || "").trim(),
        end: (parts[1] || "").trim(),
        current: false,
    };
}

function fillEmpListFromForm(listId, templateId, items, fillRow) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = "";
    const rows = Array.isArray(items) && items.length ? items : [{}];
    rows.forEach((item) => {
        cloneEmpTemplate(templateId, listId);
        const row = list.lastElementChild;
        if (row) fillRow(row, item);
    });
}

async function loadEmployeeCvIntoForm(cvId) {
    if (!cvId) {
        resetEmployeeCvForm();
        return;
    }
    try {
        showLoading();
        const cv = await api(`/api/cv/${cvId}`);
        const form = cv.employee_form || {};
        const d = cv.data || {};

        document.getElementById("emp-full-name").value =
            form.full_name || d.name || "";
        document.getElementById("emp-email").value = form.email || d.email || "";
        document.getElementById("emp-phone").value = form.phone || d.phone || "";
        const sum = document.getElementById("emp-summary");
        if (sum) sum.value = form.summary || "";

        const exps =
            form.experiences?.length
                ? form.experiences
                : (d.experience || []).map((e) => {
                      const p = parseCvDuration(e.duration);
                      return {
                          title: e.title || "",
                          company: e.company || "",
                          start: p.start,
                          end: p.end,
                          current: p.current,
                          description: e.description || "",
                      };
                  });
        fillEmpListFromForm("emp-exp-list", "emp-exp-template", exps, (row, ex) => {
            row.querySelector(".js-exp-title").value = ex.title || "";
            row.querySelector(".js-exp-company").value = ex.company || "";
            row.querySelector(".js-exp-start").value = ex.start || "";
            row.querySelector(".js-exp-end").value = ex.end || "";
            const cur = row.querySelector(".js-exp-current");
            if (cur) cur.checked = !!ex.current;
            row.querySelector(".js-exp-desc").value = ex.description || "";
        });

        const edus =
            form.educations?.length
                ? form.educations
                : (d.education || []).map((e) => ({
                      institution: e.institution || "",
                      field: e.field || "",
                      degree: e.degree || "",
                      year: e.year || "",
                  }));
        fillEmpListFromForm("emp-edu-list", "emp-edu-template", edus, (row, ed) => {
            row.querySelector(".js-edu-inst").value = ed.institution || "";
            row.querySelector(".js-edu-field").value = ed.field || "";
            row.querySelector(".js-edu-degree").value = ed.degree || "";
            row.querySelector(".js-edu-year").value = ed.year || "";
        });

        const langs = form.languages?.length
            ? form.languages
            : (d.languages || []).map((l) => {
                  const m = String(l).match(/^(.+?)\s*[\(:]\s*(.+?)\s*\)?$/);
                  return m
                      ? { name: m[1].trim(), level: m[2].trim() }
                      : { name: String(l), level: "" };
              });
        fillEmpListFromForm("emp-lang-list", "emp-lang-template", langs, (row, lg) => {
            row.querySelector(".js-lang-name").value = lg.name || "";
            const sel = row.querySelector(".js-lang-level");
            if (sel && lg.level) sel.value = lg.level;
        });

        const refs = form.references?.length
            ? form.references
            : (d.references || []);
        fillEmpListFromForm("emp-ref-list", "emp-ref-template", refs, (row, rf) => {
            row.querySelector(".js-ref-name").value = rf.name || "";
            row.querySelector(".js-ref-title").value = rf.title || "";
            row.querySelector(".js-ref-company").value = rf.company || "";
            row.querySelector(".js-ref-phone").value = rf.phone || "";
            row.querySelector(".js-ref-email").value = rf.email || "";
        });

        tagData["emp-skills"] = [...(form.skills?.length ? form.skills : d.skills || [])];
        tagData["emp-certs"] = [
            ...(form.certifications?.length ? form.certifications : d.certifications || []),
        ];
        renderTags("emp-skills", "tag-skill");
        renderTags("emp-certs", "tag-skill");

        state.editingCvId = cvId;
        const es = document.getElementById("emp-cv-edit-select");
        if (es) es.value = cvId;
        await renderEmployeeCvAnalysis();
    } catch (e) {
        showToast(e.message || "CV yüklenemedi", "error");
    } finally {
        hideLoading();
    }
}

function resetEmployeeCvForm() {
    document.getElementById("emp-full-name").value = "";
    document.getElementById("emp-email").value = "";
    document.getElementById("emp-phone").value = "";
    const sum = document.getElementById("emp-summary");
    if (sum) sum.value = "";
    ["emp-exp-list", "emp-edu-list", "emp-lang-list", "emp-ref-list"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });
    initDefaultEmployeeCvRows();
    tagData["emp-skills"] = [];
    tagData["emp-certs"] = [];
    renderTags("emp-skills", "tag-skill");
    renderTags("emp-certs", "tag-skill");
    const kvkk = document.getElementById("emp-kvkk");
    if (kvkk) kvkk.checked = false;
    const pdf = document.getElementById("emp-pdf");
    if (pdf) pdf.value = "";
    state.editingCvId = null;
    const es = document.getElementById("emp-cv-edit-select");
    if (es) es.value = "";
}

async function submitEmployeeCvForm() {
    const kvkk = document.getElementById("emp-kvkk");
    if (!kvkk?.checked) {
        showToast("KVKK onayı zorunludur.", "warning");
        throw new Error("KVKK onayı gerekli");
    }
    const fd = new FormData();
    fd.append("kvkk_accepted", "true");
    fd.append("cv_payload", JSON.stringify(collectEmployeeCvPayload()));
    const pf = document.getElementById("emp-pdf")?.files?.[0];
    if (pf) fd.append("file", pf);

    const editId = state.editingCvId || document.getElementById("emp-cv-edit-select")?.value || "";
    const url = editId ? `/api/cv/employee/${editId}` : "/api/cv/employee-submit";
    const method = editId ? "PUT" : "POST";

    const response = await fetch(url, {
        method,
        headers: authHeaders(),
        body: fd,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Gönderim başarısız" }));
        const msg = typeof error.detail === "string" ? error.detail : "Gönderim başarısız";
        throw new Error(msg);
    }
    return response.json();
}

async function renderEmployeeCvAnalysis() {
    const wrap = document.getElementById("emp-cv-analysis");
    if (!wrap || !isEmployee()) return;
    const sel = document.getElementById("emp-cv-edit-select");
    const id = state.editingCvId || sel?.value || "";
    if (!id) {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
        return;
    }
    try {
        wrap.classList.remove("hidden");
        wrap.innerHTML = `<p class="text-muted emp-cv-analysis-loading"><i class="fas fa-spinner fa-spin"></i> Yükleniyor…</p>`;
        const cv = await api(`/api/cv/${id}`);
        const d = cv.data || {};
        const skills = (d.skills || []).filter(Boolean).slice(0, 24);
        const ex = (d.experience || []).slice(0, 5);
        const ed = (d.education || []).slice(0, 4);
        const langs = (d.languages || []).filter(Boolean);
        const did = cv.display_id != null ? `CV #${cv.display_id}` : escapeHtml(cv.filename || id);

        const skillHtml = skills.length
            ? `<div class="emp-cv-analysis-skills">${skills.map((s) => `<span class="tag tag-skill">${escapeHtml(String(s))}</span>`).join("")}</div>`
            : "<p class=\"text-muted\">Beceri yok</p>";

        const exHtml =
            ex.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>İş deneyimi</h4><ul class="emp-cv-analysis-list">${ex
                      .map((e) => {
                          const head = [e.title, e.company].filter(Boolean).join(" · ");
                          const sub = [e.duration, e.description].filter(Boolean).join(" — ");
                          if (!head && !sub) return "";
                          return `<li><strong>${escapeHtml(head || "—")}</strong>${sub ? `<br><span class="text-muted">${escapeHtml(sub)}</span>` : ""}</li>`;
                      })
                      .filter(Boolean)
                      .join("")}</ul></div>`;

        const edHtml =
            ed.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>Eğitim</h4><ul class="emp-cv-analysis-list">${ed
                      .map((u) => {
                          const line = [u.institution, u.field, u.degree, u.year].filter(Boolean).join(" · ");
                          return line ? `<li>${escapeHtml(line)}</li>` : "";
                      })
                      .filter(Boolean)
                      .join("")}</ul></div>`;

        const langHtml =
            langs.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>Diller</h4><p>${langs.map((l) => escapeHtml(String(l))).join(", ")}</p></div>`;

        wrap.innerHTML = `
            <div class="emp-cv-analysis-head">
                <h3><i class="fas fa-microscope"></i> Otomatik analiz</h3>
                <span class="emp-cv-analysis-id">${did}</span>
            </div>
            <div class="emp-cv-analysis-block"><h4>Beceriler</h4>${skillHtml}</div>
            ${exHtml}
            ${edHtml}
            ${langHtml}
        `;
    } catch {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
    }
}

async function loadEmployeeCvPage() {
    if (!isEmployee()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const sel = document.getElementById("emp-cv-edit-select");
    if (!sel) return;
    try {
        const cvs = await api("/api/cv/list");
        const cur = state.editingCvId || "";
        sel.innerHTML =
            '<option value="">— Yeni CV oluştur —</option>' +
            cvs.map((c) => `<option value="${c.id}">${escapeHtml(cvListLabel(c))}</option>`).join("");
        sel.value = cur && cvs.some((c) => c.id === cur) ? cur : "";
        if (!sel.value) state.editingCvId = null;
        sel.onchange = () => {
            const id = sel.value || "";
            state.editingCvId = id || null;
            if (id) void loadEmployeeCvIntoForm(id);
            else {
                resetEmployeeCvForm();
                renderEmployeeCvAnalysis();
            }
        };
    } catch {
        sel.innerHTML = '<option value="">—</option>';
    }
    await updateKvkkRevokedBanner();
    if (state.editingCvId) {
        await loadEmployeeCvIntoForm(state.editingCvId);
    } else {
        await renderEmployeeCvAnalysis();
    }
}

async function loadEmployeeApplicationsPage() {
    if (!isEmployee()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const body = document.getElementById("employee-applications-body");
    if (!body) return;
    body.innerHTML = '<p class="text-muted">Yükleniyor…</p>';
    try {
        const [my, cvs] = await Promise.all([
            api("/api/applications/my"),
            api("/api/cv/list").catch(() => []),
        ]);
        state.employeeApplications = my;
        const byCv = new Map((Array.isArray(cvs) ? cvs : []).map((c) => [c.id, cvListLabel(c)]));
        if (!my.length) {
            body.innerHTML = '<p class="text-muted">Başvuru yok</p>';
            return;
        }
        body.innerHTML = renderEmployeeApplicationsTableHtml(my, byCv);
        body.querySelectorAll(".app-withdraw-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-app-id");
                if (id) void withdrawJobApplication(id);
            });
        });
        wireEmployeeApplicationTableRows(body, my, byCv);
    } catch {
        body.innerHTML = '<p class="text-muted">Yüklenemedi</p>';
    }
}

async function withdrawJobApplication(applicationId) {
    if (!isEmployee() || !applicationId) return;
    if (!confirm("Bu başvuruyu geri çekmek istiyor musunuz?")) return;
    try {
        showLoading();
        await api(`/api/applications/my/${encodeURIComponent(applicationId)}`, { method: "DELETE" });
        showToast("Başvuru geri çekildi.", "success");
        if (state.currentPage === "jobs-browse") await loadJobsBrowsePage();
        else if (state.currentPage === "employee-applications") await loadEmployeeApplicationsPage();
        if (state.currentPage === "dashboard") await loadDashboard();
    } catch {
        /* toast from api */
    } finally {
        hideLoading();
    }
}

async function loadSettingsPage() {
    const uEl = document.getElementById("settings-username");
    if (!uEl) return;
    try {
        const me = await api("/api/auth/me");
        const r = me.role === "manager" ? "company" : me.role;
        syncCompanyTenantFromMe({ ...me, role: r });
        if (r === "company") {
            localStorage.setItem(AUTH_COMPANY_ACCESS_KEY, me.company_access || "hr");
            if (me.department) localStorage.setItem(AUTH_DEPARTMENT_LABEL_KEY, me.department);
            else localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
        }
        uEl.value = me.username || "";
        const fn = document.getElementById("settings-full-name");
        const em = document.getElementById("settings-email");
        const ph = document.getElementById("settings-phone");
        if (fn) fn.value = me.full_name || "";
        if (em) em.value = me.email || "";
        if (ph) ph.value = me.phone || "";
        const themeSel = document.getElementById("settings-theme");
        if (themeSel) themeSel.value = getThemePreference();
        const notifyChk = document.getElementById("settings-notify-email");
        if (notifyChk) notifyChk.checked = me.notify_email !== false;
        if (isCompany()) {
            const cn = document.getElementById("settings-company-name");
            const dp = document.getElementById("settings-department");
            if (cn) cn.value = me.company_name || "";
            if (dp) {
                dp.value = me.department || "";
                dp.readOnly = !isCompanyHrScope();
                dp.title = isCompanyHrScope()
                    ? ""
                    : "Departman yetkilisi hesabında departman değiştirilemez.";
            }
        }
        if (me.avatar_url) localStorage.setItem(AUTH_AVATAR_URL_KEY, me.avatar_url);
        else localStorage.removeItem(AUTH_AVATAR_URL_KEY);
        updateSettingsAvatarPreview(me.avatar_url || null);
        refreshSidebarAvatar();
        if (isCompany() && isCompanyHrScope()) {
            try {
                await loadKvkkMeta();
            } catch {
                /* ignore */
            }
            populateSettingsNewTeamCompanySelect();
            await loadSettingsTeamSection();
            await loadSettingsCompanyProfile();
        }
    } catch {
        uEl.value = "";
    }
    ["settings-pw-current", "settings-pw-new", "settings-pw-new2"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
}

function syncSettingsNewTeamDeptVisibility() {
    const v =
        document.querySelector('input[name="settings-new-team-access"]:checked')?.value || "department";
    document.getElementById("settings-new-team-dept-wrap")?.classList.toggle("hidden", v !== "department");
    populateSettingsNewTeamCompanySelect();
}

function settingsTeamToggleRowDeptInput(row) {
    const acc = row.querySelector(".settings-team-access")?.value || "department";
    const inp = row.querySelector(".settings-team-dept");
    if (!inp) return;
    if (acc === "hr") {
        inp.disabled = true;
        inp.placeholder = "İK için boş bırakılabilir";
    } else {
        inp.disabled = false;
        inp.placeholder = "Departman adı";
    }
}

async function loadSettingsTeamSection() {
    const wrap = document.getElementById("settings-team-list");
    if (!wrap || !isCompany() || !isCompanyHrScope()) return;
    const myUn = (localStorage.getItem(AUTH_USER_KEY) || "").trim();
    try {
        const team = await api("/api/applications/company-team");
        if (!team.length) {
            wrap.innerHTML = "<p class=\"text-muted\">Şirket kullanıcısı yok.</p>";
            return;
        }
        wrap.innerHTML = `
            <table class="compare-table settings-team-table">
                <thead><tr><th>Kullanıcı</th><th>Ad</th><th>Erişim</th><th>Departman</th><th></th></tr></thead>
                <tbody>
                    ${team
                        .map((t) => {
                            const isSelf =
                                myUn &&
                                String(t.username || "").toLowerCase() === myUn.toLowerCase();
                            const ca = (t.company_access || "hr") === "hr" ? "hr" : "department";
                            const dept = escapeHtml(t.department || "");
                            const selfNote = isSelf ? " <small class=\"text-muted\">(siz)</small>" : "";
                            return `<tr data-team-user="${escapeHtml(t.username)}">
                                <td>${escapeHtml(t.username)}${selfNote}</td>
                                <td>${escapeHtml(t.full_name || "")}</td>
                                <td>
                                    <select class="settings-team-access" aria-label="Erişim">
                                        <option value="department" ${ca === "department" ? "selected" : ""}>Departman</option>
                                        <option value="hr" ${ca === "hr" ? "selected" : ""}>İK</option>
                                    </select>
                                </td>
                                <td><input type="text" class="settings-team-dept" maxlength="120" value="${dept}" aria-label="Departman"></td>
                                <td><button type="button" class="btn btn-secondary btn-sm settings-team-save-btn">Kaydet</button></td>
                            </tr>`;
                        })
                        .join("")}
                </tbody>
            </table>`;
        wrap.querySelectorAll("[data-team-user]").forEach((row) => {
            settingsTeamToggleRowDeptInput(row);
            row.querySelector(".settings-team-access")?.addEventListener("change", () => {
                settingsTeamToggleRowDeptInput(row);
            });
        });
    } catch {
        wrap.innerHTML = "<p class=\"text-muted\">Liste yüklenemedi.</p>";
    }
}

async function saveSettingsTeamRow(btn) {
    const row = btn.closest("[data-team-user]");
    if (!row) return;
    const username = row.getAttribute("data-team-user");
    const company_access = row.querySelector(".settings-team-access")?.value || "department";
    const department = row.querySelector(".settings-team-dept")?.value?.trim() || "";
    if (company_access === "department" && department.length < 2) {
        showToast("Departman yetkilisi için departman adı en az 2 karakter olmalıdır.", "warning");
        return;
    }
    try {
        showLoading();
        await api(`/api/company/team-member/${encodeURIComponent(username)}`, {
            method: "PATCH",
            body: JSON.stringify({ company_access, department }),
        });
        showToast("Kullanıcı güncellendi.", "success");
        const myUn = (localStorage.getItem(AUTH_USER_KEY) || "").trim();
        if (myUn && String(username).toLowerCase() === myUn.toLowerCase()) {
            localStorage.setItem(AUTH_COMPANY_ACCESS_KEY, company_access);
            if (company_access === "department" && department) {
                localStorage.setItem(AUTH_DEPARTMENT_LABEL_KEY, department);
            } else if (company_access === "hr") {
                localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
            }
            applyRoleUI();
        }
        await loadSettingsTeamSection();
    } catch {
        /* toast from api */
    } finally {
        hideLoading();
    }
}

async function addSettingsTeamMember() {
    if (!isCompany() || !isCompanyHrScope()) return;
    const kvkk = document.getElementById("settings-team-kvkk");
    if (!kvkk?.checked) {
        showToast("KVKK onayı gerekir.", "warning");
        return;
    }
    const username = document.getElementById("settings-new-team-username")?.value?.trim() || "";
    const password = document.getElementById("settings-new-team-password")?.value || "";
    const full_name = document.getElementById("settings-new-team-fullname")?.value?.trim() || "";
    const email = document.getElementById("settings-new-team-email")?.value?.trim() || "";
    const company_access =
        document.querySelector('input[name="settings-new-team-access"]:checked')?.value === "hr"
            ? "hr"
            : "department";
    const department = document.getElementById("settings-new-team-dept")?.value?.trim() || "";
    if (username.length < 3 || password.length < 6) {
        showToast("Kullanıcı adı ve şifre kurallarına uyun.", "warning");
        return;
    }
    if (full_name.length < 2 || email.length < 3) {
        showToast("Ad soyad ve e-posta girin.", "warning");
        return;
    }
    if (company_access === "department" && department.length < 2) {
        showToast("Departman yetkilisi için departman adı girin.", "warning");
        return;
    }
    const mclist = getManagedCompaniesFromStorage();
    let target_company_id;
    if (mclist.length > 1) {
        target_company_id =
            document.getElementById("settings-new-team-target-company")?.value?.trim() || "";
        if (!target_company_id) {
            showToast("Birden fazla şirketiniz var: hedef şirketi seçin.", "warning");
            return;
        }
    }
    try {
        showLoading();
        const payload = {
            username,
            password,
            full_name,
            email,
            company_access,
            department: company_access === "department" ? department : "",
            kvkk_accepted: true,
            kvkk_version: state.kvkkVersion || "1.0",
        };
        if (target_company_id) payload.target_company_id = target_company_id;
        await api("/api/company/team-member", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        showToast("Kullanıcı oluşturuldu.", "success");
        document.getElementById("settings-new-team-username").value = "";
        document.getElementById("settings-new-team-password").value = "";
        document.getElementById("settings-new-team-fullname").value = "";
        document.getElementById("settings-new-team-email").value = "";
        if (kvkk) kvkk.checked = false;
        await loadSettingsTeamSection();
    } catch {
        /* api */
    } finally {
        hideLoading();
    }
}

async function loadSettingsCompanyProfile() {
    if (!isCompany() || !isCompanyHrScope()) return;
    try {
        const p = await api("/api/company/profile");
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v || "";
        };
        set("settings-co-email", p.email);
        set("settings-co-phone", p.phone);
        set("settings-co-address", p.address);
        set("settings-co-website", p.website);
        if (p.name) {
            const cn = document.getElementById("settings-company-name");
            if (cn && !cn.value) cn.value = p.name;
        }
    } catch {
        /* optional */
    }
}

async function saveSettingsCompanyProfile() {
    if (!isCompany() || !isCompanyHrScope()) return;
    const name = document.getElementById("settings-company-name")?.value?.trim() || "";
    const body = {
        name: name || null,
        email: document.getElementById("settings-co-email")?.value?.trim() || null,
        phone: document.getElementById("settings-co-phone")?.value?.trim() || null,
        address: document.getElementById("settings-co-address")?.value?.trim() || null,
        website: document.getElementById("settings-co-website")?.value?.trim() || null,
    };
    if (name && name.length < 2) {
        showToast("Şirket unvanı en az 2 karakter olmalıdır.", "warning");
        return;
    }
    try {
        showLoading();
        await api("/api/company/profile", { method: "PATCH", body: JSON.stringify(body) });
        showToast("Şirket bilgileri kaydedildi. İlanlarda adaylara görünür.", "success");
    } catch {
        /* toast */
    } finally {
        hideLoading();
    }
}

async function saveSettingsProfile() {
    const full_name = document.getElementById("settings-full-name")?.value?.trim() || "";
    const email = document.getElementById("settings-email")?.value?.trim() || "";
    const phone = document.getElementById("settings-phone")?.value?.trim() || "";
    if (full_name.length < 2) {
        showToast("Ad soyad en az 2 karakter olmalıdır.", "warning");
        return;
    }
    const body = {
        full_name,
        email,
        phone,
        notify_email: !!document.getElementById("settings-notify-email")?.checked,
    };
    if (isCompany()) {
        const cn = document.getElementById("settings-company-name")?.value?.trim() || "";
        if (cn.length < 2) {
            showToast("Şirket unvanı en az 2 karakter olmalıdır.", "warning");
            return;
        }
        body.company_name = cn;
        if (isCompanyHrScope()) {
            body.department = document.getElementById("settings-department")?.value?.trim() || null;
        }
    }
    try {
        showLoading();
        await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
        showToast("Profil kaydedildi.", "success");
        const un = localStorage.getItem(AUTH_USER_KEY) || "";
        const av = localStorage.getItem(AUTH_AVATAR_URL_KEY) || "";
        const ca = localStorage.getItem(AUTH_COMPANY_ACCESS_KEY) || "hr";
        let deptLab = localStorage.getItem(AUTH_DEPARTMENT_LABEL_KEY) || undefined;
        if (isCompanyHrScope()) {
            const d = document.getElementById("settings-department")?.value?.trim() || "";
            deptLab = d || undefined;
        }
        setSession(getToken(), getRole(), un, full_name, av || undefined, ca, deptLab);
        applyRoleUI();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function saveSettingsPassword() {
    const current_password = document.getElementById("settings-pw-current")?.value || "";
    const new_password = document.getElementById("settings-pw-new")?.value || "";
    const new_password_confirm = document.getElementById("settings-pw-new2")?.value || "";
    if (!current_password || !new_password) {
        showToast("Mevcut ve yeni şifreyi girin.", "warning");
        return;
    }
    if (new_password.length < 6) {
        showToast("Yeni şifre en az 6 karakter olmalıdır.", "warning");
        return;
    }
    if (new_password !== new_password_confirm) {
        showToast("Yeni şifreler eşleşmiyor.", "warning");
        return;
    }
    try {
        showLoading();
        await api("/api/auth/password", {
            method: "POST",
            body: JSON.stringify({
                current_password,
                new_password,
                new_password_confirm,
            }),
        });
        showToast("Şifre güncellendi. Tekrar giriş yapın.", "success");
        stopNotificationPolling();
        closeNotifDropdown();
        clearSession();
        showLoginScreen();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function loadKvkkMeta() {
    try {
        const d = await fetch("/api/auth/kvkk-document").then((r) => r.json());
        state.kvkkVersion = d.version || "1.0";
        return d;
    } catch {
        state.kvkkVersion = "1.0";
        return { version: "1.0", html: "" };
    }
}

function openKvkkConsentExplainerModal() {
    document.getElementById("kvkk-consent-info-modal")?.classList.remove("hidden");
}

function closeKvkkConsentExplainerModal() {
    document.getElementById("kvkk-consent-info-modal")?.classList.add("hidden");
}

async function openKvkkFullDocumentModal() {
    const d = await loadKvkkMeta();
    const box = document.getElementById("kvkk-modal-body");
    if (box) box.innerHTML = d.html || "";
    document.getElementById("kvkk-modal")?.classList.remove("hidden");
}

function wireJobsBrowseFilterTabs() {
    const tabs = document.getElementById("jobs-browse-filter-tabs");
    if (!tabs || tabs.dataset.wired) return;
    tabs.dataset.wired = "1";
    tabs.querySelectorAll("[data-job-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.jobBrowseFilter = btn.getAttribute("data-job-filter") || "all";
            tabs.querySelectorAll("[data-job-filter]").forEach((b) =>
                b.classList.toggle("active", b === btn)
            );
            loadJobsBrowsePage();
        });
    });
}

function wireJobsBrowseSearch() {
    const inp = document.getElementById("jobs-browse-search");
    if (!inp || inp.dataset.wired) return;
    inp.dataset.wired = "1";
    inp.addEventListener("input", () => {
        state.jobBrowseSearch = (inp.value || "").trim().toLowerCase();
        state.jobsBrowsePage = 0;
        loadJobsBrowsePage();
    });
}

function jobBrowseHaystack(j) {
    const req = j.requirements || {};
    return [
        j.title,
        j.company,
        j.department,
        j.location,
        j.workplace_type,
        j.description,
        ...(req.required_skills || []),
        ...(req.preferred_skills || []),
        ...(req.languages || []),
    ]
        .join(" ")
        .toLowerCase();
}

function workplaceTypeLabel(t) {
    if (t === "remote") return "Uzaktan";
    if (t === "hybrid") return "Hibrit";
    if (t === "onsite") return "Ofiste";
    return "";
}

function applicantSummaryPartsHtml(summary) {
    if (!summary) return "<p class=\"text-muted\">—</p>";
    return summary
        .split(" · ")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p class="applicant-summary-part">${escapeHtml(p)}</p>`)
        .join("");
}

function jobApplicantSelectHaystack(j) {
    const req = j.requirements || {};
    return [
        j.title,
        j.company,
        j.department,
        j.location,
        j.description,
        ...(req.required_skills || []),
        ...(req.preferred_skills || []),
    ]
        .join(" ")
        .toLowerCase();
}

function groupJobsByDepartmentKey(jobs) {
    const m = new Map();
    for (const j of jobs) {
        const k = (j.department || "").trim() || "__none__";
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(j);
    }
    const keys = Array.from(m.keys()).sort((a, b) => {
        if (a === "__none__") return 1;
        if (b === "__none__") return -1;
        return a.localeCompare(b, "tr");
    });
    return keys.map((dept) => ({ dept, jobs: m.get(dept) }));
}

function groupJobsByCompanyThenDepartment(jobs) {
    const byCompany = new Map();
    for (const j of jobs) {
        const ckey = String(j.company_id || j.company_legal_name || j.company || "__unknown__");
        const clabel = (j.company_legal_name || j.company || "Şirket belirtilmemiş").trim();
        if (!byCompany.has(ckey)) {
            byCompany.set(ckey, { label: clabel, depts: new Map() });
        }
        const dept = (j.department || "").trim() || "__none__";
        const entry = byCompany.get(ckey);
        if (!entry.depts.has(dept)) entry.depts.set(dept, []);
        entry.depts.get(dept).push(j);
    }
    return Array.from(byCompany.values()).map((co) => {
        const deptKeys = Array.from(co.depts.keys()).sort((a, b) => {
            if (a === "__none__") return 1;
            if (b === "__none__") return -1;
            return a.localeCompare(b, "tr");
        });
        return {
            companyLabel: co.label,
            departments: deptKeys.map((dept) => ({
                dept,
                jobs: co.depts.get(dept),
            })),
        };
    });
}

function openDetailModal(title, html) {
    const modal = document.getElementById("detail-modal");
    const body = document.getElementById("detail-modal-body");
    const titleEl = document.getElementById("detail-modal-title");
    if (!modal || !body) return;
    if (titleEl) titleEl.textContent = title || "Detay";
    body.innerHTML = html;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeDetailModal() {
    const modal = document.getElementById("detail-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

async function openAdminJobDetail(jobId) {
    if (!isAdmin() || !jobId) return;
    try {
        showLoading();
        const data = await api(`/api/admin/jobs/${jobId}`);
        const j = data.job || {};
        const co = data.company;
        const req = j.requirements || {};
        openDetailModal(
            j.title || "İlan",
            `<div class="detail-section">
                ${formatCompanyProfileHtml(co ? { name: co.name, email: co.email, phone: co.phone, address: co.address, website: co.website } : null, { heading: "Şirket kaydı" }) || `<p><strong>Şirket:</strong> ${escapeHtml(co?.name || j.company_legal_name || "—")}</p>`}
                <p><strong>İlan metni (kısa ad):</strong> ${escapeHtml(j.company || "—")}</p>
                <p><strong>Departman:</strong> ${escapeHtml(j.department || "—")}</p>
                <p><strong>Lokasyon:</strong> ${escapeHtml(j.location || "—")}</p>
                <p><strong>Çalışma:</strong> ${escapeHtml(workplaceTypeLabel(j.workplace_type) || "—")}</p>
                <p><strong>Durum:</strong> ${escapeHtml(j.status || "—")} · <strong>Başvuru:</strong> ${j.application_count ?? 0}</p>
            </div>
            <div class="detail-section"><h3>Açıklama</h3><p style="white-space:pre-line">${escapeHtml(j.description || "")}</p></div>
            <div class="detail-section"><h3>Zorunlu beceriler</h3><p>${(req.required_skills || []).map((s) => escapeHtml(s)).join(", ") || "—"}</p></div>`
        );
    } catch {
        /* toast */
    } finally {
        hideLoading();
    }
}

function wireDetailModal() {
    const modal = document.getElementById("detail-modal");
    if (!modal || modal.dataset.wired) return;
    modal.dataset.wired = "1";
    modal.querySelectorAll("[data-modal-close]").forEach((el) => {
        el.addEventListener("click", closeDetailModal);
    });
}

function wireDashboardStatNavigation() {
    const grid = document.getElementById("dashboard-stats-grid");
    if (!grid || grid.dataset.navWired) return;
    grid.dataset.navWired = "1";
    const targets = () => {
        if (isAdmin()) {
            return [
                "admin",
                "admin",
                () => openAdminApplicationsSection(),
                "admin",
            ];
        }
        if (isEmployee()) return ["employee-cv", "jobs-browse", "employee-applications", "employee-applications"];
        if (isCompany()) return ["job-applicants", "job", "match", "match"];
        return ["dashboard", "dashboard", "dashboard", "dashboard"];
    };
    const pages = targets();
    grid.querySelectorAll("[data-stat-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const i = Number(btn.getAttribute("data-stat-index"));
            const t = pages[i];
            if (typeof t === "function") t();
            else if (t) navigate(t);
        });
    });
}

function applicantsFilteredJobList() {
    const jobs = state.applicantsJobsSnapshot || [];
    const q = (state.applicantsJobFilter || "").trim().toLowerCase();
    if (!q) return jobs.slice();
    return jobs.filter((j) => jobApplicantSelectHaystack(j).includes(q));
}

function renderCompanyJobCardHtml(job, opts = {}) {
    const hideDeptPill = opts.hideDeptPill === true;
    const ac = job.application_count != null ? Number(job.application_count) : null;
    const appsBadge =
        ac != null
            ? `<span class="job-app-count-badge" title="Bu ilana gelen başvuru">${ac} başvuru</span>`
            : "";
    return `
        <div class="card job-card" onclick="showJobDetail('${job.id}')">
            <div class="card-header">
                <i class="fas fa-briefcase"></i>
                <h3>${escapeHtml(job.title)}</h3>
            </div>
            <div class="card-body">
                ${job.company ? `<p class="text-muted"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</p>` : ""}
                ${!hideDeptPill && job.department ? `<p class="job-dept-pill"><i class="fas fa-sitemap"></i> ${escapeHtml(job.department)}</p>` : ""}
                <div class="job-card-badges" style="margin-bottom:0.35rem">
                    ${job.location ? `<span class="job-pill job-pill-loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</span>` : ""}
                    ${workplaceTypeLabel(job.workplace_type) ? `<span class="job-pill job-pill-wp">${workplaceTypeLabel(job.workplace_type)}</span>` : ""}
                </div>
                ${job.company_legal_name && job.company !== job.company_legal_name ? `<p class="text-muted" style="font-size:0.8rem"><i class="fas fa-id-card"></i> ${escapeHtml(job.company_legal_name)}</p>` : ""}
            </div>
            <div class="card-footer">
                <span class="text-muted">${formatDate(job.created_at)} ${appsBadge}</span>
                <div style="display:flex;gap:0.35rem;align-items:center">
                    ${job.status === "closed" ? '<span class="job-pill" style="opacity:0.85">Kapalı</span>' : ""}
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openJobApplicantsInline('${job.id}')" title="Başvurular">
                        <i class="fas fa-users"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openBulkEmailModal('${job.id}', '${escapeHtml(job.title)}')" title="Toplu E-posta">
                        <i class="fas fa-envelope"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); toggleJobStatus('${job.id}', '${job.status === "closed" ? "open" : "closed"}')" title="${job.status === "closed" ? "İlanı yeniden aç" : "İlanı kapat"}">
                        <i class="fas fa-${job.status === "closed" ? "lock-open" : "lock"}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteJob('${job.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function loadJobsBrowsePage() {
    const list = document.getElementById("jobs-browse-list");
    const appsBody = document.getElementById("jobs-my-applications-body");
    if (!list) return;
    wireJobsBrowseFilterTabs();
    wireJobsBrowseSearch();
    try {
        const jobs = await api("/api/job/browse");
        state.employeeJobs = jobs;
        let my = [];
        try {
            my = await api("/api/applications/my");
        } catch {
            my = [];
        }
        state.employeeApplications = my;
        const applied = new Set(my.map((a) => a.job_id));
        const appIdByJob = Object.fromEntries(my.map((a) => [a.job_id, a.id]));

        if (appsBody) {
            let byCv = new Map();
            if (my.length) {
                const cvs = await api("/api/cv/list").catch(() => []);
                byCv = new Map((Array.isArray(cvs) ? cvs : []).map((c) => [c.id, cvListLabel(c)]));
            }
            appsBody.innerHTML =
                my.length === 0
                    ? "<p class=\"text-muted\">Başvuru yok</p>"
                    : renderEmployeeApplicationsTableHtml(my, byCv);
            if (my.length) {
                wireEmployeeApplicationTableRows(appsBody, my, byCv);
                appsBody.querySelectorAll(".app-withdraw-btn").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const id = btn.getAttribute("data-app-id");
                        if (id) void withdrawJobApplication(id);
                    });
                });
            }
        }

        const byFav =
            state.jobBrowseFilter === "favorites" ? jobs.filter((j) => j.favorited) : jobs;
        const q = state.jobBrowseSearch;
        const filtered = q ? byFav.filter((j) => jobBrowseHaystack(j).includes(q)) : byFav;

        if (filtered.length === 0) {
            list.innerHTML =
                state.jobBrowseFilter === "favorites"
                    ? '<div class="empty-state"><p>Favori yok</p></div>'
                    : q
                      ? '<div class="empty-state"><p>Sonuç yok</p></div>'
                      : '<div class="empty-state"><p>İlan yok</p></div>';
            return;
        }
        const perPage = state.jobsPerPage || 9;
        const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
        if (state.jobsBrowsePage >= totalPages) state.jobsBrowsePage = totalPages - 1;
        const pageItems = filtered.slice(state.jobsBrowsePage * perPage, (state.jobsBrowsePage + 1) * perPage);
        renderPaginationBar("jobs-browse-pagination", state.jobsBrowsePage, totalPages, (p) => {
            state.jobsBrowsePage = p;
            loadJobsBrowsePage();
        });
        list.innerHTML = pageItems
            .map(
                (j) => `
            <div class="card job-card job-card-clickable" role="button" tabindex="0" data-job-id="${j.id}">
                <div class="card-header job-card-head">
                    <div><i class="fas fa-briefcase"></i><h3>${escapeHtml(j.title)}</h3></div>
                    <button type="button" class="btn btn-icon-star ${j.favorited ? "active" : ""}" title="Favori"
                        onclick="event.stopPropagation();toggleEmployeeJobFavorite('${j.id}', this)">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="card-body">
                    ${j.company || j.company_legal_name ? `<p class="job-card-meta-line"><i class="fas fa-building"></i> ${escapeHtml(j.company_legal_name || j.company)}</p>` : ""}
                    ${j.company_profile?.email ? `<p class="job-card-meta-line text-muted"><i class="fas fa-envelope"></i> ${escapeHtml(j.company_profile.email)}</p>` : j.company_profile?.phone ? `<p class="job-card-meta-line text-muted"><i class="fas fa-phone"></i> ${escapeHtml(j.company_profile.phone)}</p>` : ""}
                    <div class="job-card-badges">
                        ${j.department ? `<span class="job-pill job-pill-dept">${escapeHtml(j.department)}</span>` : ""}
                        ${j.location ? `<span class="job-pill job-pill-loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(j.location)}</span>` : ""}
                        ${workplaceTypeLabel(j.workplace_type) ? `<span class="job-pill job-pill-wp">${workplaceTypeLabel(j.workplace_type)}</span>` : ""}
                    </div>
                </div>
                <div class="card-footer job-card-footer-row">
                    <span class="text-muted job-card-date"><i class="far fa-clock"></i> ${formatDate(j.created_at)}</span>
                    ${
                        applied.has(j.id)
                            ? `<div class="job-card-applied-actions">
                        <span class="job-applied-badge"><i class="fas fa-check"></i> Başvuruldu</span>
                        <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation();withdrawJobApplication('${escapeHtml(appIdByJob[j.id] || "")}')">Geri çek</button>
                    </div>`
                            : `<button type="button" class="btn btn-primary btn-sm" data-job-id="${j.id}" onclick="event.stopPropagation();applyToJobPrompt('${j.id}')"><i class="fas fa-paper-plane"></i> Başvur</button>`
                    }
                    <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation();showJobDetail('${j.id}')" title="İlan detayı"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        `
            )
            .join("");
        wireEmployeeBrowseJobCards(list);
    } catch {
        list.innerHTML = '<p class="text-muted">İlanlar yüklenemedi.</p>';
    }
}

function wireEmployeeBrowseJobCards(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll(".job-card-clickable[data-job-id]").forEach((card) => {
        const id = card.getAttribute("data-job-id");
        if (!id) return;
        const open = () => showJobDetail(id);
        card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            open();
        });
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
            }
        });
    });
}

async function toggleEmployeeJobFavorite(jobId, btnEl) {
    if (!isEmployee()) return;
    try {
        const r = await api(`/api/job/favorite/${jobId}`, { method: "POST" });
        if (btnEl) btnEl.classList.toggle("active", r.favorited);
        loadJobsBrowsePage();
    } catch (e) {
        showToast(e.message || "Hata", "error");
    }
}

async function applyToJobPrompt(jobId) {
    if (!isEmployee()) return;
    try {
        const mycvs = await api("/api/cv/list");
        if (!mycvs.length) {
            showToast("Önce CV Hazırla bölümünden bir CV oluşturun.", "warning");
            navigate("employee-cv");
            return;
        }
        if (mycvs.length === 1) {
            await submitJobApplication(jobId, mycvs[0].id);
            return;
        }
        state.pendingApplyJobId = jobId;
        const sel = document.getElementById("apply-cv-modal-select");
        const modal = document.getElementById("apply-cv-modal");
        if (sel) {
            sel.innerHTML = mycvs
                .map((c) => `<option value="${c.id}">${escapeHtml(cvListLabel(c))}</option>`)
                .join("");
        }
        modal?.classList.remove("hidden");
    } catch (e) {
        showToast(e.message || "Hata", "error");
    }
}

async function submitJobApplication(jobId, cvId) {
    showLoading();
    try {
        await api("/api/applications/apply", {
            method: "POST",
            body: JSON.stringify({ job_id: jobId, cv_id: cvId }),
        });
        showToast("Başvurunuz alındı.", "success");
        document.getElementById("apply-cv-modal")?.classList.add("hidden");
        state.pendingApplyJobId = null;
        loadJobsBrowsePage();
    } catch (e) {
        showToast(e.message || "Başvuru başarısız", "error");
    } finally {
        hideLoading();
    }
}

function wireCompanyArchiveDetails() {
    const det = document.getElementById("company-archive-details");
    if (!det || det.dataset.wired) return;
    det.dataset.wired = "1";
    det.addEventListener("toggle", () => {
        if (det.open) loadCVs();
    });
}

async function loadJobApplicantsPage() {
    if (!isCompany()) return;
    wireCompanyArchiveDetails();
    const tree = document.getElementById("job-applicants-dept-tree");
    const jfilt = document.getElementById("job-applicants-job-filter");
    const body = document.getElementById("job-applicants-body");
    const head = document.getElementById("job-applicants-active-head");
    if (!tree || !body) return;

    const paintApplicantsPanel = async () => {
        const jobId = state.applicantsJobId;
        const jobs = state.applicantsJobsSnapshot || [];
        const job = jobId ? jobs.find((j) => j.id === jobId) : null;

        if (!jobId || !job) {
            if (head) {
                head.classList.add("hidden");
                head.innerHTML = "";
            }
            body.innerHTML = "<p class=\"text-muted\">Soldan ilan seçin.</p>";
            return;
        }

        if (head) {
            head.classList.remove("hidden");
            const depLabel = (job.department || "").trim()
                ? escapeHtml(job.department)
                : "Departman atanmamış";
            const ac = job.application_count != null ? Number(job.application_count) : "—";
            head.innerHTML = `
                <div class="applicants-active-head-inner">
                    <div>
                        <span class="applicants-active-dept">${depLabel}</span>
                        <h2 class="applicants-active-title">${escapeHtml(job.title)}</h2>
                        ${job.location ? `<p class="applicants-active-meta"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</p>` : ""}
                    </div>
                    <div class="applicants-active-side">
                        <span class="applicants-active-count"><strong>${ac}</strong><small> başvuru</small></span>
                    </div>
                </div>`;
        }
        try {
            const [rows, team] = await Promise.all([
                api(`/api/applications/job/${jobId}`),
                api("/api/applications/company-team").catch(() => []),
            ]);
            body.innerHTML =
                rows.length === 0
                    ? "<div class=\"empty-state applicants-empty\"><i class=\"fas fa-inbox\"></i><p>Başvuru yok</p></div>"
                    : `<div class="applicants-cards">${rows
                          .map(
                              (r) => `
                <article class="applicant-card">
                    <div class="applicant-card-top">
                        <button type="button" class="btn-icon-star ${r.company_favorite ? "active" : ""} app-fav-btn" data-app="${r.id}" data-fav="${r.company_favorite ? "1" : "0"}" title="Favori">
                            <i class="fas fa-star"></i>
                        </button>
                        <span class="applicant-card-id">${escapeHtml(r.applicant_label || "CV")}</span>
                        <span class="applicant-card-date">${formatDate(r.created_at)}</span>
                    </div>
                    <div class="applicant-card-summary-block" title="${escapeHtml(r.cv_summary || "")}">
                        ${applicantSummaryPartsHtml(r.cv_summary || "")}
                    </div>
                    <div class="applicant-card-actions">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="goToCvDetail('${r.cv_id}')"><i class="fas fa-eye"></i> Detay</button>
                        <button type="button" class="btn btn-sm btn-primary" onclick="downloadCV('${r.cv_id}')"><i class="fas fa-download"></i> İndir</button>
                        ${
                            r.applicant_username
                                ? `<button type="button" class="btn btn-sm btn-secondary applicant-msg-btn" data-emp="${escapeHtml(r.applicant_username)}" data-job="${escapeHtml(jobId)}"><i class="fas fa-comments"></i> Mesaj</button>`
                                : ""
                        }
                    </div>
                    ${
                        isCompanyHrScope()
                            ? `<div class="applicant-card-assign applicant-card-assign--row">
                        <label class="assign-label"><i class="fas fa-user-friends"></i> İnceleyici (İK)</label>`
                            : ""
                    }
                    ${
                        isCompanyHrScope()
                            ? `
                        <select class="assign-rev form-control-inline" data-app="${r.id}">
                            <option value="">— Seçin —</option>
                            ${(Array.isArray(team) ? team : [])
                                .map(
                                    (u) =>
                                        `<option value="${escapeHtml(u.username)}" ${u.username === r.assigned_reviewer_username ? "selected" : ""}>${escapeHtml(u.full_name || u.username)}</option>`
                                )
                                .join("")}
                        </select>
                    </div>`
                            : ""
                    }
                </article>`
                          )
                          .join("")}</div>`;

            body.querySelectorAll(".app-fav-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const appId = btn.getAttribute("data-app");
                    const cur = btn.getAttribute("data-fav") === "1";
                    try {
                        await api(`/api/applications/${appId}/favorite`, {
                            method: "PATCH",
                            body: JSON.stringify({ favorited: !cur }),
                        });
                        showToast(!cur ? "Favorilere eklendi." : "Favoriden çıkarıldı.", "success");
                        await paintApplicantsPanel();
                    } catch (err) {
                        showToast(err.message || "Hata", "error");
                    }
                });
            });
            if (isCompanyHrScope()) {
                body.querySelectorAll(".assign-rev").forEach((el) => {
                    el.addEventListener("change", async () => {
                        const appId = el.dataset.app;
                        const v = el.value || null;
                        try {
                            await api(`/api/applications/${appId}/assign`, {
                                method: "PATCH",
                                body: JSON.stringify({
                                    assigned_reviewer_username: v,
                                    department_label: null,
                                }),
                            });
                            showToast("İnceleyici atandı.", "success");
                        } catch (err) {
                            showToast(err.message || "Hata", "error");
                        }
                    });
                });
            }
            body.querySelectorAll(".applicant-msg-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const emp = btn.getAttribute("data-emp");
                    const jid = btn.getAttribute("data-job");
                    if (emp) void openChatWithApplicant(emp, jid);
                });
            });
        } catch {
            body.innerHTML = "<p class=\"text-muted\">Başvurular yüklenemedi.</p>";
        }
    };

    const renderDeptTree = () => {
        const list = applicantsFilteredJobList();
        if (list.length === 0) {
            tree.innerHTML =
                "<p class=\"text-muted dept-tree-empty\">İlan yok</p>";
            return;
        }
        const companies = groupJobsByCompanyThenDepartment(list);
        const jobRow = (j) => {
            const n = j.application_count != null ? Number(j.application_count) : 0;
            const active = j.id === state.applicantsJobId ? " is-active" : "";
            const loc = j.location
                ? `<span class="dept-job-loc"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(j.location)}</span>`
                : "";
            return `<button type="button" class="dept-job-row${active}" data-job-id="${j.id}">
                <span class="dept-job-title">${escapeHtml(j.title)}</span>
                ${loc}
                <span class="dept-job-apps">${n} başvuru</span>
            </button>`;
        };
        tree.innerHTML = companies
            .map((co) => {
                const coApps = co.departments.reduce(
                    (s, d) => s + d.jobs.reduce((a, j) => a + (Number(j.application_count) || 0), 0),
                    0
                );
                const coJobs = co.departments.reduce((s, d) => s + d.jobs.length, 0);
                const deptBlocks = co.departments
                    .map(({ dept, jobs: jlist }) => {
                        const label = dept === "__none__" ? "Departman atanmamış" : escapeHtml(dept);
                        const totalApps = jlist.reduce((s, j) => s + (Number(j.application_count) || 0), 0);
                        return `<details class="dept-accordion dept-accordion--nested" open>
                            <summary class="dept-accordion-summary">
                                <span class="dept-accordion-title"><i class="fas fa-folder"></i> ${label}</span>
                                <span class="dept-accordion-meta">${jlist.length} ilan · ${totalApps} başvuru</span>
                            </summary>
                            <div class="dept-accordion-body">${jlist.map(jobRow).join("")}</div>
                        </details>`;
                    })
                    .join("");
                return `<details class="dept-accordion dept-accordion--company" open>
                    <summary class="dept-accordion-summary dept-accordion-summary--company">
                        <span class="dept-accordion-title"><i class="fas fa-building"></i> ${escapeHtml(co.companyLabel)}</span>
                        <span class="dept-accordion-meta">${coJobs} ilan · ${coApps} başvuru</span>
                    </summary>
                    <div class="dept-accordion-body dept-accordion-body--company">${deptBlocks}</div>
                </details>`;
            })
            .join("");

        tree.querySelectorAll(".dept-job-row").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-job-id");
                state.applicantsJobId = id;
                renderDeptTree();
                void paintApplicantsPanel();
            });
        });
    };

    if (jfilt && !jfilt.dataset.wired) {
        jfilt.dataset.wired = "1";
        jfilt.addEventListener("input", () => {
            state.applicantsJobFilter = jfilt.value || "";
            const q = (state.applicantsJobFilter || "").trim().toLowerCase();
            const jobs = state.applicantsJobsSnapshot || [];
            if (state.applicantsJobId && q) {
                const cur = jobs.find((x) => x.id === state.applicantsJobId);
                if (cur && !jobApplicantSelectHaystack(cur).includes(q)) {
                    state.applicantsJobId = null;
                }
            }
            renderDeptTree();
            void paintApplicantsPanel();
        });
    }

    try {
        const jobs = await api(buildJobListUrl());
        state.applicantsJobsSnapshot = jobs;
        if (jfilt) jfilt.value = state.applicantsJobFilter || "";
        if (state.applicantsJobId && !jobs.some((j) => j.id === state.applicantsJobId)) {
            state.applicantsJobId = null;
        }
        renderDeptTree();
        await paintApplicantsPanel();
    } catch {
        body.innerHTML = "<p class=\"text-muted\">Veri yüklenemedi.</p>";
    }
}

async function adminLoadApplications() {
    const el = document.getElementById("admin-applications-list");
    if (!el || !isAdmin()) return;
    try {
        const rows = await api("/api/admin/applications");
        if (!rows.length) {
            el.innerHTML = "<p class=\"text-muted\">Başvuru yok</p>";
            return;
        }
        el.innerHTML =
            `<table class="compare-table"><thead><tr><th>İlan</th><th>Şirket</th><th>Departman</th><th>CV</th><th>Tarih</th></tr></thead><tbody>` +
            rows
                .map(
                    (a) => `<tr>
                    <td><button type="button" class="btn-link admin-app-job" data-job-id="${escapeHtml(a.job_id)}">${escapeHtml(a.job_title || "—")}</button></td>
                    <td>${escapeHtml(a.company_name || "—")}</td>
                    <td>${escapeHtml(a.department || "—")}</td>
                    <td><button type="button" class="btn-link admin-app-cv" data-cv-id="${escapeHtml(a.cv_id)}">${escapeHtml(a.cv_label || "CV")}</button></td>
                    <td>${formatDate(a.created_at)}</td>
                </tr>`
                )
                .join("") +
            `</tbody></table>`;
        el.querySelectorAll(".admin-app-job").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-job-id");
                if (id) void openAdminJobDetail(id);
            });
        });
        el.querySelectorAll(".admin-app-cv").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-cv-id");
                if (id) goToCvDetail(id);
            });
        });
    } catch {
        el.innerHTML = "<p class=\"text-muted\">Yüklenemedi</p>";
    }
}

function openAdminApplicationsSection() {
    navigate("admin");
    setTimeout(() => {
        document.getElementById("admin-applications-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
}

async function loadAdminPage() {
    if (!isAdmin()) {
        navigate(isEmployee() ? "jobs-browse" : "dashboard");
        return;
    }
    const kv = document.getElementById("admin-kvkk-html");
    const ver = document.getElementById("admin-kvkk-version");
    const usersEl = document.getElementById("admin-users-list");
    const compSel = document.getElementById("admin-job-company-filter");
    const deptInp = document.getElementById("admin-job-dept-filter");
    const statsGrid = document.getElementById("admin-stats-grid");
    const auditEl = document.getElementById("admin-audit-list");
    try {
        const [k, users, companies, stats, audit] = await Promise.all([
            api("/api/admin/kvkk"),
            api("/api/admin/users"),
            api("/api/admin/companies").catch(() => []),
            api("/api/admin/stats").catch(() => null),
            api("/api/admin/audit-logs?limit=20").catch(() => []),
        ]);
        if (statsGrid && stats) {
            statsGrid.innerHTML = `
                <div class="stat-card"><div class="stat-value">${stats.users ?? 0}</div><div class="stat-label">Kullanıcı</div></div>
                <div class="stat-card"><div class="stat-value">${stats.cvs ?? 0}</div><div class="stat-label">CV</div></div>
                <div class="stat-card"><div class="stat-value">${stats.jobs ?? 0}</div><div class="stat-label">İlan</div></div>
                <div class="stat-card"><div class="stat-value">${stats.applications ?? 0}</div><div class="stat-label">Başvuru</div></div>
            `;
        }
        if (auditEl) {
            auditEl.innerHTML =
                !audit?.length
                    ? "<p>Henüz kayıt yok.</p>"
                    : `<ul style="margin:0;padding-left:1.1rem">${audit
                          .map(
                              (a) =>
                                  `<li><strong>${escapeHtml(a.action || "")}</strong> — ${escapeHtml(a.username || "—")} <span class="text-muted">${escapeHtml(a.created_at || "")}</span></li>`
                          )
                          .join("")}</ul>`;
        }
        if (kv) kv.value = k.html || "";
        if (ver) ver.value = k.version || "";
        const managedSel = document.getElementById("admin-managed-companies");
        if (managedSel && Array.isArray(companies)) {
            managedSel.innerHTML = companies
                .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`)
                .join("");
        }
        if (usersEl) {
            usersEl.innerHTML =
                "<table class=\"compare-table\"><thead><tr><th>Kullanıcı</th><th>Rol</th><th>E-posta</th><th>Ad</th><th>Şirket erişimi</th><th>Yönetilen şirketler</th></tr></thead><tbody>" +
                users
                    .map((u) => {
                        const ca =
                            u.role === "company"
                                ? escapeHtml((u.company_access || "hr") + (u.department ? ` · ${u.department}` : ""))
                                : "—";
                        const managedCell =
                            u.role === "company" &&
                            Array.isArray(u.managed_company_ids) &&
                            u.managed_company_ids.length
                                ? escapeHtml(
                                      u.managed_company_ids
                                          .map((id) => {
                                              const c = companies.find((x) => x.id === id);
                                              return c ? c.name || c.id : id;
                                          })
                                          .join("; ")
                                  )
                                : "—";
                        return `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.email || "")}</td><td>${escapeHtml(u.full_name || "")}</td><td>${ca}</td><td>${managedCell}</td></tr>`;
                    })
                    .join("") +
                "</tbody></table>";
        }
        if (compSel && Array.isArray(companies)) {
            const cur = state.adminJobCompanyFilter || "";
            compSel.innerHTML =
                '<option value="">— Tümü —</option>' +
                companies
                    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`)
                    .join("");
            compSel.value = cur;
            if (!compSel.dataset.wired) {
                compSel.dataset.wired = "1";
                compSel.addEventListener("change", () => {
                    state.adminJobCompanyFilter = compSel.value || "";
                });
            }
        }
        if (deptInp) {
            deptInp.value = state.adminJobDeptFilter || "";
            if (!deptInp.dataset.wired) {
                deptInp.dataset.wired = "1";
                deptInp.addEventListener("input", () => {
                    state.adminJobDeptFilter = deptInp.value || "";
                });
            }
        }
        await adminLoadApplications();
    } catch {
        if (usersEl) usersEl.textContent = "Yüklenemedi.";
    }
}

async function adminLoadJobsPreview() {
    const out = document.getElementById("admin-jobs-list");
    if (!out || !isAdmin()) return;
    try {
        showLoading();
        state.adminJobCompanyFilter =
            document.getElementById("admin-job-company-filter")?.value?.trim() || "";
        state.adminJobDeptFilter = document.getElementById("admin-job-dept-filter")?.value?.trim() || "";
        const jobs = await api(buildJobListUrl());
        if (jobs.length === 0) {
            out.innerHTML = "<p class=\"text-muted\">Kayıt yok</p>";
            return;
        }
        out.innerHTML =
            "<table class=\"compare-table admin-jobs-table\"><thead><tr><th>Başlık</th><th>Şirket</th><th>Departman</th><th>Durum</th></tr></thead><tbody>" +
            jobs
                .map(
                    (j) =>
                        `<tr class="admin-job-row" data-job-id="${escapeHtml(j.id)}" tabindex="0" role="button"><td>${escapeHtml(j.title)}</td><td>${escapeHtml(j.company_legal_name || j.company || "")}</td><td>${escapeHtml(j.department || "—")}</td><td>${escapeHtml(j.status || "")}</td></tr>`
                )
                .join("") +
            "</tbody></table>";
        out.querySelectorAll(".admin-job-row").forEach((row) => {
            const open = () => {
                const id = row.getAttribute("data-job-id");
                if (id) void openAdminJobDetail(id);
            };
            row.addEventListener("click", open);
            row.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                }
            });
        });
    } catch {
        out.innerHTML = "<p class=\"text-muted\">Yüklenemedi</p>";
    } finally {
        hideLoading();
    }
}

async function tryRestoreSession() {
    const t = getToken();
    if (!t) return false;
    try {
        const me = await fetch("/api/auth/me", { headers: authHeaders() });
        if (!me.ok) {
            clearSession();
            return false;
        }
        const data = await me.json();
        let role = data.role === "manager" ? "company" : data.role;
        setSession(
            t,
            role,
            data.username,
            data.full_name || "",
            data.avatar_url || undefined,
            role === "company" ? data.company_access || "hr" : undefined,
            role === "company" ? data.department || undefined : undefined
        );
        syncCompanyTenantFromMe({ ...data, role });
        return true;
    } catch {
        clearSession();
        return false;
    }
}

async function onLoginSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-submit-btn");
    if (errEl) errEl.textContent = "";
    const u = document.getElementById("login-username")?.value?.trim();
    const p = document.getElementById("login-password")?.value || "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Giriş yapılıyor…';
    }
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (errEl) errEl.textContent = data.detail || "Giriş başarısız";
            return;
        }
        let role = data.role === "manager" ? "company" : data.role;
        setSession(
            data.access_token,
            role,
            data.username,
            data.full_name || "",
            data.avatar_url || undefined,
            role === "company" ? data.company_access || "hr" : undefined,
            role === "company" ? data.department || undefined : undefined
        );
        syncCompanyTenantFromMe({ ...data, role });
        showAppShell();
        applyRoleUI();
        const defaultPage =
            role === "admin"
                ? "admin"
                : role === "company"
                  ? "dashboard"
                  : "jobs-browse";
        navigate(defaultPage);
    } catch {
        if (errEl) errEl.textContent = "Bağlantı hatası";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Giriş';
        }
    }
}

function showPasswordResetForm(show) {
    document.getElementById("login-form")?.classList.toggle("hidden", show);
    document.getElementById("register-form")?.classList.add("hidden");
    document.getElementById("password-reset-form")?.classList.toggle("hidden", !show);
    document.getElementById("password-reset-confirm-form")?.classList.add("hidden");
    document.getElementById("show-login")?.classList.add("hidden");
    document.getElementById("show-register")?.classList.toggle("hidden", show);
}

async function onPasswordResetRequest(e) {
    e.preventDefault();
    const err = document.getElementById("reset-error");
    const ok = document.getElementById("reset-success");
    if (err) err.textContent = "";
    if (ok) ok.textContent = "";
    const email = document.getElementById("reset-email")?.value?.trim();
    try {
        const res = await fetch("/api/auth/password-reset-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (err) err.textContent = data.detail || "İşlem başarısız";
            return;
        }
        if (ok) {
            ok.textContent = data.dev_reset_url
                ? `Geliştirme: ${data.dev_reset_url}`
                : data.message || "E-posta gönderildi.";
        }
        if (data.dev_reset_token) {
            document.getElementById("reset-token").value = data.dev_reset_token;
            document.getElementById("password-reset-form")?.classList.add("hidden");
            document.getElementById("password-reset-confirm-form")?.classList.remove("hidden");
        }
    } catch {
        if (err) err.textContent = "Bağlantı hatası";
    }
}

async function onPasswordResetConfirm(e) {
    e.preventDefault();
    const err = document.getElementById("reset-confirm-error");
    if (err) err.textContent = "";
    const token = document.getElementById("reset-token")?.value?.trim();
    const p1 = document.getElementById("reset-new-password")?.value || "";
    const p2 = document.getElementById("reset-new-password2")?.value || "";
    try {
        const res = await fetch("/api/auth/password-reset-confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token,
                new_password: p1,
                new_password_confirm: p2,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (err) err.textContent = data.detail || "İşlem başarısız";
            return;
        }
        showToast(data.message || "Şifre güncellendi", "success");
        showPasswordResetForm(false);
        document.getElementById("login-form")?.classList.remove("hidden");
        document.getElementById("show-register")?.classList.remove("hidden");
    } catch {
        if (err) err.textContent = "Bağlantı hatası";
    }
}

async function deleteMyAccount() {
    if (
        !confirm(
            "Hesabınız ve (aday iseniz) CV ile başvurularınız kalıcı olarak silinecek. Devam edilsin mi?"
        )
    ) {
        return;
    }
    try {
        await api("/api/auth/me", { method: "DELETE" });
        clearSession();
        showLoginScreen();
        showToast("Hesabınız silindi.", "success");
    } catch {
        /* api toast */
    }
}

async function onRegisterSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("register-error");
    const regBtn = document.querySelector("#register-form button[type=submit]");
    if (errEl) errEl.textContent = "";
    if (regBtn) {
        regBtn.disabled = true;
        regBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kayıt olunuyor…';
    }
    const u = document.getElementById("reg-username")?.value?.trim() || "";
    const p = document.getElementById("reg-password")?.value || "";
    const p2 = document.getElementById("reg-password2")?.value || "";
    const kvkk = document.getElementById("reg-kvkk");
    if (!kvkk?.checked) {
        if (errEl) errEl.textContent = "KVKK metnini okuyup onaylamanız gerekir.";
        return;
    }
    if (p !== p2) {
        if (errEl) errEl.textContent = "Şifreler eşleşmiyor.";
        return;
    }
    const isCompanyTab = document.getElementById("reg-tab-company")?.classList.contains("active");
    const url = isCompanyTab ? "/api/auth/register-company" : "/api/auth/register";
    const regAccess =
        document.querySelector('input[name="reg-company-access"]:checked')?.value === "department"
            ? "department"
            : "hr";
    const regDept = document.getElementById("reg-company-department")?.value?.trim() || "";
    if (isCompanyTab && regAccess === "department" && (!regDept || regDept.length < 2)) {
        if (errEl) errEl.textContent = "Departman yetkilisi için departman adı girin (en az 2 karakter).";
        return;
    }
    const body = isCompanyTab
        ? {
              company_name: document.getElementById("reg-company-name")?.value?.trim() || "",
              username: u,
              password: p,
              password_confirm: p2,
              full_name: document.getElementById("reg-full-name")?.value?.trim() || "",
              email: document.getElementById("reg-email")?.value?.trim() || "",
              phone: document.getElementById("reg-phone")?.value?.trim() || "",
              kvkk_accepted: true,
              kvkk_version: state.kvkkVersion || "1.0",
              company_access: regAccess,
              department: regAccess === "department" ? regDept : "",
          }
        : {
              username: u,
              password: p,
              password_confirm: p2,
              full_name: document.getElementById("reg-full-name")?.value?.trim() || "",
              email: document.getElementById("reg-email")?.value?.trim() || "",
              phone: document.getElementById("reg-phone")?.value?.trim() || "",
              kvkk_accepted: true,
              kvkk_version: state.kvkkVersion || "1.0",
          };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (errEl) {
                errEl.textContent =
                    typeof data.detail === "string" ? data.detail : "Kayıt başarısız";
            }
            return;
        }
        const lu = document.getElementById("login-username");
        if (lu) lu.value = u;
        const lp = document.getElementById("login-password");
        if (lp) lp.value = "";
        document.getElementById("reg-password").value = "";
        document.getElementById("reg-password2").value = "";
        document.getElementById("show-login")?.click();
        showToast(data.message || "Kayıt tamamlandı. Giriş yapabilirsiniz.", "success");
    } catch {
        if (errEl) errEl.textContent = "Bağlantı hatası";
    } finally {
        if (regBtn) {
            regBtn.disabled = false;
            regBtn.innerHTML = '<i class="fas fa-user-plus"></i> Kayıt ol';
        }
    }
}

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
    if (msg.sender_role === "employee") return "Aday";
    return msg.sender_username || "Şirket";
}

function renderMessageBubbleHtml(msg, meUsername) {
    const mine = msg.sender_username === meUsername;
    const showSender =
        !mine &&
        ((isCompany() && msg.sender_role === "company") ||
            (isEmployee() && msg.sender_role === "company"));
    return `<div class="msg-bubble ${mine ? "msg-bubble--mine" : "msg-bubble--theirs"}">
        ${showSender ? `<div class="msg-sender">${escapeHtml(messageSenderLabel(msg, mine))}</div>` : ""}
        <div class="msg-meta">${escapeHtml(formatDate(msg.created_at))}</div>
        <div class="msg-body">${escapeHtml(msg.body)}</div>
    </div>`;
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

function appendChatMessage(msg) {
    const box = document.getElementById("messages-thread");
    if (!box) return;
    const me = localStorage.getItem(AUTH_USER_KEY);
    const wrap = document.createElement("div");
    wrap.innerHTML = renderMessageBubbleHtml(msg, me);
    const el = wrap.firstElementChild;
    if (el) {
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    }
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
        listEl.innerHTML = convs.length
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
                  "Üstten yeni sohbet başlatın veya bir başvurudan mesaj gönderin."
              );

        listEl.querySelectorAll("[data-conv-id]").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.messagesActiveConvId = btn.getAttribute("data-conv-id");
                setMessagesThreadOpen(true);
                void openMessagesConversation(state.messagesActiveConvId);
            });
        });

        await populateNewChatContacts();

        if (state.messagesActiveConvId) {
            setMessagesThreadOpen(true);
            await openMessagesConversation(state.messagesActiveConvId);
        } else {
            setMessagesThreadOpen(false);
            if (threadEl) {
                threadEl.innerHTML = emptyStateHtml(
                    "inbox",
                    "Sohbet seçin",
                    "Soldan bir konuşma seçin veya yeni sohbet başlatın."
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

async function populateNewChatContacts() {
    const sel = document.getElementById("messages-new-chat-select");
    if (!sel) return;
    try {
        const contacts = await api("/api/messages/contacts");
        sel.innerHTML =
            '<option value="">— Yeni sohbet —</option>' +
            (contacts || [])
                .map((c) => {
                    if (isEmployee()) {
                        return `<option value="${escapeHtml(c.company_id)}" data-kind="company" data-job="${escapeHtml(c.job_id || "")}">${escapeHtml(c.company_name)}${c.job_title ? " · " + escapeHtml(c.job_title) : ""}</option>`;
                    }
                    return `<option value="${escapeHtml(c.employee_username)}" data-kind="employee" data-job="${escapeHtml(c.job_id || "")}">${escapeHtml(c.employee_label)}${c.job_title ? " · " + escapeHtml(c.job_title) : ""}</option>`;
                })
                .join("");
    } catch {
        sel.innerHTML = '<option value="">—</option>';
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
        const title = isEmployee() ? conv.company_name || "Şirket" : conv.employee_label || "Aday";
        if (titleEl) titleEl.textContent = title;
        const me = localStorage.getItem(AUTH_USER_KEY);
        const msgs = data.messages || [];
        threadEl.innerHTML = msgs.length
            ? msgs.map((msg) => renderMessageBubbleHtml(msg, me)).join("")
            : emptyStateHtml("comment-dots", "İlk mesajı gönderin", "Bu sohbette henüz mesaj yok.");
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

function navigate(page) {
    const companyPanelPages = ["job", "match", "compare", "rag", "job-applicants"];
    const adminOnlyPages = ["admin"];

    if (isCompany() && page === "cv") {
        page = "job-applicants";
    }

    if (isAdmin() && companyPanelPages.includes(page)) {
        showToast("Bu bölüm yalnızca şirket hesabına aittir.", "info");
        page = "admin";
    }
    if (isEmployee()) {
        if (companyPanelPages.includes(page) || adminOnlyPages.includes(page)) {
            showToast("Bu sayfa hesabınıza kapalıdır.", "warning");
            page = "jobs-browse";
        }
    }
    if (isCompany() && adminOnlyPages.includes(page)) {
        page = "dashboard";
    }
    if (!isEmployee() && page === "jobs-browse") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (isEmployee() && page === "job-applicants") {
        page = "jobs-browse";
    }
    if (!isEmployee() && page === "employee-cv") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (!isEmployee() && page === "employee-applications") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (page === "messages") {
        if (isAdmin()) page = "admin";
        else if (!isEmployee() && !isCompany()) page = "dashboard";
    }

    document.querySelectorAll(".detail-panel").forEach((panel) => {
        panel.classList.remove("visible");
        panel.classList.add("hidden");
    });
    document.querySelector("#main-app.app")?.classList.remove("detail-open");

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.page === page);
    });

    document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("active", section.id === `page-${page}`);
    });

    state.currentPage = page;
    window.location.hash = page;

    switch (page) {
        case "dashboard": loadDashboard(); break;
        case "job": loadJobs(); break;
        case "match": loadMatchPage(); break;
        case "compare": loadComparePage(); break;
        case "rag": loadRagPage(); break;
        case "messages": loadMessagesPage(); break;
        case "employee-cv": loadEmployeeCvPage(); break;
        case "employee-applications": loadEmployeeApplicationsPage(); break;
        case "settings": loadSettingsPage(); break;
        case "jobs-browse": loadJobsBrowsePage(); break;
        case "job-applicants": loadJobApplicantsPage(); break;
        case "admin": loadAdminPage(); break;
    }
}

async function loadDashboard() {
    if (isCompany()) void refreshNotificationBadge();

    const setStatLabels = (a, b, c, d) => {
        const e1 = document.getElementById("stat-label-1");
        const e2 = document.getElementById("stat-label-2");
        const e3 = document.getElementById("stat-label-3");
        const e4 = document.getElementById("stat-label-4");
        if (e1) e1.textContent = a;
        if (e2) e2.textContent = b;
        if (e3) e3.textContent = c;
        if (e4) e4.textContent = d;
    };

    try {
        if (isAdmin()) {
            setStatLabels("Kullanıcı", "CV", "Başvuru", "Eşleşme");
            const stats = await api("/api/admin/stats").catch(() => null);
            if (stats) {
                animateCounter("stat-cvs", stats.users ?? 0);
                animateCounter("stat-jobs", stats.cvs ?? 0);
                animateCounter("stat-matches", stats.applications ?? 0);
                const avgEl = document.getElementById("stat-avg");
                if (avgEl) {
                    avgEl.textContent = String(stats.matches ?? 0);
                    avgEl.style.color = "";
                }
            } else {
                animateCounter("stat-cvs", 0);
                animateCounter("stat-jobs", 0);
                animateCounter("stat-matches", 0);
            }
            const avgEl = document.getElementById("stat-avg");
            if (avgEl && !stats) {
                avgEl.textContent = "—";
                avgEl.style.color = "";
            }
            const chartEl = document.getElementById("top-skills-chart");
            const emptyEl = document.getElementById("top-skills-empty");
            if (chartEl) chartEl.style.display = "none";
            if (emptyEl) {
                emptyEl.style.display = "block";
                emptyEl.textContent = "—";
            }
            void renderAdminDashboardActivity();
            const recent = document.getElementById("recent-activity");
            if (recent) recent.innerHTML = "<p class=\"text-muted\">Yönetim panelinde son olaylar listelenir.</p>";
            wireDashboardStatNavigation();
            return;
        }

        const cvs = await api("/api/cv/list");
        state.cvs = cvs;
        setStatLabels("Kayıtlı CV", "İş İlanı", "Eşleştirme", "Ort. Uyum Puanı");
        animateCounter("stat-cvs", cvs.length);
        renderTopSkillsChart(cvs);

        if (isEmployee()) {
            let apps = [];
            let favCount = 0;
            try {
                apps = await api("/api/applications/my");
            } catch {
                apps = [];
            }
            try {
                const jb = await api("/api/job/browse");
                favCount = jb.filter((j) => j.favorited).length;
            } catch {
                favCount = 0;
            }
            animateCounter("stat-jobs", favCount);
            animateCounter("stat-matches", apps.length);
            const avgEl = document.getElementById("stat-avg");
            if (avgEl) {
                avgEl.textContent = apps.length ? "✓" : "—";
                avgEl.style.color = "";
            }
            setStatLabels("CV’lerim", "Favori ilan", "Başvuru", "Durum");
            renderEmployeeRecentActivity(apps);
            wireDashboardStatNavigation();
            void renderDashboardAlerts();
            return;
        }

        const [jobs, matches, recentApps] = await Promise.all([
            api(buildJobListUrl()),
            api("/api/match/history"),
            api("/api/applications/company/recent").catch(() => []),
        ]);
        state.jobs = jobs;
        setStatLabels("Başvuran CV", "İş İlanı", "Eşleştirme", "Ort. Uyum Puanı");

        animateCounter("stat-jobs", jobs.length);
        animateCounter("stat-matches", matches.length);

        if (matches.length > 0) {
            const avg = matches.reduce((sum, m) => sum + m.scores.overall, 0) / matches.length;
            const avgEl = document.getElementById("stat-avg");
            avgEl.textContent = avg.toFixed(0);
            avgEl.style.color = getScoreColor(avg);
        }

        renderRecentActivity(matches.slice(0, 5));
        renderCompanyRecentApplications(recentApps);
        wireDashboardStatNavigation();
        void renderDashboardAlerts();
    } catch (e) {
        showToast("Dashboard yüklenemedi", "error");
    }
}

function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let current = 0;
    const step = Math.max(1, Math.floor(target / 20));
    const interval = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(interval);
    }, 50);
}

function renderRecentActivity(matches) {
    const container = document.getElementById("recent-activity");
    if (!container) return;

    if (matches.length === 0) {
        container.innerHTML =
            '<p class="text-muted">Kayıt yok</p>';
        return;
    }

    container.innerHTML = matches
        .map(
            (m) => `
        <div class="activity-item">
            <div class="activity-score" style="color: ${getScoreColor(m.scores.overall)}">
                ${m.scores.overall.toFixed(0)}%
            </div>
            <div class="activity-info">
                <strong>${m.cv_name || "CV"}</strong>
                <span class="text-muted">${formatDate(m.created_at)}</span>
            </div>
        </div>
    `
        )
        .join("");
    wireRecentActivityClicks(matches);
}

function wireRecentActivityClicks(matches) {
    const container = document.getElementById("recent-activity");
    if (!container) return;
    container.querySelectorAll(".activity-item").forEach((el, i) => {
        const m = matches[i];
        if (!m?.cv_id) return;
        el.classList.add("activity-item-clickable");
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.dataset.cvId = m.cv_id;
        el.dataset.jobId = m.job_id || "";
        const go = () => {
            state.matchPrefillCvId = m.cv_id;
            state.matchPrefillJobId = m.job_id || "";
            navigate("match");
        };
        el.onclick = go;
        el.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
            }
        };
    });
}

function renderTopSkillsChart(cvs) {
    const chartEl = document.getElementById("top-skills-chart");
    const emptyEl = document.getElementById("top-skills-empty");
    if (!chartEl) return;

    const excludeSkills = new Set([
        "eğitim", "deneyim", "beceriler", "diller", "hobiler",
        "referanslar", "kişisel bilgiler", "iletişim", "sertifikalar",
        "projeler", "staj", "education", "experience", "skills",
    ]);

    const skillCount = {};
    cvs.forEach((cv) => {
        (cv.data.skills || []).forEach((skill) => {
            if (!excludeSkills.has(skill.toLowerCase())) {
                skillCount[skill] = (skillCount[skill] || 0) + 1;
            }
        });
    });

    const sorted = Object.entries(skillCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    if (sorted.length === 0) {
        chartEl.style.display = "none";
        emptyEl.style.display = "block";
        return;
    }

    chartEl.style.display = "block";
    emptyEl.style.display = "none";

    if (state.charts["top-skills"]) {
        state.charts["top-skills"].destroy();
    }

    const barColors = [
        "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
        "#ef4444", "#06b6d4", "#ec4899", "#f97316",
    ];

    state.charts["top-skills"] = new Chart(chartEl, {
        type: "bar",
        data: {
            labels: sorted.map((s) => s[0]),
            datasets: [{
                label: "CV Sayısı",
                data: sorted.map((s) => s[1]),
                backgroundColor: sorted.map((_, i) => barColors[i % barColors.length]),
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: "#94a3b8", stepSize: 1 },
                    grid: { color: "rgba(148,163,184,0.1)" },
                },
                y: {
                    ticks: { color: "#e2e8f0", font: { size: 11 } },
                    grid: { display: false },
                },
            },
            plugins: {
                legend: { display: false },
            },
        },
    });
}

async function loadCVs() {
    if (!isCompany()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const listEl = document.getElementById("cv-list");
    if (!listEl) return;
    try {
        showLoading();
        state.cvs = await api("/api/cv/list");
        renderCVList();
    } catch (e) {

    } finally {
        hideLoading();
    }
}

async function reanalyzeAllCVs() {
    if (!isCompany()) {
        showToast("Bu işlem yalnızca şirket hesabı içindir.", "warning");
        return;
    }
    if (state.cvs.length === 0) {
        showToast("Yeniden analiz edilecek CV yok.", "warning");
        return;
    }
    try {
        showLoading();
        const result = await api("/api/cv/reanalyze-all", { method: "POST" });
        showToast(result.message, "success");
        await loadCVs();
    } catch (e) {
        showToast("Yeniden analiz hatası", "error");
    } finally {
        hideLoading();
    }
}

function renderCVList() {
    const container = document.getElementById("cv-list");
    const searchInput = document.getElementById("cv-search");
    const searchCount = document.getElementById("cv-search-count");
    const query = (searchInput?.value || "").toLowerCase();

    if (state.cvs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>CV yok</p>
            </div>
        `;
        if (searchCount) searchCount.textContent = "";
        return;
    }

    const filtered = query
        ? state.cvs.filter((cv) => {
            const haystack = [
                cv.data.name, cv.data.email, cv.data.phone, cv.filename,
                String(cv.display_id || ""),
                ...cv.data.skills, ...cv.data.languages,
                ...cv.data.education.map(e => `${e.degree} ${e.field || ""} ${e.institution || ""}`),
            ].join(" ").toLowerCase();
            return haystack.includes(query);
        })
        : state.cvs;

    if (searchCount) {
        searchCount.textContent = query ? `${filtered.length} / ${state.cvs.length}` : "";
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Sonuç yok</p></div>`;
        return;
    }

    container.innerHTML = filtered
        .map(
            (cv) => `
        <div class="card cv-card" onclick="showCVDetail('${cv.id}')">
            <div class="card-header">
                <i class="fas fa-file-pdf"></i>
                <h3>${escapeHtml(cvListLabel(cv))}</h3>
            </div>
            <div class="card-body">
                <div class="cv-info">
                    ${cv.data.email ? `<span><i class="fas fa-envelope"></i> ${cv.data.email}</span>` : ""}
                    ${cv.data.phone ? `<span><i class="fas fa-phone"></i> ${cv.data.phone}</span>` : ""}
                </div>
                <div class="skill-tags">
                    ${cv.data.skills.slice(0, 5).map((s) => `<span class="tag">${s}</span>`).join("")}
                    ${cv.data.skills.length > 5 ? `<span class="tag tag-more">+${cv.data.skills.length - 5}</span>` : ""}
                </div>
            </div>
            <div class="card-footer">
                <span class="text-muted">${formatDate(cv.created_at)}</span>
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); downloadCV('${cv.id}')" title="CV İndir">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteCV('${cv.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `
        )
        .join("");
}

function showCVDetail(cvId) {
    const cv = state.cvs.find((c) => c.id === cvId);
    if (!cv) return;

    const panel = document.getElementById("cv-detail");
    panel.innerHTML = `
        <div class="detail-overlay" onclick="closeCVDetail()"></div>
        <div class="detail-content">
            <div class="detail-header">
                <h2>${escapeHtml(cvListLabel(cv))}</h2>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button class="btn btn-sm btn-secondary" onclick="downloadCV('${cv.id}')" title="Orijinal CV'yi İndir">
                        <i class="fas fa-download"></i> İndir
                    </button>
                    <button class="btn-close" onclick="closeCVDetail()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="detail-body">
                <div class="detail-section">
                    <h3><i class="fas fa-user"></i> Kişisel Bilgiler</h3>
                    ${cv.data.name ? `<p><strong>Ad:</strong> ${cv.data.name}</p>` : ""}
                    ${cv.data.email ? `<p><strong>Email:</strong> ${cv.data.email}</p>` : ""}
                    ${cv.data.phone ? `<p><strong>Telefon:</strong> ${cv.data.phone}</p>` : ""}
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-code"></i> Beceriler</h3>
                    <div class="skill-tags">
                        ${cv.data.skills.map((s) => `<span class="tag">${s}</span>`).join("")}
                        ${cv.data.skills.length === 0 ? '<p class="text-muted">Beceri bulunamadı</p>' : ""}
                    </div>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-graduation-cap"></i> Eğitim</h3>
                    ${
                        cv.data.education.length > 0
                            ? cv.data.education
                                  .map(
                                      (e) => `
                        <div class="info-item">
                            <strong>${e.degree}</strong>
                            ${e.field ? ` - ${e.field}` : ""}
                            ${e.institution ? `<p>${e.institution}</p>` : ""}
                            ${e.year ? `<p class="text-muted">${e.year}</p>` : ""}
                        </div>
                    `
                                  )
                                  .join("")
                            : '<p class="text-muted">Eğitim bilgisi bulunamadı</p>'
                    }
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-briefcase"></i> Deneyim</h3>
                    ${
                        cv.data.experience.length > 0
                            ? cv.data.experience
                                  .map(
                                      (e) => `
                        <div class="info-item">
                            <strong>${e.title}</strong>
                            ${e.company ? ` - ${e.company}` : ""}
                            ${e.duration ? `<p class="text-muted">${e.duration}</p>` : ""}
                            ${e.description ? `<p>${e.description}</p>` : ""}
                        </div>
                    `
                                  )
                                  .join("")
                            : '<p class="text-muted">Deneyim bilgisi bulunamadı</p>'
                    }
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-language"></i> Diller</h3>
                    <div class="skill-tags">
                        ${cv.data.languages.map((l) => `<span class="tag tag-lang">${l}</span>`).join("")}
                        ${cv.data.languages.length === 0 ? '<p class="text-muted">Dil bilgisi bulunamadı</p>' : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
    panel.classList.remove("hidden");
    panel.classList.add("visible");
    document.querySelector("#main-app.app")?.classList.add("detail-open");
}

function closeCVDetail() {
    const panel = document.getElementById("cv-detail");
    panel.classList.remove("visible");
    panel.classList.add("hidden");
    document.querySelector("#main-app.app")?.classList.remove("detail-open");
}

async function downloadCV(cvId) {
    try {
        const response = await fetch(`/api/cv/${cvId}/download`, { headers: authHeaders() });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showToast(err.detail || "İndirme başarısız", "error");
            return;
        }
        const blob = await response.blob();
        const cd = response.headers.get("Content-Disposition");
        let fname = "cv.pdf";
        if (cd && cd.includes("filename=")) {
            fname = cd.split("filename=")[1].replace(/"/g, "").trim();
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast("İndirme hatası", "error");
    }
}

async function downloadMatchReport(matchId) {
    if (!matchId) return;
    try {
        const response = await fetch(`/api/match/report/${matchId}`, { headers: authHeaders() });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showToast(err.detail || "Rapor indirilemedi", "error");
            return;
        }
        const blob = await response.blob();
        const ct = response.headers.get("Content-Type") || "";
        if (!ct.includes("pdf")) {
            showToast("Sunucu PDF döndürmedi; oturumu kontrol edin.", "error");
            return;
        }
        const cd = response.headers.get("Content-Disposition");
        let fname = `CVMatch_Rapor_${matchId.slice(0, 8)}.pdf`;
        if (cd) {
            const mStar = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
            if (mStar) {
                try {
                    fname = decodeURIComponent(mStar[1].trim());
                } catch {
                    /* keep default */
                }
            } else if (cd.includes("filename=")) {
                fname = cd.split("filename=")[1].replace(/"/g, "").trim();
            }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Rapor indirildi.", "success");
    } catch (e) {
        showToast("Rapor indirme hatası", "error");
    }
}

async function deleteCV(cvId) {
    if (!confirm("Bu CV'yi silmek istediğinize emin misiniz?")) return;

    try {
        await api(`/api/cv/${cvId}`, { method: "DELETE" });
        showToast("CV silindi", "success");
        loadCVs();
    } catch (e) {

    }
}

async function handleCVUpload(file) {
    if (!isCompany()) {
        showToast("PDF yükleme yalnızca şirket hesabıyla kullanılabilir.", "warning");
        return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Sadece PDF dosyaları kabul edilmektedir", "error");
        return;
    }
    const kvkk = document.getElementById("cv-kvkk-consent");
    if (!kvkk || !kvkk.checked) {
        showToast("CV yüklemek için KVKK onayı vermeniz gerekir.", "warning");
        return;
    }

    try {
        showLoading();
        await apiUploadManagerCv("/api/cv/upload", file, true);
        showToast("CV başarıyla yüklendi ve analiz edildi!", "success");
        if (kvkk) kvkk.checked = false;
        loadCVs();
    } catch (e) {
        showToast(e.message || "Yükleme hatası", "error");
    } finally {
        hideLoading();
    }
}

async function prefillJobCompanyField() {
    const inp = document.getElementById("job-company");
    const hint = document.getElementById("job-company-hint");
    if (!inp || !isCompany()) return;
    try {
        const me = await api("/api/auth/me");
        let name = me.company_name || "";
        const managed = me.companies || getManagedCompaniesFromStorage();
        if (managed?.length) {
            const ac = getActiveCompanyId();
            const row = managed.find((c) => c.id === ac);
            if (row?.name) name = row.name;
        }
        if (name) {
            inp.value = name;
            inp.readOnly = true;
            inp.classList.add("input-readonly");
            if (hint) {
                hint.textContent = "Kayıtlı şirket unvanı otomatik doldurulur.";
                hint.classList.remove("hidden");
            }
        } else {
            inp.readOnly = false;
            inp.classList.remove("input-readonly");
            if (hint) hint.classList.add("hidden");
        }
    } catch {
        /* ignore */
    }
    void loadJobCompanyPreview();
}

async function loadJobs() {
    if (!isCompany()) return;
    try {
        showLoading();
        state.jobs = await api(buildJobListUrl());
        await prefillJobCompanyField();
        const ikInp = document.getElementById("ik-job-server-dept");
        if (ikInp) ikInp.value = state.ikJobServerDeptFilter || "";
        renderJobList();
        syncCompanyJobDepartmentInput();
        const hint = document.getElementById("job-tenant-context");
        if (hint) {
            const list = getManagedCompaniesFromStorage();
            if (list.length > 1) {
                const ac = getActiveCompanyId();
                const row = list.find((c) => c.id === ac);
                const label = row?.name || ac || "";
                hint.textContent = `Liste ve yeni ilanlar şu an seçili şirket için: ${label}`;
                hint.classList.remove("hidden");
            } else {
                hint.textContent = "";
                hint.classList.add("hidden");
            }
        }
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function renderJobDeptPills() {
    const wrap = document.getElementById("job-dept-filter-wrap");
    const pills = document.getElementById("job-dept-filter-pills");
    if (!wrap || !pills) return;
    const set = new Set();
    state.jobs.forEach((j) => {
        const d = (j.department || "").trim();
        if (d) set.add(d);
    });
    if (set.size === 0) {
        wrap.style.display = "none";
        return;
    }
    wrap.style.display = "";
    const sorted = Array.from(set).sort();
    const parts = [
        `<button type="button" class="pill-tab ${state.jobDeptFilter === "" ? "active" : ""}" data-dept-all="1">Tümü</button>`,
        ...sorted.map(
            (d) =>
                `<button type="button" class="pill-tab ${state.jobDeptFilter === d ? "active" : ""}" data-dept="${encodeURIComponent(d)}">${escapeHtml(d)}</button>`
        ),
    ];
    pills.innerHTML = parts.join("");
    pills.querySelectorAll("button[data-dept-all]").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.jobDeptFilter = "";
            renderJobList();
        });
    });
    pills.querySelectorAll("button[data-dept]").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.jobDeptFilter = decodeURIComponent(btn.getAttribute("data-dept") || "");
            renderJobList();
        });
    });
}

function renderJobList() {
    const container = document.getElementById("job-list");
    const searchInput = document.getElementById("job-search");
    const searchCount = document.getElementById("job-search-count");
    const query = (searchInput?.value || "").toLowerCase();

    if (state.jobs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-briefcase"></i>
                <p>İlan yok</p>
            </div>
        `;
        if (searchCount) searchCount.textContent = "";
        document.getElementById("job-dept-filter-wrap") && (document.getElementById("job-dept-filter-wrap").style.display = "none");
        return;
    }

    renderJobDeptPills();

    let byDept = state.jobs;
    if (state.jobDeptFilter) {
        byDept = state.jobs.filter((j) => (j.department || "").trim() === state.jobDeptFilter);
    }

    const filtered = query
        ? byDept.filter((job) => {
            const haystack = [
                job.title,
                job.company,
                job.description,
                job.department || "",
                job.location || "",
                job.workplace_type || "",
                workplaceTypeLabel(job.workplace_type) || "",
                ...job.requirements.required_skills,
                ...job.requirements.preferred_skills,
                ...job.requirements.languages,
            ].join(" ").toLowerCase();
            return haystack.includes(query);
        })
        : byDept;

    if (searchCount) {
        searchCount.textContent = query || state.jobDeptFilter
            ? `${filtered.length} / ${byDept.length}`
            : "";
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Sonuç yok</p></div>`;
        return;
    }

    const groups = groupJobsByDepartmentKey(filtered);
    container.innerHTML = groups
        .map(({ dept, jobs: jlist }) => {
            const title =
                dept === "__none__"
                    ? "Departman atanmamış ilanlar"
                    : `<i class="fas fa-building"></i> ${escapeHtml(dept)}`;
            const cards = jlist.map((job) => renderCompanyJobCardHtml(job, { hideDeptPill: true })).join("");
            return `<div class="job-list-dept-block">
                <h3 class="job-list-dept-heading">${title}</h3>
                <div class="card-grid job-list-dept-grid">${cards}</div>
            </div>`;
        })
        .join("");
}

function openJobApplicants(jobId) {
    state.applicantsJobId = jobId;
    navigate("job-applicants");
}

async function openJobApplicantsInline(jobId) {
    try {
        showLoading();
        const applicants = await api(`/api/applications/job/${jobId}`);
        const job = state.jobs.find(j => j.id === jobId);
        
        // Create modal content
        const modal = document.getElementById("detail-modal");
        const modalTitle = document.getElementById("detail-modal-title");
        const modalBody = document.getElementById("detail-modal-body");
        
        modalTitle.textContent = `Başvurular - ${job ? job.title : 'İlan'}`;
        
        if (!applicants || applicants.length === 0) {
            modalBody.innerHTML = '<p class="text-muted">Henüz başvuru yok.</p>';
        } else {
            modalBody.innerHTML = `
                <div style="max-height: 400px; overflow-y: auto;">
                    ${applicants.map(app => `
                        <div class="card" style="margin-bottom: 0.75rem; padding: 1rem;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                                <div>
                                    <strong>${app.applicant_username || 'Aday'}</strong>
                                    <p class="text-muted" style="font-size: 0.8rem; margin: 0.25rem 0 0;">CV: ${app.cv_display_id || app.cv_id || '—'}</p>
                                </div>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(app.created_at)}</span>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-sm btn-secondary" onclick="goToCvDetail('${app.cv_id}')">
                                    <i class="fas fa-eye"></i> CV
                                </button>
                                <button class="btn btn-sm btn-secondary" onclick="state.matchPrefillCvId='${app.cv_id}'; state.matchPrefillJobId='${jobId}'; navigate('match')">
                                    <i class="fas fa-search"></i> Eşleştir
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        modal.classList.remove("hidden");
        hideLoading();
    } catch (error) {
        console.error("Error loading applicants:", error);
        showToast("Başvurular yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

const tagData = {
    "required-skills": [],
    "preferred-skills": [],
    "languages": [],
    "emp-skills": [],
    "emp-certs": [],
};

function wireEmployeeApplicationTableRows(container, apps, cvLabels) {
    if (!container) return;
    container.querySelectorAll(".emp-app-job").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.getAttribute("data-job-id");
            if (!id) return;
            try {
                const job = await api(`/api/job/${id}`);
                openDetailModal(
                    job.title || "İlan",
                    `${formatCompanyProfileHtml(job.company_profile, { heading: "İşveren şirket" }) || `<p><strong>Şirket:</strong> ${escapeHtml(job.company_legal_name || job.company || "—")}</p>`}
                    <p><strong>Departman:</strong> ${escapeHtml(job.department || "—")}</p>
                    <p><strong>Lokasyon:</strong> ${escapeHtml(job.location || "—")}</p>
                    <p style="white-space:pre-line;margin-top:0.75rem">${escapeHtml(job.description || "")}</p>`
                );
            } catch {
                /* toast */
            }
        });
    });
    container.querySelectorAll(".emp-app-cv").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-cv-id");
            if (id) {
                state.editingCvId = id;
                navigate("employee-cv");
                void loadEmployeeCvIntoForm(id);
            }
        });
    });
    container.querySelectorAll(".emp-app-msg").forEach((btn) => {
        btn.addEventListener("click", () => {
            const cid = btn.getAttribute("data-company-id");
            const jid = btn.getAttribute("data-job-id");
            if (cid) void openChatWithCompany(cid, jid);
        });
    });
}

function renderEmployeeApplicationsTableHtml(apps, cvLabels) {
    return `<div class="table-scroll-wrap"><table class="compare-table employee-applications-table"><thead><tr>
        <th>İlan</th><th>Şirket</th><th>CV</th><th>Tarih</th><th>Durum</th><th></th>
    </tr></thead><tbody>${apps
        .map(
            (a) => `
        <tr>
            <td><button type="button" class="btn-link emp-app-job" data-job-id="${escapeHtml(a.job_id)}">${escapeHtml(a.job_title || "—")}</button></td>
            <td>${escapeHtml(a.company_name || "—")}</td>
            <td><button type="button" class="btn-link emp-app-cv" data-cv-id="${escapeHtml(a.cv_id)}">${escapeHtml(cvLabels.get(a.cv_id) || "CV")}</button></td>
            <td>${formatDate(a.created_at)}</td>
            <td>${a.job_status === "closed" ? "Kapalı" : "Açık"}</td>
            <td class="emp-app-actions">
                ${
                    a.company_id
                        ? `<button type="button" class="btn btn-sm btn-secondary emp-app-msg" data-company-id="${escapeHtml(a.company_id)}" data-job-id="${escapeHtml(a.job_id || "")}"><i class="fas fa-comments"></i> Mesaj</button>`
                        : ""
                }
                <button type="button" class="btn btn-sm btn-ghost app-withdraw-btn" data-app-id="${escapeHtml(a.id)}">Geri çek</button>
            </td>
        </tr>`
        )
        .join("")}</tbody></table></div>`;
}

function setupTagInput(inputId, dataKey, tagClass) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const value = input.value.trim().replace(/,$/,"");
            if (value && !tagData[dataKey].includes(value)) {
                tagData[dataKey].push(value);
                renderTags(dataKey, tagClass);
            }
            input.value = "";
        }
    });

    input.addEventListener("blur", () => {
        const value = input.value.trim().replace(/,$/,"");
        if (value && !tagData[dataKey].includes(value)) {
            tagData[dataKey].push(value);
            renderTags(dataKey, tagClass);
        }
        input.value = "";
    });
}

function renderTags(dataKey, tagClass) {
    const container = document.getElementById(dataKey + "-tags");
    if (!container) return;

    container.innerHTML = tagData[dataKey].map((tag, i) => `
        <span class="tag-removable ${tagClass}">
            ${tag}
            <button type="button" class="tag-remove-btn" onclick="removeTag('${dataKey}', ${i}, '${tagClass}')">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join("");
}

function removeTag(dataKey, index, tagClass) {
    tagData[dataKey].splice(index, 1);
    renderTags(dataKey, tagClass);
}

function clearAllTags() {
    tagData["required-skills"] = [];
    tagData["preferred-skills"] = [];
    tagData["languages"] = [];
    renderTags("required-skills", "tag-required");
    renderTags("preferred-skills", "tag-preferred");
    renderTags("languages", "tag-lang");
}

async function createJob(e) {
    e.preventDefault();

    const title = document.getElementById("job-title").value;
    const company = document.getElementById("job-company").value;
    const description = document.getElementById("job-description").value;
    const education = document.getElementById("job-education").value;
    const experience = document.getElementById("job-experience").value;
    const location = (document.getElementById("job-location")?.value || "").trim() || null;
    const wp = document.getElementById("job-workplace-type")?.value || "";
    const workplace_type = wp === "remote" || wp === "hybrid" || wp === "onsite" ? wp : null;

    try {
        showLoading();
        await api("/api/job/create", {
            method: "POST",
            body: JSON.stringify({
                title,
                company: company || null,
                description: description || title,
                required_skills: tagData["required-skills"],
                preferred_skills: tagData["preferred-skills"],
                min_education: education || null,
                experience_years: experience ? parseInt(experience) : null,
                experience_type: experience === "0" ? "Deneyimsiz" : experience ? experience + " Yıl" : null,
                languages: tagData["languages"],
                department: (document.getElementById("job-department")?.value || "").trim() || null,
                location,
                workplace_type,
            }),
        });
        showToast("İş ilanı eklendi!", "success");
        document.getElementById("job-form").reset();
        clearAllTags();
        void prefillJobCompanyField();
        loadJobs();
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function formatCompanyProfileHtml(profile, opts = {}) {
    if (!profile) return "";
    const lines = [];
    const p = profile;
    if (p.name) {
        lines.push(
            `<p class="company-profile-line company-profile-name"><i class="fas fa-building"></i> <strong>${escapeHtml(p.name)}</strong></p>`
        );
    }
    if (p.address) {
        lines.push(
            `<p class="company-profile-line"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.address)}</p>`
        );
    }
    if (p.email) {
        lines.push(
            `<p class="company-profile-line"><i class="fas fa-envelope"></i> <a href="mailto:${encodeURIComponent(p.email)}">${escapeHtml(p.email)}</a></p>`
        );
    }
    if (p.phone) {
        lines.push(
            `<p class="company-profile-line"><i class="fas fa-phone"></i> <a href="tel:${encodeURIComponent(p.phone.replace(/\s/g, ""))}">${escapeHtml(p.phone)}</a></p>`
        );
    }
    if (p.website) {
        const url = /^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`;
        lines.push(
            `<p class="company-profile-line"><i class="fas fa-globe"></i> <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.website)}</a></p>`
        );
    }
    if (!lines.length) return "";
    const heading = opts.heading
        ? `<p class="company-profile-heading">${escapeHtml(opts.heading)}</p>`
        : "";
    return `<div class="company-profile-block">${heading}${lines.join("")}</div>`;
}

function jobDetailCompanyBlock(job) {
    const prof = job.company_profile;
    if (prof && (prof.name || prof.email || prof.phone || prof.address || prof.website)) {
        return formatCompanyProfileHtml(prof, { heading: "İşveren şirket" });
    }
    return jobDetailCompanyLine(job);
}

function jobDetailCompanyLine(job) {
    const legal = job.company_legal_name;
    const short = job.company;
    if (legal && short && legal !== short) {
        return `<p style="margin-bottom:1rem"><i class="fas fa-building"></i> ${escapeHtml(legal)} <span class="text-muted">(${escapeHtml(short)})</span></p>`;
    }
    const label = legal || short;
    return label ? `<p style="margin-bottom:1rem"><i class="fas fa-building"></i> ${escapeHtml(label)}</p>` : "";
}

function openEmployeeJobDetailModal(job) {
    const req = job.requirements || { required_skills: [], preferred_skills: [] };
    const reqSkills = [...(req.required_skills || []), ...(req.preferred_skills || [])];
    const applied = (state.employeeApplications || []).some((a) => a.job_id === job.id);
    const companyId = job.company_id || null;
    openDetailModal(
        job.title || "İlan",
        `${jobDetailCompanyBlock(job)}
        ${job.department ? `<p><strong>Departman:</strong> ${escapeHtml(job.department)}</p>` : ""}
        ${job.location ? `<p><strong>Lokasyon:</strong> ${escapeHtml(job.location)}</p>` : ""}
        ${workplaceTypeLabel(job.workplace_type) ? `<p><strong>Çalışma:</strong> ${workplaceTypeLabel(job.workplace_type)}</p>` : ""}
        <p style="white-space:pre-line;margin-top:0.75rem">${escapeHtml(job.description || "")}</p>
        ${reqSkills.length ? `<p style="margin-top:0.75rem"><strong>Beceriler:</strong> ${reqSkills.slice(0, 12).map((s) => escapeHtml(s)).join(", ")}</p>` : ""}
        ${
            applied && companyId
                ? `<p style="margin-top:1rem"><button type="button" class="btn btn-secondary btn-sm" id="emp-job-detail-msg-btn"><i class="fas fa-comments"></i> Şirkete mesaj gönder</button></p>`
                : ""
        }`
    );
    const msgBtn = document.getElementById("emp-job-detail-msg-btn");
    if (msgBtn && companyId) {
        msgBtn.addEventListener("click", () => {
            closeDetailModal();
            void openChatWithCompany(companyId, job.id);
        });
    }
}

async function showJobDetail(jobId) {
    if (!jobId) return;
    let job =
        (state.jobs || []).find((j) => j.id === jobId) ||
        (state.employeeJobs || []).find((j) => j.id === jobId);
    if (!job) {
        try {
            showLoading();
            job = await api(`/api/job/${jobId}`);
        } catch {
            showToast("İlan bulunamadı", "error");
            return;
        } finally {
            hideLoading();
        }
    }
    if (isEmployee()) {
        openEmployeeJobDetailModal(job);
        return;
    }

    state.editingJobId = null;
    const req = job.requirements || {
        required_skills: [],
        preferred_skills: [],
        languages: [],
        min_education: null,
        experience_years: null,
    };
    const panel = document.getElementById("job-detail");
    if (!panel) {
        openEmployeeJobDetailModal(job);
        return;
    }
    panel.innerHTML = `
        <div class="detail-overlay" onclick="closeJobDetail()"></div>
        <div class="detail-content">
            <div class="detail-header">
                <h2>${escapeHtml(job.title || "")}</h2>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    ${isCompany() ? `<button class="btn btn-sm btn-secondary" onclick="editJob('${job.id}')"><i class="fas fa-edit"></i> Düzenle</button>` : ""}
                    <button class="btn-close" onclick="closeJobDetail()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="detail-body">
                ${jobDetailCompanyBlock(job)}
                ${job.department ? `<p style="margin-bottom:1rem"><i class="fas fa-sitemap"></i> ${escapeHtml(job.department)}</p>` : ""}
                ${job.location ? `<p style="margin-bottom:1rem"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</p>` : ""}
                ${workplaceTypeLabel(job.workplace_type) ? `<p style="margin-bottom:1rem"><i class="fas fa-laptop-house"></i> ${workplaceTypeLabel(job.workplace_type)}</p>` : ""}

                <div class="detail-section">
                    <h3><i class="fas fa-align-left"></i> İlan Açıklaması</h3>
                    <p style="white-space:pre-line">${escapeHtml(job.description || "")}</p>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-check-circle"></i> Zorunlu Beceriler</h3>
                    <div class="skill-tags">
                        ${req.required_skills.map((s) => `<span class="tag tag-required">${escapeHtml(s)}</span>`).join("")}
                        ${req.required_skills.length === 0 ? '<p class="text-muted">Belirtilmemiş</p>' : ""}
                    </div>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-star"></i> Tercih Edilen Beceriler</h3>
                    <div class="skill-tags">
                        ${req.preferred_skills.map((s) => `<span class="tag tag-preferred">${escapeHtml(s)}</span>`).join("")}
                        ${req.preferred_skills.length === 0 ? '<p class="text-muted">Belirtilmemiş</p>' : ""}
                    </div>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-graduation-cap"></i> Eğitim</h3>
                    <p>${escapeHtml(req.min_education || "Belirtilmemiş")}</p>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-clock"></i> Deneyim</h3>
                    <p>${req.experience_years !== null && req.experience_years !== undefined
                        ? (req.experience_years === 0 ? "Deneyimsiz / Stajyer" : req.experience_years + " yıl")
                        : "Belirtilmemiş"}</p>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-language"></i> Diller</h3>
                    <div class="skill-tags">
                        ${req.languages.map((l) => `<span class="tag tag-lang">${escapeHtml(l)}</span>`).join("")}
                        ${req.languages.length === 0 ? '<p class="text-muted">Belirtilmemiş</p>' : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
    panel.classList.remove("hidden");
    panel.classList.add("visible");
    document.querySelector("#main-app.app")?.classList.add("detail-open");
}

function editJob(jobId) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    state.editingJobId = jobId;

    const eduOptions = ["", "Lise", "Ön Lisans", "Lisans", "Yüksek Lisans", "Doktora"];
    const expOptions = [
        { value: "", label: "Belirtilmemiş" },
        { value: "0", label: "Deneyimsiz / Stajyer" },
        { value: "1", label: "1 Yıl" },
        { value: "2", label: "2 Yıl" },
        { value: "3", label: "3 Yıl" },
        { value: "5", label: "5+ Yıl" },
        { value: "10", label: "10+ Yıl" },
    ];

    const currentExp = job.requirements.experience_years;
    const currentEdu = job.requirements.min_education || "";
    const currentWp = job.workplace_type || "";
    const deptFieldReadonly = !isCompanyHrScope();

    const panel = document.getElementById("job-detail");
    panel.innerHTML = `
        <div class="detail-overlay" onclick="closeJobDetail()"></div>
        <div class="detail-content">
            <div class="detail-header">
                <h2><i class="fas fa-edit"></i> İlanı Düzenle</h2>
                <button class="btn-close" onclick="closeJobDetail()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="detail-body">
                <form id="edit-job-form" onsubmit="saveJobEdit(event)">
                    <div class="form-group">
                        <label>İş Başlığı</label>
                        <input type="text" id="edit-job-title" value="${job.title}" required>
                    </div>
                    <div class="form-group">
                        <label>Şirket</label>
                        <input type="text" id="edit-job-company" value="${job.company || ""}">
                    </div>
                    <div class="form-group">
                        <label>Departman / ekip</label>
                        <input type="text" id="edit-job-department" value="${escapeHtml(job.department || "")}" maxlength="120" ${deptFieldReadonly ? "readonly title=\"Yalnızca İK değiştirebilir\"" : ""}>
                    </div>
                    <div class="form-group">
                        <label>Lokasyon (opsiyonel)</label>
                        <input type="text" id="edit-job-location" value="${escapeHtml(job.location || "")}" maxlength="120" placeholder="Örn: İstanbul / Ankara">
                    </div>
                    <div class="form-group">
                        <label>Çalışma modeli</label>
                        <select id="edit-job-workplace-type">
                            <option value="">Belirtilmedi</option>
                            <option value="onsite" ${currentWp === "onsite" ? "selected" : ""}>Ofiste</option>
                            <option value="remote" ${currentWp === "remote" ? "selected" : ""}>Uzaktan</option>
                            <option value="hybrid" ${currentWp === "hybrid" ? "selected" : ""}>Hibrit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>İlan Açıklaması</label>
                        <textarea id="edit-job-description" rows="4">${job.description}</textarea>
                    </div>

                    <div class="form-divider"><span>Gereksinimler</span></div>

                    <div class="form-group">
                        <label><i class="fas fa-check-circle text-danger"></i> Zorunlu Beceriler</label>
                        <div class="tag-input-container">
                            <div class="tag-list" id="edit-required-skills-tags"></div>
                            <input type="text" class="tag-input" id="edit-required-skills-input"
                                   placeholder="Beceri yazıp Enter'a basın">
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-star text-warning"></i> Tercih Edilen Beceriler</label>
                        <div class="tag-input-container">
                            <div class="tag-list" id="edit-preferred-skills-tags"></div>
                            <input type="text" class="tag-input" id="edit-preferred-skills-input"
                                   placeholder="Beceri yazıp Enter'a basın">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-graduation-cap"></i> Minimum Eğitim</label>
                            <select id="edit-job-education">
                                ${eduOptions.map(e => `<option value="${e}" ${e === currentEdu ? "selected" : ""}>${e || "Belirtilmemiş"}</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-briefcase"></i> Deneyim</label>
                            <select id="edit-job-experience">
                                ${expOptions.map(e => `<option value="${e.value}" ${(currentExp !== null && currentExp !== undefined && String(currentExp) === e.value) ? "selected" : ""}>${e.label}</option>`).join("")}
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-language"></i> Diller</label>
                        <div class="tag-input-container">
                            <div class="tag-list" id="edit-languages-tags"></div>
                            <input type="text" class="tag-input" id="edit-languages-input"
                                   placeholder="Dil yazıp Enter'a basın">
                        </div>
                    </div>

                    <div style="display:flex;gap:0.75rem;margin-top:1rem">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Kaydet
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="showJobDetail('${jobId}')">
                            <i class="fas fa-arrow-left"></i> İptal
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    editTagData = {
        "edit-required-skills": [...job.requirements.required_skills],
        "edit-preferred-skills": [...job.requirements.preferred_skills],
        "edit-languages": [...job.requirements.languages],
    };
    renderEditTags("edit-required-skills", "tag-required");
    renderEditTags("edit-preferred-skills", "tag-preferred");
    renderEditTags("edit-languages", "tag-lang");

    setupEditTagInput("edit-required-skills-input", "edit-required-skills", "tag-required");
    setupEditTagInput("edit-preferred-skills-input", "edit-preferred-skills", "tag-preferred");
    setupEditTagInput("edit-languages-input", "edit-languages", "tag-lang");
}

let editTagData = {};

function setupEditTagInput(inputId, dataKey, tagClass) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const value = input.value.trim().replace(/,$/,"");
            if (value && !editTagData[dataKey].includes(value)) {
                editTagData[dataKey].push(value);
                renderEditTags(dataKey, tagClass);
            }
            input.value = "";
        }
    });
}

function renderEditTags(dataKey, tagClass) {
    const container = document.getElementById(dataKey + "-tags");
    if (!container) return;

    container.innerHTML = editTagData[dataKey].map((tag, i) => `
        <span class="tag-removable ${tagClass}">
            ${tag}
            <button type="button" class="tag-remove-btn" onclick="removeEditTag('${dataKey}', ${i}, '${tagClass}')">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join("");
}

function removeEditTag(dataKey, index, tagClass) {
    editTagData[dataKey].splice(index, 1);
    renderEditTags(dataKey, tagClass);
}

async function saveJobEdit(e) {
    e.preventDefault();

    const jobId = state.editingJobId;
    if (!jobId) return;

    const title = document.getElementById("edit-job-title").value;
    const company = document.getElementById("edit-job-company").value;
    const department = document.getElementById("edit-job-department")?.value || "";
    const location = (document.getElementById("edit-job-location")?.value || "").trim() || null;
    const wpRaw = document.getElementById("edit-job-workplace-type")?.value || "";
    const workplace_type =
        wpRaw === "remote" || wpRaw === "hybrid" || wpRaw === "onsite" ? wpRaw : null;
    const description = document.getElementById("edit-job-description").value;
    const education = document.getElementById("edit-job-education").value;
    const experience = document.getElementById("edit-job-experience").value;

    try {
        showLoading();
        const expYears = experience !== "" ? parseInt(experience) : null;
        let experienceType = null;
        if (expYears !== null) {
            experienceType = expYears === 0 ? "junior" : expYears <= 3 ? "mid" : "senior";
        }

        await api(`/api/job/${jobId}`, {
            method: "PUT",
            body: JSON.stringify({
                title,
                company: company || null,
                description: description || title,
                required_skills: editTagData["edit-required-skills"],
                preferred_skills: editTagData["edit-preferred-skills"],
                min_education: education || null,
                experience_years: expYears,
                experience_type: experienceType,
                languages: editTagData["edit-languages"],
                department: department.trim() || null,
                location,
                workplace_type,
            }),
        });
        showToast("İş ilanı güncellendi!", "success");
        state.editingJobId = null;
        await loadJobs();
        showJobDetail(jobId);
    } catch (err) {

    } finally {
        hideLoading();
    }
}

function closeJobDetail() {
    state.editingJobId = null;
    const panel = document.getElementById("job-detail");
    panel.classList.remove("visible");
    panel.classList.add("hidden");
    document.querySelector("#main-app.app")?.classList.remove("detail-open");
}

async function toggleJobStatus(jobId, status) {
    const label = status === "closed" ? "kapatmak" : "yeniden açmak";
    if (!confirm(`Bu ilanı ${label} istediğinize emin misiniz?`)) return;
    try {
        await api(`/api/job/${jobId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        });
        showToast(status === "closed" ? "İlan kapatıldı" : "İlan yeniden açıldı", "success");
        loadJobs();
    } catch (e) {
        /* api() toast gösterir */
    }
}

async function deleteJob(jobId) {
    if (!confirm("Bu iş ilanını silmek istediğinize emin misiniz?")) return;

    try {
        await api(`/api/job/${jobId}`, { method: "DELETE" });
        showToast("İş ilanı silindi", "success");
        loadJobs();
    } catch (e) {

    }
}

async function refreshMatchCvSelect(jobId) {
    const cvSelect = document.getElementById("match-cv-select");
    if (!cvSelect) return;
    if (!jobId) {
        cvSelect.innerHTML = '<option value="">-- Önce ilan seçin --</option>';
        return;
    }
    try {
        const { cv_ids } = await api(`/api/applications/job/${jobId}/cv-ids`);
        const cvs = await api("/api/cv/list");
        const byId = new Map(cvs.map((c) => [c.id, c]));
        cvSelect.innerHTML =
            '<option value="">-- CV Seçin --</option>' +
            cv_ids
                .map((id) => {
                    const cv = byId.get(id);
                    return `<option value="${id}">${escapeHtml(cv ? cvListLabel(cv) : id)}</option>`;
                })
                .join("");
    } catch {
        cvSelect.innerHTML = '<option value="">—</option>';
    }
}

async function loadMatchPage() {
    if (!isCompany()) return;
    try {
        const jobs = await api(buildJobListUrl());
        state.jobs = jobs;

        const jobSelect = document.getElementById("match-job-select");
        jobSelect.innerHTML =
            '<option value="">-- İş İlanı Seçin --</option>' +
            jobs.map((job) => `<option value="${job.id}">${job.title}${job.company ? " - " + job.company : ""}</option>`).join("");

        jobSelect.onchange = () => refreshMatchCvSelect(jobSelect.value);
        if (state.matchPrefillJobId && jobs.some((j) => j.id === state.matchPrefillJobId)) {
            jobSelect.value = state.matchPrefillJobId;
        }
        await refreshMatchCvSelect(jobSelect.value);
        const cvSelect = document.getElementById("match-cv-select");
        if (state.matchPrefillCvId && cvSelect) {
            cvSelect.value = state.matchPrefillCvId;
        }
        state.matchPrefillCvId = null;
        state.matchPrefillJobId = null;
    } catch (e) {

    }
}

async function runMatch() {
    const cvId = document.getElementById("match-cv-select").value;
    const jobId = document.getElementById("match-job-select").value;

    if (!cvId || !jobId) {
        showToast("Lütfen bir CV ve iş ilanı seçin", "warning");
        return;
    }

    try {
        showLoading();
        const result = await api(`/api/match/run/${cvId}/${jobId}`, {
            method: "POST",
        });
        renderMatchResult(result);
        const resultEl = document.getElementById("match-result");
        resultEl.classList.remove("hidden");
        setTimeout(() => resultEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

        if (result.scores.overall >= 80) {
            launchConfetti();
        }
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function renderMatchResult(result) {
    const container = document.getElementById("match-result");
    const scoreColor = getScoreColor(result.scores.overall);
    const dashOffset = 339.3 - (339.3 * result.scores.overall) / 100;

    container.innerHTML = `
        <div class="match-result-actions">
            ${result.cv_id ? `<button type="button" class="btn btn-secondary" onclick="goToCvDetail('${result.cv_id}')"><i class="fas fa-eye"></i> Aday CV'sini gör</button>` : ""}
            ${result.job_id ? `<button type="button" class="btn btn-secondary" onclick="openJobApplicants('${result.job_id}')"><i class="fas fa-users"></i> İlan başvuruları</button>` : ""}
        </div>
        <div class="result-header">
            <div class="score-circle-container">
                <svg class="score-circle" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" class="score-bg-circle"/>
                    <circle cx="60" cy="60" r="54" class="score-fill-circle"
                            style="stroke: ${scoreColor}; stroke-dasharray: 339.3; stroke-dashoffset: ${dashOffset}"/>
                    <text x="60" y="55" class="score-value">${result.scores.overall.toFixed(0)}</text>
                    <text x="60" y="72" class="score-label">/ 100</text>
                </svg>
                <p class="score-title">Genel skor</p>
            </div>
        </div>

        <div class="result-grid">
            <div class="card">
                <h3>Radar Analizi</h3>
                <div class="chart-container">
                    <canvas id="match-radar-chart"></canvas>
                </div>
            </div>

            <div class="card">
                <h3>Kategori Puanları</h3>
                <div class="score-bars">
                    ${renderScoreBar("Beceriler", result.scores.skills)}
                    ${renderScoreBar("Deneyim", result.scores.experience)}
                    ${renderScoreBar("Eğitim", result.scores.education)}
                    ${renderScoreBar("Diller", result.scores.languages)}
                </div>
            </div>
        </div>

        <div class="card">
            <h3><i class="fas fa-check-circle text-success"></i> Eşleşen Beceriler</h3>
            ${renderSkillDetailSection(result.detail, "matched")}
        </div>

        <div class="card">
            <h3><i class="fas fa-times-circle text-danger"></i> Eksik Beceriler</h3>
            ${renderSkillDetailSection(result.detail, "missing")}
        </div>

        <div class="result-grid">
            <div class="card">
                <h3><i class="fas fa-language"></i> Dil Uyumu</h3>
                ${renderLanguageDetail(result.detail)}
            </div>

            <div class="card">
                <h3><i class="fas fa-info-circle"></i> Eğitim & Deneyim Detayı</h3>
                ${renderEduExpDetail(result.detail)}
            </div>
        </div>

        <div class="card" style="text-align:center">
            <button type="button" class="btn btn-primary btn-lg" onclick="downloadMatchReport('${result.id}')">
                <i class="fas fa-file-pdf"></i> Eşleşme Raporunu İndir
            </button>
        </div>

        <div class="card suggestions-card">
            <h3><i class="fas fa-lightbulb text-warning"></i> CV İyileştirme Önerileri</h3>
            <div class="suggestions-list">
                ${result.suggestions.map((s, i) => `
                    <div class="suggestion-card">
                        <div class="suggestion-num">${i + 1}</div>
                        <div class="suggestion-text">${s}</div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;

    createRadarChart(
        "match-radar-chart",
        [result.scores],
        [result.cv_name || "CV"]
    );
}

function renderSkillDetailSection(detail, type) {
    if (!detail || !detail.skill_detail) {
        return '<p class="text-muted">—</p>';
    }
    const sd = detail.skill_detail;
    if (type === "matched") {
        const req = sd.matched_required || [];
        const pref = sd.matched_preferred || [];
        if (req.length === 0 && pref.length === 0) {
            return '<p class="text-muted">—</p>';
        }
        let html = "";
        if (req.length > 0) {
            html += `<div class="detail-sub"><span class="detail-sub-label"><i class="fas fa-check"></i> Zorunlu (${req.length})</span>
                <div class="skill-tags">${req.map(s => `<span class="tag tag-success">${s}</span>`).join("")}</div></div>`;
        }
        if (pref.length > 0) {
            html += `<div class="detail-sub"><span class="detail-sub-label"><i class="fas fa-star"></i> Tercih Edilen (${pref.length})</span>
                <div class="skill-tags">${pref.map(s => `<span class="tag tag-success-light">${s}</span>`).join("")}</div></div>`;
        }
        return html;
    } else {
        const req = sd.missing_required || [];
        const pref = sd.missing_preferred || [];
        if (req.length === 0 && pref.length === 0) {
            return '<p class="text-success"><i class="fas fa-check"></i> Eksik beceri yok!</p>';
        }
        let html = "";
        if (req.length > 0) {
            html += `<div class="detail-sub"><span class="detail-sub-label"><i class="fas fa-exclamation-triangle text-danger"></i> Zorunlu Eksik (${req.length})</span>
                <div class="skill-tags">${req.map(s => `<span class="tag tag-danger">${s}</span>`).join("")}</div></div>`;
        }
        if (pref.length > 0) {
            html += `<div class="detail-sub"><span class="detail-sub-label"><i class="fas fa-info-circle text-warning"></i> Tercih Edilen Eksik (${pref.length})</span>
                <div class="skill-tags">${pref.map(s => `<span class="tag tag-warning">${s}</span>`).join("")}</div></div>`;
        }
        return html;
    }
}

function renderLanguageDetail(detail) {
    if (!detail || !detail.language_detail) {
        return '<p class="text-muted">—</p>';
    }
    const ld = detail.language_detail;
    let html = "";
    if (ld.matched && ld.matched.length > 0) {
        html += `<div class="skill-tags" style="margin-bottom:0.5rem">${ld.matched.map(l => `<span class="tag tag-success"><i class="fas fa-check"></i> ${cleanLanguageName(l)}</span>`).join("")}</div>`;
    }
    if (ld.missing && ld.missing.length > 0) {
        html += `<div class="skill-tags">${ld.missing.map(l => `<span class="tag tag-danger"><i class="fas fa-times"></i> ${cleanLanguageName(l)}</span>`).join("")}</div>`;
    }
    if ((!ld.matched || ld.matched.length === 0) && (!ld.missing || ld.missing.length === 0)) {
        html = '<p class="text-muted">—</p>';
    }
    return html;
}

function cleanLanguageName(name) {
    // Remove any "x" prefix that might appear (e.g., "xTurkish" -> "Turkish")
    if (name && name.startsWith('x')) {
        return name.substring(1);
    }
    return name || '';
}

function renderEduExpDetail(detail) {
    if (!detail) return '<p class="text-muted">—</p>';

    let html = "";
    if (detail.education) {
        const edu = detail.education;
        const cvLevels = edu.cv_level && edu.cv_level.length > 0 ? edu.cv_level.join(", ") : "Belirtilmemiş";
        html += `<div class="detail-sub">
            <span class="detail-sub-label"><i class="fas fa-graduation-cap"></i> Eğitim</span>
            <p>CV: <strong>${cvLevels}</strong></p>
            <p>İstenen: <strong>${edu.required || "Belirtilmemiş"}</strong></p>
        </div>`;
    }
    if (detail.experience) {
        const exp = detail.experience;
        const cvYears = exp.cv_total_years !== null && exp.cv_total_years !== undefined ? exp.cv_total_years + " yıl" : "Belirtilmemiş";
        const reqYears = exp.required_years !== null && exp.required_years !== undefined
            ? (exp.required_years === 0 ? "Deneyimsiz / Stajyer" : exp.required_years + " yıl")
            : "Belirtilmemiş";
        html += `<div class="detail-sub">
            <span class="detail-sub-label"><i class="fas fa-briefcase"></i> Deneyim</span>
            <p>CV: <strong>${cvYears}</strong></p>
            <p>İstenen: <strong>${reqYears}</strong></p>
        </div>`;
    }
    return html || '<p class="text-muted">—</p>';
}

function renderScoreBar(label, score) {
    const color = getScoreColor(score);
    return `
        <div class="score-bar-item">
            <div class="score-bar-header">
                <span>${label}</span>
                <span style="color: ${color}">${score.toFixed(0)}%</span>
            </div>
            <div class="score-bar-track">
                <div class="score-bar-fill" style="width: ${score}%; background: ${color}"></div>
            </div>
        </div>
    `;
}

async function refreshCompareCvCheckboxes(jobId) {
    const checkboxes = document.getElementById("compare-cv-checkboxes");
    if (!checkboxes) return;
    if (!jobId) {
        checkboxes.innerHTML = "<p class=\"text-muted\">Önce ilan seçin</p>";
        return;
    }
    try {
        const { cv_ids } = await api(`/api/applications/job/${jobId}/cv-ids`);
        const cvs = await api("/api/cv/list");
        const byId = new Map(cvs.map((c) => [c.id, c]));
        checkboxes.innerHTML = cv_ids.length
            ? cv_ids
                  .map((id) => {
                      const cv = byId.get(id);
                      const lab = cv ? cvListLabel(cv) : id;
                      return `
            <label class="checkbox-item compare-cv-row">
                <input type="checkbox" value="${id}">
                <span>${escapeHtml(lab)}</span>
                <button type="button" class="btn btn-xs btn-ghost compare-cv-view-btn" data-cv-id="${id}">Gör</button>
            </label>`;
                  })
                  .join("")
            : "<p class=\"text-muted\">Başvuru yok</p>";
        checkboxes.querySelectorAll(".compare-cv-view-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute("data-cv-id");
                if (id) goToCvDetail(id);
            });
        });
    } catch {
        checkboxes.innerHTML = "<p class=\"text-muted\">Başvurular yüklenemedi.</p>";
    }
}

async function loadComparePage() {
    if (!isCompany()) return;
    try {
        const jobs = await api(buildJobListUrl());
        state.jobs = jobs;

        const jobSelect = document.getElementById("compare-job-select");
        jobSelect.innerHTML =
            '<option value="">-- İş İlanı Seçin --</option>' +
            jobs.map((job) => `<option value="${job.id}">${job.title}${job.company ? " - " + job.company : ""}</option>`).join("");

        jobSelect.onchange = () => refreshCompareCvCheckboxes(jobSelect.value);
        await refreshCompareCvCheckboxes(jobSelect.value);
    } catch (e) {

    }
}

async function runCompare() {
    const jobId = document.getElementById("compare-job-select").value;
    const cvIds = Array.from(
        document.querySelectorAll("#compare-cv-checkboxes input:checked")
    ).map((cb) => cb.value);

    if (!jobId) {
        showToast("Lütfen bir iş ilanı seçin", "warning");
        return;
    }
    if (cvIds.length < 1) {
        showToast("En az bir CV seçin", "warning");
        return;
    }

    try {
        showLoading();
        const results = await api("/api/match/compare", {
            method: "POST",
            body: JSON.stringify({ cv_ids: cvIds, job_id: jobId }),
        });
        renderCompareResults(results);
        const compareResultEl = document.getElementById("compare-result");
        compareResultEl.classList.remove("hidden");
        setTimeout(() => compareResultEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function renderCompareResults(results) {
    const container = document.getElementById("compare-result");

    container.innerHTML = `
        <div class="card">
            <h3><i class="fas fa-chart-pie"></i> Karşılaştırmalı Radar</h3>
            <div class="chart-container chart-large">
                <canvas id="compare-radar-chart"></canvas>
            </div>
        </div>

        <div class="card">
            <h3><i class="fas fa-trophy"></i> Sıralama</h3>
            <div class="ranking-list">
                ${results
                    .map(
                        (r, i) => `
                    <div class="ranking-item ${i === 0 ? "ranking-first" : ""}">
                        <div class="ranking-position">${i + 1}</div>
                        <div class="ranking-info">
                            <strong>${r.cv_name || "CV"}</strong>
                            <div class="score-mini-bars">
                                <span>Beceri: ${r.scores.skills.toFixed(0)}%</span>
                                <span>Deneyim: ${r.scores.experience.toFixed(0)}%</span>
                                <span>Eğitim: ${r.scores.education.toFixed(0)}%</span>
                                <span>Dil: ${r.scores.languages.toFixed(0)}%</span>
                            </div>
                        </div>
                        <div class="ranking-score" style="color: ${getScoreColor(r.scores.overall)}">
                            ${r.scores.overall.toFixed(0)}%
                        </div>
                        ${r.cv_id ? `<button type="button" class="btn btn-sm btn-secondary ranking-cv-btn" onclick="goToCvDetail('${r.cv_id}')" title="CV detayı"><i class="fas fa-eye"></i></button>` : ""}
                    </div>
                `
                    )
                    .join("")}
            </div>
        </div>

        <div class="card">
            <h3><i class="fas fa-table"></i> Detaylı Karşılaştırma</h3>
            <div class="table-responsive">
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th>Kriter</th>
                            ${results
                                .map((r) =>
                                    r.cv_id
                                        ? `<th><button type="button" class="btn-link" onclick="goToCvDetail('${r.cv_id}')">${escapeHtml(r.cv_name || "CV")}</button></th>`
                                        : `<th>${escapeHtml(r.cv_name || "CV")}</th>`
                                )
                                .join("")}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Genel Uyum</td>
                            ${results.map((r) => `<td style="color:${getScoreColor(r.scores.overall)}"><strong>${r.scores.overall.toFixed(0)}%</strong></td>`).join("")}
                        </tr>
                        <tr>
                            <td>Beceriler</td>
                            ${results.map((r) => `<td>${r.scores.skills.toFixed(0)}%</td>`).join("")}
                        </tr>
                        <tr>
                            <td>Deneyim</td>
                            ${results.map((r) => `<td>${r.scores.experience.toFixed(0)}%</td>`).join("")}
                        </tr>
                        <tr>
                            <td>Eğitim</td>
                            ${results.map((r) => `<td>${r.scores.education.toFixed(0)}%</td>`).join("")}
                        </tr>
                        <tr>
                            <td>Diller</td>
                            ${results.map((r) => `<td>${r.scores.languages.toFixed(0)}%</td>`).join("")}
                        </tr>
                        <tr>
                            <td>Eşleşen Zorunlu</td>
                            ${results.map((r) => {
                                const cnt = r.detail?.skill_detail?.matched_required?.length || 0;
                                return `<td class="text-success">${cnt}</td>`;
                            }).join("")}
                        </tr>
                        <tr>
                            <td>Eşleşen Tercih</td>
                            ${results.map((r) => {
                                const cnt = r.detail?.skill_detail?.matched_preferred?.length || 0;
                                return `<td class="text-success">${cnt}</td>`;
                            }).join("")}
                        </tr>
                        <tr>
                            <td>Eksik Zorunlu</td>
                            ${results.map((r) => {
                                const cnt = r.detail?.skill_detail?.missing_required?.length || 0;
                                return `<td class="${cnt > 0 ? 'text-danger' : 'text-success'}">${cnt}</td>`;
                            }).join("")}
                        </tr>
                        <tr>
                            <td>Eksik Tercih</td>
                            ${results.map((r) => {
                                const cnt = r.detail?.skill_detail?.missing_preferred?.length || 0;
                                return `<td class="${cnt > 0 ? 'text-warning' : 'text-success'}">${cnt}</td>`;
                            }).join("")}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        ${results.map((r, i) => `
        <div class="card compare-detail-card">
            <div class="compare-detail-header" onclick="toggleCompareDetail(${i})">
                <h3><i class="fas fa-user"></i> ${r.cv_name || "CV"} - Beceri Detayı</h3>
                <i class="fas fa-chevron-down compare-chevron" id="compare-chevron-${i}"></i>
            </div>
            <div class="compare-detail-body hidden" id="compare-detail-${i}">
                <div class="result-grid">
                    <div>
                        <h4 class="text-success"><i class="fas fa-check"></i> Eşleşen</h4>
                        ${renderSkillDetailSection(r.detail, "matched")}
                    </div>
                    <div>
                        <h4 class="text-danger"><i class="fas fa-times"></i> Eksik</h4>
                        ${renderSkillDetailSection(r.detail, "missing")}
                    </div>
                </div>
                <div class="result-grid" style="margin-top:1rem">
                    <div>
                        <h4><i class="fas fa-language"></i> Diller</h4>
                        ${renderLanguageDetail(r.detail)}
                    </div>
                    <div>
                        <h4><i class="fas fa-info-circle"></i> Eğitim & Deneyim</h4>
                        ${renderEduExpDetail(r.detail)}
                    </div>
                </div>
            </div>
        </div>
        `).join("")}
    `;

    createRadarChart(
        "compare-radar-chart",
        results.map((r) => r.scores),
        results.map((r) => r.cv_name || "CV")
    );
}

function toggleCompareDetail(index) {
    const body = document.getElementById(`compare-detail-${index}`);
    const chevron = document.getElementById(`compare-chevron-${index}`);
    if (body.classList.contains("hidden")) {
        body.classList.remove("hidden");
        chevron.style.transform = "rotate(180deg)";
    } else {
        body.classList.add("hidden");
        chevron.style.transform = "rotate(0deg)";
    }
}

const CHART_COLORS = [
    { bg: "rgba(59, 130, 246, 0.2)", border: "rgb(59, 130, 246)" },
    { bg: "rgba(139, 92, 246, 0.2)", border: "rgb(139, 92, 246)" },
    { bg: "rgba(16, 185, 129, 0.2)", border: "rgb(16, 185, 129)" },
    { bg: "rgba(245, 158, 11, 0.2)", border: "rgb(245, 158, 11)" },
    { bg: "rgba(239, 68, 68, 0.2)", border: "rgb(239, 68, 68)" },
];

function createRadarChart(canvasId, scoresArray, labels) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (state.charts[canvasId]) {
        state.charts[canvasId].destroy();
    }

    const datasets = scoresArray.map((scores, i) => ({
        label: labels[i],
        data: [scores.skills, scores.experience, scores.education, scores.languages],
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length].bg,
        borderColor: CHART_COLORS[i % CHART_COLORS.length].border,
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS[i % CHART_COLORS.length].border,
        pointBorderColor: "#fff",
    }));

    state.charts[canvasId] = new Chart(canvas, {
        type: "radar",
        data: {
            labels: ["Beceriler", "Deneyim", "Eğitim", "Diller"],
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        color: "#94a3b8",
                        backdropColor: "transparent",
                    },
                    grid: { color: "rgba(148, 163, 184, 0.3)" },
                    angleLines: { color: "rgba(148, 163, 184, 0.3)" },
                    pointLabels: {
                        color: "#e2e8f0",
                        font: { size: 13, family: "Inter" },
                    },
                },
            },
            plugins: {
                legend: {
                    display: scoresArray.length > 1,
                    labels: {
                        color: "#e2e8f0",
                        font: { family: "Inter" },
                    },
                },
            },
        },
    });
}

function getScoreColor(score) {
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#3b82f6";
    if (score >= 40) return "#f59e0b";
    return "#ef4444";
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
    wireRagExampleQuestions();
}

function wireRagExampleQuestions() {
    const wrap = document.getElementById("rag-example-questions");
    if (!wrap || wrap.dataset.wired) return;
    wrap.dataset.wired = "1";
    const examples = [
        "İletişim bilgileri neler?",
        "Kaç yıl deneyimi var?",
        "Hangi becerilere sahip?",
        "Yabancı dilleri neler?",
        "Eğitim bilgisi nedir?",
    ];
    wrap.innerHTML = examples
        .map(
            (q) =>
                `<button type="button" class="example-chip" data-rag-example="${escapeHtml(q)}">${escapeHtml(q)}</button>`
        )
        .join("");
    wrap.querySelectorAll("[data-rag-example]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const inp = document.getElementById("rag-input");
            if (inp) inp.value = btn.getAttribute("data-rag-example") || "";
            void askRag();
        });
    });
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

function _findCvIdByName(name, sources) {
    if (!sources || !sources.length) {
        if (!state.cvs) return null;
        const cv = state.cvs.find(c =>
            (c.data.name || "").toLowerCase() === name.toLowerCase()
        );
        return cv ? cv.id : null;
    }
    const src = sources.find(s => s.cv_name && s.cv_name.toLowerCase() === name.toLowerCase());
    if (src) return src.cv_id;

    if (state.cvs) {
        const cv = state.cvs.find(c =>
            (c.data.name || "").toLowerCase() === name.toLowerCase()
        );
        return cv ? cv.id : null;
    }
    return null;
}

function goToCvDetail(cvId) {
    if (!isCompany()) {
        showToast("CV detayı yalnızca şirket hesabında görüntülenir.", "info");
        return;
    }
    navigate("job-applicants");
    setTimeout(() => showCVDetail(cvId), 320);
}

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

function renderEmployeeRecentActivity(apps) {
    const el = document.getElementById("employee-recent-activity");
    if (!el) return;
    if (!apps?.length) {
        el.innerHTML =
            '<p class="text-muted">Henüz başvuru yok. <a href="#" id="emp-dash-goto-jobs">İlanlara göz atın</a>.</p>';
        document.getElementById("emp-dash-goto-jobs")?.addEventListener("click", (e) => {
            e.preventDefault();
            navigate("jobs-browse");
        });
        return;
    }
    el.innerHTML = `<ul class="dash-activity-list" style="margin:0;padding-left:0;list-style:none">${apps
        .slice(0, 6)
        .map(
            (a) =>
                `<li class="activity-item activity-item-clickable" role="button" tabindex="0" data-job-id="${escapeHtml(a.job_id || "")}" data-cv-id="${escapeHtml(a.cv_id || "")}">
                    <strong>${escapeHtml(a.job_title || "")}</strong> — ${escapeHtml(a.company_name || "")}
                    <span class="text-muted">${formatDate(a.created_at)}</span>${a.job_status === "closed" ? " (kapalı)" : ""}
                </li>`
        )
        .join("")}</ul>`;
    wireEmployeeRecentActivityClicks(el, apps.slice(0, 6));
}

function wireEmployeeRecentActivityClicks(container, apps) {
    if (!container) return;
    container.querySelectorAll(".activity-item-clickable").forEach((el, i) => {
        const a = apps[i];
        if (!a) return;
        const go = () => {
            if (a.cv_id) {
                state.editingCvId = a.cv_id;
                navigate("employee-cv");
                void loadEmployeeCvIntoForm(a.cv_id);
            } else if (a.job_id) {
                void showJobDetail(a.job_id);
            }
        };
        el.onclick = go;
        el.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
            }
        };
    });
}

function renderCompanyRecentApplications(items) {
    const el = document.getElementById("recent-applications");
    if (!el) return;
    if (!items?.length) {
        el.innerHTML = '<p class="text-muted">Henüz başvuru yok.</p>';
        return;
    }
    el.innerHTML = items
        .map(
            (a) => `
        <div class="activity-item activity-item-clickable" role="button" tabindex="0" data-job-id="${escapeHtml(a.job_id || "")}" data-cv-id="${escapeHtml(a.cv_id || "")}">
            <div class="activity-info">
                <strong>${escapeHtml(a.applicant_label || "Başvuru")}</strong>
                <span class="text-muted">${escapeHtml(a.job_title || "")} · ${formatDate(a.created_at)}</span>
            </div>
        </div>`
        )
        .join("");
    wireCompanyRecentApplicationsClicks(el, items);
}

function wireCompanyRecentApplicationsClicks(container, items) {
    if (!container) return;
    container.querySelectorAll(".activity-item-clickable").forEach((el, i) => {
        const a = items[i];
        if (!a) return;
        const go = () => {
            if (a.cv_id) goToCvDetail(a.cv_id);
            else if (a.job_id) openJobApplicants(a.job_id);
        };
        el.onclick = go;
        el.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
            }
        };
    });
}

async function renderAdminDashboardActivity() {
    const el = document.getElementById("admin-dashboard-activity");
    if (!el || !isAdmin()) return;
    try {
        const audit = await api("/api/admin/audit-logs?limit=8");
        el.innerHTML =
            !audit?.length
                ? "<p class=\"text-muted\">Kayıt yok</p>"
                : `<ul style="margin:0;padding-left:1.1rem">${audit
                      .map(
                          (a) =>
                              `<li><strong>${escapeHtml(a.action || "")}</strong> — ${escapeHtml(a.username || "—")} <span class="text-muted">${escapeHtml(a.created_at || "")}</span></li>`
                      )
                      .join("")}</ul>`;
    } catch {
        el.innerHTML = '<p class="text-muted">Yüklenemedi</p>';
    }
}

async function updateKvkkRevokedBanner() {
    const banner = document.getElementById("kvkk-revoked-banner");
    if (!banner || !isEmployee()) return;
    try {
        const me = await api("/api/auth/me");
        if (me.kvkk_revoked_at && !me.kvkk_accepted_at) {
            banner.classList.remove("hidden");
            banner.innerHTML = `
                <p><strong>KVKK onayı gerekli.</strong> CV ve başvuru işlemleri için metni tekrar onaylamanız gerekir.</p>
                <button type="button" class="btn btn-sm btn-primary" id="kvkk-reaccept-btn">KVKK metnini onayla</button>
            `;
            document.getElementById("kvkk-reaccept-btn")?.addEventListener("click", acceptKvkkReconsent);
        } else {
            banner.classList.add("hidden");
            banner.innerHTML = "";
        }
    } catch {
        banner.classList.add("hidden");
    }
}

async function acceptKvkkReconsent() {
    try {
        const doc = await fetch("/api/auth/kvkk-document").then((r) => r.json());
        if (!confirm("Güncel KVKK metnini okudum ve onaylıyorum.")) return;
        await api("/api/auth/kvkk-accept", {
            method: "POST",
            body: JSON.stringify({ kvkk_accepted: true, kvkk_version: doc.version }),
        });
        showToast("KVKK onayı kaydedildi.", "success");
        await updateKvkkRevokedBanner();
    } catch {
        /* api toast */
    }
}

async function initApp() {
    initTheme();
    setupGlobalKeyboardShortcuts();
    applyDevOnlyUi();

    document.getElementById("sidebar-theme-btn")?.addEventListener("click", () => {
        cycleThemePreference();
    });
    document.getElementById("settings-theme")?.addEventListener("change", (e) => {
        const v = e.target.value || "dark";
        localStorage.setItem(AUTH_THEME_KEY, v);
        applyTheme(v);
    });

    document.getElementById("messages-back-btn")?.addEventListener("click", () => {
        setMessagesThreadOpen(false);
        state.messagesActiveConvId = null;
        const titleEl = document.getElementById("messages-thread-title");
        if (titleEl) titleEl.textContent = "Mesajlar";
        const threadEl = document.getElementById("messages-thread");
        if (threadEl) {
            threadEl.innerHTML = emptyStateHtml(
                "inbox",
                "Sohbet seçin",
                "Soldan bir konuşma seçin veya yeni sohbet başlatın."
            );
        }
    });

    document.getElementById("logout-btn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        stopNotificationPolling();
        closeNotifDropdown();
        try {
            if (getToken()) {
                await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
            }
        } catch {
            /* offline */
        }
        clearSession();
        showLoginScreen();
    });
    document.getElementById("show-password-reset")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPasswordResetForm(true);
    });
    document.getElementById("hide-password-reset")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPasswordResetForm(false);
        document.getElementById("login-form")?.classList.remove("hidden");
        document.getElementById("show-register")?.classList.remove("hidden");
    });
    document.getElementById("password-reset-form")?.addEventListener("submit", onPasswordResetRequest);
    document.getElementById("password-reset-confirm-form")?.addEventListener("submit", onPasswordResetConfirm);
    document.getElementById("settings-delete-account")?.addEventListener("click", deleteMyAccount);
    document.getElementById("show-demo-info")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("demo-info-modal")?.classList.remove("hidden");
    });
    document.getElementById("close-demo-info")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("demo-info-modal")?.classList.add("hidden");
    });

    document.getElementById("sidebar-settings-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        navigate("settings");
    });

    document.getElementById("sidebar-notifications-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifDropdown();
    });

    document.getElementById("notif-dropdown-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        closeNotifDropdown();
    });

    document.addEventListener("click", (e) => {
        const panel = document.getElementById("notif-dropdown");
        const btn = document.getElementById("sidebar-notifications-btn");
        if (!panel || panel.classList.contains("hidden")) return;
        if (panel.contains(e.target) || btn?.contains(e.target)) return;
        closeNotifDropdown();
    });

    document.getElementById("settings-avatar-pick")?.addEventListener("click", () => {
        document.getElementById("settings-avatar-input")?.click();
    });
    document.getElementById("settings-avatar-input")?.addEventListener("change", () => {
        const inp = document.getElementById("settings-avatar-input");
        const up = document.getElementById("settings-avatar-upload");
        if (up) up.disabled = !inp?.files?.length;
    });
    document.getElementById("settings-avatar-upload")?.addEventListener("click", () => {
        void uploadSettingsAvatar();
    });
    document.getElementById("settings-avatar-camera")?.addEventListener("click", () => {
        void openCameraModal();
    });
    document.getElementById("camera-capture-btn")?.addEventListener("click", captureAvatarFromCamera);
    document.querySelectorAll("[data-camera-close]").forEach((el) => {
        el.addEventListener("click", closeCameraModal);
    });

    document.getElementById("settings-add-team-member")?.addEventListener("click", () => {
        void addSettingsTeamMember();
    });
    document.getElementById("page-settings")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".settings-team-save-btn");
        if (btn) {
            e.preventDefault();
            void saveSettingsTeamRow(btn);
        }
    });
    document.querySelectorAll('input[name="settings-new-team-access"]').forEach((r) => {
        r.addEventListener("change", syncSettingsNewTeamDeptVisibility);
    });
    syncSettingsNewTeamDeptVisibility();
    document.getElementById("settings-team-open-kvkk")?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openKvkkFullDocumentModal();
    });

    document.getElementById("login-form")?.addEventListener("submit", onLoginSubmit);
    document.getElementById("register-form")?.addEventListener("submit", onRegisterSubmit);

    document.getElementById("show-register")?.addEventListener("click", async (e) => {
        e.preventDefault();
        document.getElementById("login-form")?.classList.add("hidden");
        document.getElementById("register-form")?.classList.remove("hidden");
        document.getElementById("show-register")?.classList.add("hidden");
        document.getElementById("show-login")?.classList.remove("hidden");
        const re = document.getElementById("register-error");
        if (re) re.textContent = "";
        await loadKvkkMeta();
    });
    document.getElementById("show-login")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("login-form")?.classList.remove("hidden");
        document.getElementById("register-form")?.classList.add("hidden");
        document.getElementById("show-login")?.classList.add("hidden");
        document.getElementById("show-register")?.classList.remove("hidden");
    });

    const empForm = document.getElementById("employee-cv-form");
    if (empForm) {
        empForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!isEmployee()) return;
            try {
                showLoading();
                const saved = await submitEmployeeCvForm();
                showToast("CV kaydedildi ve analiz edildi.", "success");
                const sid = saved?.id || null;
                resetEmployeeCvForm();
                if (sid) state.editingCvId = sid;
                await loadEmployeeCvPage();
            } catch (err) {
                showToast(err.message || "Hata", "error");
            } finally {
                hideLoading();
            }
        });
    }

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(link.dataset.page);
        });
    });

    document.getElementById("settings-save-profile")?.addEventListener("click", () => {
        void saveSettingsProfile();
    });
    document.getElementById("settings-save-company-profile")?.addEventListener("click", () => {
        void saveSettingsCompanyProfile();
    });
    document.getElementById("settings-save-password")?.addEventListener("click", () => {
        void saveSettingsPassword();
    });

    const uploadArea = document.getElementById("cv-upload-area");
    const fileInput = document.getElementById("cv-file-input");

    if (uploadArea) {
        uploadArea.addEventListener("click", () => fileInput.click());

        uploadArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadArea.classList.add("dragover");
        });

        uploadArea.addEventListener("dragleave", () => {
            uploadArea.classList.remove("dragover");
        });

        uploadArea.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("dragover");
            const file = e.dataTransfer.files[0];
            if (file) handleCVUpload(file);
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) handleCVUpload(file);
        });
    }

    const jobForm = document.getElementById("job-form");
    if (jobForm) {
        jobForm.addEventListener("submit", createJob);
    }

    setupTagInput("required-skills-input", "required-skills", "tag-required");
    setupTagInput("preferred-skills-input", "preferred-skills", "tag-preferred");
    setupTagInput("languages-input", "languages", "tag-lang");
    setupTagInput("emp-skills-input", "emp-skills", "tag-skill");
    setupTagInput("emp-certs-input", "emp-certs", "tag-skill");

    initEmployeeCvFormUI();
    wireDetailModal();

    const matchBtn = document.getElementById("match-btn");
    if (matchBtn) {
        matchBtn.addEventListener("click", runMatch);
    }

    const compareBtn = document.getElementById("compare-btn");
    if (compareBtn) {
        compareBtn.addEventListener("click", runCompare);
    }

    const cvSearch = document.getElementById("cv-search");
    if (cvSearch) {
        cvSearch.addEventListener("input", () => renderCVList());
    }

    const jobSearch = document.getElementById("job-search");
    if (jobSearch) {
        jobSearch.addEventListener("input", () => renderJobList());
    }

    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            const sidebar = document.getElementById("sidebar");
            sidebar.classList.toggle("collapsed");
            document.querySelector("#main-app.app")?.classList.toggle("sidebar-collapsed");
        });
    }

    const restored = await tryRestoreSession();
    if (restored) {
        showAppShell();
        applyRoleUI();
    } else {
        showLoginScreen();
    }

    const validPages = [
        "dashboard",
        "job",
        "match",
        "compare",
        "rag",
        "employee-cv",
        "employee-applications",
        "settings",
        "jobs-browse",
        "job-applicants",
        "messages",
        "admin",
    ];
    const companyPanelPages = ["job", "match", "compare", "rag", "job-applicants"];

    document.getElementById("admin-save-kvkk")?.addEventListener("click", async () => {
        if (!isAdmin()) return;
        try {
            showLoading();
            await api("/api/admin/kvkk", {
                method: "PUT",
                body: JSON.stringify({
                    html: document.getElementById("admin-kvkk-html")?.value || "",
                    version: document.getElementById("admin-kvkk-version")?.value || "1.0",
                }),
            });
            showToast("KVKK metni kaydedildi.", "success");
            await loadKvkkMeta();
        } catch (e) {
            showToast(e.message || "Hata", "error");
        } finally {
            hideLoading();
        }
    });

    document.getElementById("reg-tab-employee")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        document.getElementById("reg-tab-employee")?.classList.add("active");
        document.getElementById("reg-tab-company")?.classList.remove("active");
        document.getElementById("reg-company-name-wrap")?.classList.add("hidden");
        document.getElementById("reg-company-access-wrap")?.classList.add("hidden");
    });
    document.getElementById("reg-tab-company")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        document.getElementById("reg-tab-company")?.classList.add("active");
        document.getElementById("reg-tab-employee")?.classList.remove("active");
        document.getElementById("reg-company-name-wrap")?.classList.remove("hidden");
        document.getElementById("reg-company-access-wrap")?.classList.remove("hidden");
    });

    function syncRegisterCompanyDeptVisibility() {
        const v =
            document.querySelector('input[name="reg-company-access"]:checked')?.value || "hr";
        document.getElementById("reg-company-dept-row")?.classList.toggle("hidden", v !== "department");
    }
    document.querySelectorAll('input[name="reg-company-access"]').forEach((r) => {
        r.addEventListener("change", syncRegisterCompanyDeptVisibility);
    });
    syncRegisterCompanyDeptVisibility();

    document.getElementById("ik-job-server-filter-btn")?.addEventListener("click", () => {
        state.ikJobServerDeptFilter =
            document.getElementById("ik-job-server-dept")?.value?.trim() || "";
        if (state.currentPage === "job") void loadJobs();
    });
    document.getElementById("ik-job-server-filter-clear")?.addEventListener("click", () => {
        state.ikJobServerDeptFilter = "";
        const el = document.getElementById("ik-job-server-dept");
        if (el) el.value = "";
        if (state.currentPage === "job") void loadJobs();
    });

    document.getElementById("admin-load-jobs-btn")?.addEventListener("click", () => {
        void adminLoadJobsPreview();
    });
    document.getElementById("admin-save-managed-companies")?.addEventListener("click", async () => {
        if (!isAdmin()) return;
        const un = document.getElementById("admin-managed-username")?.value?.trim() || "";
        const sel = document.getElementById("admin-managed-companies");
        const chosen = sel ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean) : [];
        if (un.length < 3 || !chosen.length) {
            showToast("İK kullanıcı adı ve en az bir şirket seçin.", "warning");
            return;
        }
        try {
            showLoading();
            await api(`/api/admin/users/${encodeURIComponent(un)}/managed-companies`, {
                method: "PATCH",
                body: JSON.stringify({ company_ids: chosen }),
            });
            showToast("Şirket erişimi güncellendi.", "success");
            await loadAdminPage();
        } catch {
            /* api toast */
        } finally {
            hideLoading();
        }
    });
    document.getElementById("open-kvkk-modal")?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openKvkkFullDocumentModal();
    });
    document.getElementById("close-kvkk-modal")?.addEventListener("click", () => {
        document.getElementById("kvkk-modal")?.classList.add("hidden");
    });

    document.addEventListener("click", (ev) => {
        const t = ev.target.closest("[data-kvkk-info]");
        if (!t) return;
        ev.preventDefault();
        openKvkkConsentExplainerModal();
    });
    document.getElementById("close-kvkk-consent-info-modal")?.addEventListener("click", () => {
        closeKvkkConsentExplainerModal();
    });
    document.getElementById("kvkk-consent-info-dismiss")?.addEventListener("click", () => {
        closeKvkkConsentExplainerModal();
    });
    document.getElementById("kvkk-consent-info-open-full")?.addEventListener("click", async () => {
        closeKvkkConsentExplainerModal();
        await openKvkkFullDocumentModal();
    });
    document.getElementById("kvkk-consent-info-modal")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "kvkk-consent-info-modal") closeKvkkConsentExplainerModal();
    });

    document.getElementById("close-apply-cv-modal")?.addEventListener("click", () => {
        document.getElementById("apply-cv-modal")?.classList.add("hidden");
        state.pendingApplyJobId = null;
    });
    document.getElementById("apply-cv-modal-confirm")?.addEventListener("click", async () => {
        const jobId = state.pendingApplyJobId;
        const cvId = document.getElementById("apply-cv-modal-select")?.value;
        if (!jobId || !cvId) return;
        await submitJobApplication(jobId, cvId);
    });

    document.getElementById("messages-compose-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void sendCurrentMessage();
    });
    document.getElementById("messages-new-chat-select")?.addEventListener("change", async (e) => {
        const sel = e.target;
        const opt = sel.selectedOptions?.[0];
        const val = sel.value;
        if (!val || !opt) return;
        const kind = opt.getAttribute("data-kind");
        const jobId = opt.getAttribute("data-job") || null;
        sel.value = "";
        try {
            if (kind === "company") await openChatWithCompany(val, jobId);
            else await openChatWithApplicant(val, jobId);
        } catch {
            /* toast */
        }
    });

    const hashRaw = window.location.hash.replace("#", "");
    if (hashRaw.startsWith("password-reset")) {
        showLoginScreen();
        const q = hashRaw.includes("?") ? hashRaw.split("?")[1] : "";
        const token = new URLSearchParams(q).get("token");
        if (token) {
            document.getElementById("reset-token").value = token;
            document.getElementById("login-form")?.classList.add("hidden");
            document.getElementById("password-reset-confirm-form")?.classList.remove("hidden");
            document.getElementById("show-register")?.classList.add("hidden");
        } else {
            showPasswordResetForm(true);
        }
    }

    if (restored) {
        let initial = window.location.hash.replace("#", "").split("?")[0];
        if (!validPages.includes(initial)) {
            initial = isAdmin() ? "admin" : isCompany() ? "dashboard" : "jobs-browse";
        }
        if (isAdmin() && companyPanelPages.includes(initial)) {
            initial = "admin";
        }
        if (isEmployee() && (companyPanelPages.includes(initial) || initial === "admin")) {
            initial = "jobs-browse";
        }
        if (isCompany() && initial === "admin") {
            initial = "dashboard";
        }
        if (!isEmployee() && (initial === "employee-cv" || initial === "employee-applications")) {
            initial = isAdmin() ? "admin" : "dashboard";
        }
        if (isAdmin() && initial === "messages") {
            initial = "admin";
        }
        if (!isEmployee() && !isCompany() && initial === "messages") {
            initial = "dashboard";
        }
        navigate(initial);
    }

    window.addEventListener("hashchange", () => {
        const p = window.location.hash.replace("#", "");
        if (!validPages.includes(p) || p === state.currentPage) return;
        navigate(p);
    });

    window.applyToJobPrompt = applyToJobPrompt;
    window.showJobDetail = showJobDetail;
    window.openJobApplicants = openJobApplicants;
    window.openAdminApplicationsSection = openAdminApplicationsSection;
    window.withdrawJobApplication = withdrawJobApplication;
    window.toggleEmployeeJobFavorite = toggleEmployeeJobFavorite;
    window.openJobApplicantsInline = openJobApplicantsInline;
    window.downloadMatchReport = downloadMatchReport;
}

document.addEventListener("DOMContentLoaded", () => {
    initApp().catch((e) => console.error(e));
});
