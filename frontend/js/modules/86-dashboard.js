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
                    ticks: { color: "#e2e8f0", stepSize: 1 },
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

