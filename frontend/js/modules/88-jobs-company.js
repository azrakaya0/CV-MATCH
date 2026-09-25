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
        const deptHint = document.getElementById("job-dept-scope-hint");
        if (deptHint) {
            if (isCompany() && !isCompanyHrScope()) {
                const d = localStorage.getItem(AUTH_DEPARTMENT_LABEL_KEY) || "";
                deptHint.textContent = d
                    ? `Bu listede yalnızca «${d}» departmanına ait ilanlar gösterilir.`
                    : "Bu listede yalnızca departmanınıza ait ilanlar gösterilir.";
                deptHint.classList.remove("hidden");
            } else {
                deptHint.textContent = "";
                deptHint.classList.add("hidden");
            }
        }
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

    if (isCompanyHrScope()) {
        renderJobDeptPills();
    } else {
        const wrap = document.getElementById("job-dept-filter-wrap");
        if (wrap) wrap.style.display = "none";
        state.jobDeptFilter = "";
    }

    let byDept = state.jobs;
    if (isCompanyHrScope() && state.jobDeptFilter) {
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
    wireContextMessageButtons(container);
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
                        ? msgSendToCompanyHtml(a.company_id, a.job_id)
                        : ""
                }
                <button type="button" class="btn btn-sm btn-ghost app-withdraw-btn" data-app-id="${escapeHtml(a.id)}">Geri çek</button>
            </td>
        </tr>`
        )
        .join("")}</tbody></table></div>`;
}

