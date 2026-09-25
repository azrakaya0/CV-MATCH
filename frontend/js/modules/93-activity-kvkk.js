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
    if (state.currentPage === "messages" || state.currentPage === "match") {
        void openCvDetailModal(cvId);
        return;
    }
    navigate("job-applicants");
    setTimeout(() => showCVDetail(cvId), 320);
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

