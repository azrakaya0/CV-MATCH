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
    const ca = localStorage.getItem(AUTH_COMPANY_ACCESS_KEY) || "hr";
    return ca === "hr" || ca === "consultant";
}

function isCompanyConsultant() {
    return isCompany() && (localStorage.getItem(AUTH_COMPANY_ACCESS_KEY) || "hr") === "consultant";
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
              : "Çalışan";
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
        footerBell.style.display = isEmployee() || isCompany() ? "" : "none";
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
            ? "Mevcut sohbetler. Başvurduğunuz ilanlardan «Mesaj gönder» ile yeni yazışma başlatın."
            : isCompany()
              ? isCompanyHrScope()
                  ? "Mevcut sohbetler. Yeni yazışma: başvurular, eşleştirme veya karşılaştırma ekranından «Mesaj gönder»."
                  : "Mevcut sohbetler. Yeni yazışma: başvurduğunuz ilanlardan «Mesaj gönder»."
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
    showAuthLoginForm();
    const u = document.getElementById("login-username");
    const p = document.getElementById("login-password");
    if (u) u.value = "";
    if (p) p.value = "";
    const err = document.getElementById("login-error");
    if (err) err.textContent = "";
}

