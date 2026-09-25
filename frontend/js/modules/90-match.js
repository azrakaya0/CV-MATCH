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
        const byCv = await applicantsByCvForJob(jobId);
        renderMatchResult(result, jobId, byCv[cvId]);
        const resultEl = document.getElementById("match-result");
        wireContextMessageButtons(resultEl);
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

function renderMatchResult(result, jobId, applicantUsername) {
    const container = document.getElementById("match-result");
    const scoreColor = getScoreColor(result.scores.overall);
    const dashOffset = 339.3 - (339.3 * result.scores.overall) / 100;

    container.innerHTML = `
        <div class="match-result-actions">
            ${result.cv_id ? `<button type="button" class="btn btn-secondary" onclick="openCvDetailModal('${result.cv_id}')"><i class="fas fa-eye"></i> Aday CV'sini gör</button>` : ""}
            ${result.job_id ? `<button type="button" class="btn btn-secondary" onclick="openJobApplicantsInline('${result.job_id}')"><i class="fas fa-users"></i> İlan başvuruları</button>` : ""}
            ${msgSendToApplicantHtml(applicantUsername, jobId || result.job_id)}
        </div>
        <div class="result-header">
            <div class="score-circle-container">
                <svg class="score-circle" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" class="score-bg-circle"/>
                    <circle cx="60" cy="60" r="54" class="score-fill-circle"
                            style="stroke: ${scoreColor}; stroke-dasharray: 339.3; stroke-dashoffset: ${dashOffset}"/>
                    <text x="60" y="58" class="score-value">${result.scores.overall.toFixed(0)}</text>
                </svg>
                <p class="score-denom">/ 100</p>
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

