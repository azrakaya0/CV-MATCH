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
        document.getElementById("job-form-details")?.removeAttribute("open");
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

async function openEmployeeJobDetailModal(job) {
    const req = job.requirements || { required_skills: [], preferred_skills: [] };
    const reqSkills = [...(req.required_skills || []), ...(req.preferred_skills || [])];
    const applied = (state.employeeApplications || []).some((a) => a.job_id === job.id);
    const companyId = job.company_id || null;
    
    // Fetch applicant insights
    let insightsHtml = "";
    try {
        const mycvs = await api("/api/cv/list").catch(() => []);
        if (mycvs.length > 0) {
            const insights = await api(`/api/job/${job.id}/applicant-insights?cv_id=${mycvs[0].id}`);
            insightsHtml = `
                <div class="applicant-insights-card" style="margin-top:1rem;padding:1rem;background:var(--card-bg);border-radius:0.5rem;border:1px solid var(--border-color)">
                    <h4 style="margin:0 0 0.5rem;font-size:0.95rem"><i class="fas fa-chart-line"></i> Aday Yoğunluk ve Rekabet Analizi</h4>
                    <p style="margin:0;font-size:0.9rem;color:var(--text-muted)">${escapeHtml(insights.message)}</p>
                </div>
            `;
        }
    } catch (e) {
        // Silently fail if insights can't be fetched
    }
    
    openDetailModal(
        job.title || "İlan",
        `${jobDetailCompanyBlock(job)}
        ${job.department ? `<p><strong>Departman:</strong> ${escapeHtml(job.department)}</p>` : ""}
        ${job.location ? `<p><strong>Lokasyon:</strong> ${escapeHtml(job.location)}</p>` : ""}
        ${workplaceTypeLabel(job.workplace_type) ? `<p><strong>Çalışma:</strong> ${workplaceTypeLabel(job.workplace_type)}</p>` : ""}
        <p style="white-space:pre-line;margin-top:0.75rem">${escapeHtml(job.description || "")}</p>
        ${reqSkills.length ? `<p style="margin-top:0.75rem"><strong>Beceriler:</strong> ${reqSkills.slice(0, 12).map((s) => escapeHtml(s)).join(", ")}</p>` : ""}
        ${insightsHtml}
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

