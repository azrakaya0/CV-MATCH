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
    state.applicantsJobId = null;
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
            body.innerHTML = `<div class="applicants-empty-pick">
                <i class="fas fa-hand-pointer"></i>
                <p><strong>İlan seçin</strong></p>
                <p class="text-muted">Soldaki listeden bir ilana tıklayın; başvurular burada açılır.</p>
            </div>`;
            return;
        }

        if (head) {
            head.classList.remove("hidden");
            const depLabel = (job.department || "").trim()
                ? escapeHtml(job.department)
                : "Departman atanmamış";
            const ac = job.application_count != null ? Number(job.application_count) : "—";
            const workplaceType = job.workplace_type ? escapeHtml(job.workplace_type) : "";
            const expType = job.experience_type ? escapeHtml(job.experience_type) : "";
            head.innerHTML = `
                <div class="applicants-active-head-inner">
                    <div>
                        <span class="applicants-active-dept">${depLabel}</span>
                        <h2 class="applicants-active-title">${escapeHtml(job.title)}</h2>
                        <p class="applicants-active-meta">
                            ${job.location ? `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}` : ""}
                            ${workplaceType ? `<span class="applicants-active-meta-sep">·</span><i class="fas fa-building"></i> ${workplaceType}` : ""}
                            ${expType ? `<span class="applicants-active-meta-sep">·</span><i class="fas fa-briefcase"></i> ${expType}` : ""}
                        </p>
                        ${job.description ? `<p class="applicants-active-desc text-muted" style="margin-top:0.5rem;max-height:100px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${escapeHtml(job.description)}</p>` : ""}
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
                                ? msgSendToApplicantHtml(r.applicant_username, jobId)
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
            wireContextMessageButtons(body);
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
                        return `<details class="dept-accordion dept-accordion--nested">
                            <summary class="dept-accordion-summary">
                                <span class="dept-accordion-title"><i class="fas fa-folder"></i> ${label}</span>
                                <span class="dept-accordion-meta">${jlist.length} ilan · ${totalApps} başvuru</span>
                            </summary>
                            <div class="dept-accordion-body">${jlist.map(jobRow).join("")}</div>
                        </details>`;
                    })
                    .join("");
                return `<details class="dept-accordion dept-accordion--company">
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

