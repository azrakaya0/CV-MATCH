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
        // Add semantic equivalents for Turkish search
        "developer", "yazılımcı", "software engineer", "yazılım mühendisi",
        "frontend", "backend", "fullstack", "full-stack",
        "bilgisayar mühendisi", "computer engineer",
        "mobil", "mobile", "web", "devops", "data", "veri"
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
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openJobApplicants('${job.id}')" title="Başvurular">
                        <i class="fas fa-users"></i>
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
        const appByJob = Object.fromEntries(my.map((a) => [a.job_id, a]));

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
                        ${appByJob[j.id]?.company_id ? msgSendToCompanyHtml(appByJob[j.id].company_id, j.id, "btn btn-sm btn-secondary") : ""}
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
        wireContextMessageButtons(list);
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

