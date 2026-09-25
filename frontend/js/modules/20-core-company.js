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
    const label = wrap?.querySelector(".sidebar-company-switch-label");
    if (!wrap || !sel) return;
    const list = getManagedCompaniesFromStorage();
    const show = isCompany() && isCompanyHrScope() && list.length >= 1;
    wrap.classList.toggle("hidden", !show);
    if (!show) return;
    const cur = getActiveCompanyId() || list[0].id;
    const multi = list.length > 1;
    if (label) label.textContent = multi ? "Aktif şirket" : "Sorumlu şirket";
    sel.innerHTML = list
        .map((c) => {
            const lbl = c.name ? `${c.name}` : c.id;
            return `<option value="${escapeHtml(c.id)}">${escapeHtml(lbl)}</option>`;
        })
        .join("");
    sel.value = cur;
    sel.disabled = !multi;
    sel.title = multi ? "Yönettiğiniz şirketler arasında geçiş yapın" : "";
    if (multi && !sel.dataset.wired) {
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

