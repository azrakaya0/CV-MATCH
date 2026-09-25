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
    if (cvIds.length < 2) {
        showToast("Karşılaştırma için en az 2 CV seçin", "warning");
        return;
    }

    try {
        showLoading();
        const results = await api("/api/match/compare", {
            method: "POST",
            body: JSON.stringify({ cv_ids: cvIds, job_id: jobId }),
        });
        const byCv = await applicantsByCvForJob(jobId);
        renderCompareResults(results, jobId, byCv);
        const compareResultEl = document.getElementById("compare-result");
        wireContextMessageButtons(compareResultEl);
        compareResultEl.classList.remove("hidden");
        setTimeout(() => compareResultEl.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function renderCompareResults(results, jobId, applicantsByCv) {
    const container = document.getElementById("compare-result");
    const byCv = applicantsByCv || {};

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
                        <div class="ranking-actions">
                            ${r.cv_id ? `<button type="button" class="btn btn-sm btn-secondary ranking-cv-btn" onclick="goToCvDetail('${r.cv_id}')" title="CV detayı"><i class="fas fa-eye"></i></button>` : ""}
                            ${msgSendToApplicantHtml(byCv[r.cv_id], jobId, "btn btn-sm btn-secondary")}
                        </div>
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

function cleanLanguageName(name) {
    // Remove any "x" prefix that might appear (e.g., "xTurkish" -> "Turkish")
    if (name && name.startsWith('x')) {
        return name.substring(1);
    }
    return name || '';
}

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
                    grid: { color: "rgba(148, 163, 184, 0.1)" },
                    angleLines: { color: "rgba(148, 163, 184, 0.1)" },
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

