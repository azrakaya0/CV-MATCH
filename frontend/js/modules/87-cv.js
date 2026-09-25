async function loadCVs() {
    if (!isCompany()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const listEl = document.getElementById("cv-list");
    if (!listEl) return;
    try {
        showLoading();
        const blindMode = state.blindMode || false;
        state.cvs = await api(`/api/cv/list?blind_mode=${blindMode}`);
        renderCVList();
        
        // Sync toggle button state
        const toggle = document.getElementById("blind-mode-toggle");
        if (toggle) {
            toggle.checked = state.blindMode || false;
        }
    } catch (e) {

    } finally {
        hideLoading();
    }
}

function toggleBlindMode() {
    const toggle = document.getElementById("blind-mode-toggle");
    if (toggle) {
        state.blindMode = toggle.checked;
        loadCVs();
    }
}

async function reanalyzeAllCVs() {
    if (!isCompany()) {
        showToast("Bu işlem yalnızca şirket hesabı içindir.", "warning");
        return;
    }
    if (state.cvs.length === 0) {
        showToast("Yeniden analiz edilecek CV yok.", "warning");
        return;
    }
    try {
        showLoading();
        const result = await api("/api/cv/reanalyze-all", { method: "POST" });
        showToast(result.message, "success");
        await loadCVs();
    } catch (e) {
        showToast("Yeniden analiz hatası", "error");
    } finally {
        hideLoading();
    }
}

async function editCV(cvId) {
    if (!isCompany()) return;
    try {
        const cv = await api(`/api/cv/${encodeURIComponent(cvId)}`);
        state.editingCV = cv;
        openCVEditModal(cv);
    } catch (error) {
        console.error("Error loading CV for edit:", error);
        showToast("CV yüklenirken hata oluştu.", "error");
    }
}

function openCVEditModal(cv) {
    const modal = document.getElementById("cv-edit-modal");
    if (!modal) return;
    
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeCVEditModal()"></div>
        <div class="modal-panel card" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>CV Düzenle</h2>
                <button type="button" class="btn btn-ghost btn-sm" onclick="closeCVEditModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <form id="cv-edit-form">
                    <div class="form-group">
                        <label>Ad</label>
                        <input type="text" id="edit-cv-name" class="form-control" value="${cv.data?.name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="edit-cv-email" class="form-control" value="${cv.data?.email || ''}">
                    </div>
                    <div class="form-group">
                        <label>Telefon</label>
                        <input type="text" id="edit-cv-phone" class="form-control" value="${cv.data?.phone || ''}">
                    </div>
                    <div class="form-group">
                        <label>Beceriler (virgülle ayırın)</label>
                        <input type="text" id="edit-cv-skills" class="form-control" value="${(cv.data?.skills || []).join(', ')}">
                    </div>
                    <div class="form-group">
                        <label>Eğitim</label>
                        <textarea id="edit-cv-education" class="form-control" rows="3" placeholder="Derece, Alan, Kurum, Yıl (her satıra bir tane)">${(cv.data?.education || []).map(e => `${e.degree}, ${e.field || ''}, ${e.institution || ''}, ${e.year || ''}`).join('\n')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Deneyim</label>
                        <textarea id="edit-cv-experience" class="form-control" rows="3" placeholder="Unvan, Şirket, Süre, Açıklama (her satıra bir tane)">${(cv.data?.experience || []).map(e => `${e.title}, ${e.company || ''}, ${e.duration || ''}, ${e.description || ''}`).join('\n')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Diller (virgülle ayırın)</label>
                        <input type="text" id="edit-cv-languages" class="form-control" value="${(cv.data?.languages || []).join(', ')}">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeCVEditModal()">İptal</button>
                <button type="button" class="btn btn-primary" onclick="saveCVEdit('${cv.id}')">Kaydet</button>
            </div>
        </div>
    `;
    
    modal.classList.remove("hidden");
    modal.classList.add("visible");
}

function closeCVEditModal() {
    const modal = document.getElementById("cv-edit-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
    }
    state.editingCV = null;
}

async function saveCVEdit(cvId) {
    const name = document.getElementById("edit-cv-name").value;
    const email = document.getElementById("edit-cv-email").value;
    const phone = document.getElementById("edit-cv-phone").value;
    const skills = document.getElementById("edit-cv-skills").value.split(',').map(s => s.trim()).filter(s => s);
    const educationText = document.getElementById("edit-cv-education").value;
    const experienceText = document.getElementById("edit-cv-experience").value;
    const languages = document.getElementById("edit-cv-languages").value.split(',').map(s => s.trim()).filter(s => s);
    
    const education = educationText.split('\n').map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
            degree: parts[0] || '',
            field: parts[1] || '',
            institution: parts[2] || '',
            year: parts[3] || ''
        };
    }).filter(e => e.degree);
    
    const experience = experienceText.split('\n').map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
            title: parts[0] || '',
            company: parts[1] || '',
            duration: parts[2] || '',
            description: parts[3] || ''
        };
    }).filter(e => e.title);
    
    try {
        showLoading();
        await api(`/api/cv/${encodeURIComponent(cvId)}`, {
            method: "PATCH",
            body: JSON.stringify({
                data: {
                    name,
                    email,
                    phone,
                    skills,
                    education,
                    experience,
                    languages
                }
            })
        });
        showToast("CV başarıyla güncellendi.", "success");
        closeCVEditModal();
        await loadCVs();
    } catch (error) {
        console.error("Error saving CV:", error);
        showToast("CV güncellenirken hata oluştu.", "error");
    } finally {
        hideLoading();
    }
}

function renderCVList() {
    const container = document.getElementById("cv-list");
    const searchInput = document.getElementById("cv-search");
    const searchCount = document.getElementById("cv-search-count");
    const query = (searchInput?.value || "").toLowerCase();

    if (state.cvs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>CV yok</p>
            </div>
        `;
        if (searchCount) searchCount.textContent = "";
        return;
    }

    const filtered = query
        ? state.cvs.filter((cv) => {
            const haystack = [
                cv.data.name, cv.data.email, cv.data.phone, cv.filename,
                String(cv.display_id || ""),
                ...cv.data.skills, ...cv.data.languages,
                ...cv.data.education.map(e => `${e.degree} ${e.field || ""} ${e.institution || ""}`),
            ].join(" ").toLowerCase();
            return haystack.includes(query);
        })
        : state.cvs;

    if (searchCount) {
        searchCount.textContent = query ? `${filtered.length} / ${state.cvs.length}` : "";
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>Sonuç yok</p></div>`;
        return;
    }

    container.innerHTML = filtered
        .map(
            (cv) => `
        <div class="card cv-card" onclick="showCVDetail('${cv.id}')">
            <div class="card-header">
                <i class="fas fa-file-pdf"></i>
                <h3>${escapeHtml(cvListLabel(cv))}</h3>
            </div>
            <div class="card-body">
                <div class="cv-info">
                    ${cv.data.email ? `<span><i class="fas fa-envelope"></i> ${cv.data.email}</span>` : ""}
                    ${cv.data.phone ? `<span><i class="fas fa-phone"></i> ${cv.data.phone}</span>` : ""}
                </div>
                <div class="skill-tags">
                    ${cv.data.skills.slice(0, 5).map((s) => `<span class="tag">${s}</span>`).join("")}
                    ${cv.data.skills.length > 5 ? `<span class="tag tag-more">+${cv.data.skills.length - 5}</span>` : ""}
                </div>
            </div>
            <div class="card-footer">
                <span class="text-muted">${formatDate(cv.created_at)}</span>
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); downloadCV('${cv.id}')" title="CV İndir">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); editCV('${cv.id}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteCV('${cv.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `
        )
        .join("");
}


function buildCvDetailModalHtml(cv) {
    const d = cv.data || {};
    const skills = d.skills || [];
    const education = d.education || [];
    const experience = d.experience || [];
    const languages = d.languages || [];
    const cvId = cv.id || cv._id;
    return `
        <div class="cv-detail-modal">
            <div class="detail-section">
                <h3><i class="fas fa-user"></i> Kişisel Bilgiler</h3>
                ${d.name ? `<p><strong>Ad:</strong> ${escapeHtml(d.name)}</p>` : ""}
                ${d.email ? `<p><strong>E-posta:</strong> ${escapeHtml(d.email)}</p>` : ""}
                ${d.phone ? `<p><strong>Telefon:</strong> ${escapeHtml(d.phone)}</p>` : ""}
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-code"></i> Beceriler</h3>
                <div class="skill-tags">
                    ${skills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}
                    ${skills.length === 0 ? '<p class="text-muted">Beceri bulunamadı</p>' : ""}
                </div>
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-graduation-cap"></i> Eğitim</h3>
                ${
                    education.length > 0
                        ? education
                              .map(
                                  (e) => `
                    <div class="info-item">
                        <strong>${escapeHtml(e.degree || "")}</strong>
                        ${e.field ? ` — ${escapeHtml(e.field)}` : ""}
                        ${e.institution ? `<p>${escapeHtml(e.institution)}</p>` : ""}
                        ${e.year ? `<p class="text-muted">${escapeHtml(String(e.year))}</p>` : ""}
                    </div>`
                              )
                              .join("")
                        : '<p class="text-muted">Eğitim bilgisi bulunamadı</p>'
                }
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-briefcase"></i> Deneyim</h3>
                ${
                    experience.length > 0
                        ? experience
                              .map(
                                  (e) => `
                    <div class="info-item">
                        <strong>${escapeHtml(e.title || "")}</strong>
                        ${e.company ? ` — ${escapeHtml(e.company)}` : ""}
                        ${e.duration ? `<p class="text-muted">${escapeHtml(e.duration)}</p>` : ""}
                        ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ""}
                    </div>`
                              )
                              .join("")
                        : '<p class="text-muted">Deneyim bilgisi bulunamadı</p>'
                }
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-language"></i> Diller</h3>
                <div class="skill-tags">
                    ${languages.map((l) => `<span class="tag tag-lang">${escapeHtml(l)}</span>`).join("")}
                    ${languages.length === 0 ? '<p class="text-muted">Dil bilgisi bulunamadı</p>' : ""}
                </div>
            </div>
            <div class="modal-actions-row">
                <button type="button" class="btn btn-secondary btn-sm" id="cv-modal-download-btn" data-cv-id="${escapeHtml(cvId)}">
                    <i class="fas fa-download"></i> İndir
                </button>
            </div>
        </div>`;
}

async function openCvDetailModal(cvId) {
    if (!isCompany()) {
        showToast("CV detayı yalnızca şirket hesabında görüntülenir.", "info");
        return;
    }
    try {
        const cv = await api(`/api/cv/${encodeURIComponent(cvId)}`);
        const label =
            cv.display_id != null
                ? `CV #${cv.display_id}`
                : (cv.data?.name || cv.filename || "CV");
        openDetailModal(label, buildCvDetailModalHtml(cv));
        document.getElementById("cv-modal-download-btn")?.addEventListener("click", () => {
            downloadCV(cvId);
        });
    } catch {
        showToast("CV yüklenemedi.", "error");
    }
}

function showCVDetail(cvId) {
    const cv = state.cvs?.find((c) => c.id === cvId);
    if (!cv) {
        void openCvDetailModal(cvId);
        return;
    }

    const panel = document.getElementById("cv-detail");
    const isCompanyUser = isCompany();
    
    panel.innerHTML = `
        <div class="detail-overlay" onclick="closeCVDetail()"></div>
        <div class="detail-content">
            <div class="detail-header">
                <h2>${escapeHtml(cvListLabel(cv))}</h2>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button class="btn btn-sm btn-secondary" onclick="downloadCV('${cv.id}')" title="Orijinal CV'yi İndir">
                        <i class="fas fa-download"></i> İndir
                    </button>
                    ${isCompanyUser ? `
                    <button class="btn btn-sm btn-primary" onclick="openInterviewModalForCV('${cv.id}')" title="Mülakat Oluştur">
                        <i class="fas fa-calendar-plus"></i> Mülakat Oluştur
                    </button>
                    ` : ""}
                    <button class="btn-close" onclick="closeCVDetail()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="detail-body">
                <div class="detail-section">
                    <h3><i class="fas fa-user"></i> Kişisel Bilgiler</h3>
                    ${cv.data.name ? `<p><strong>Ad:</strong> ${cv.data.name}</p>` : ""}
                    ${cv.data.email ? `<p><strong>Email:</strong> ${cv.data.email}</p>` : ""}
                    ${cv.data.phone ? `<p><strong>Telefon:</strong> ${cv.data.phone}</p>` : ""}
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-code"></i> Beceriler</h3>
                    <div class="skill-tags">
                        ${cv.data.skills.map((s) => `<span class="tag">${s}</span>`).join("")}
                        ${cv.data.skills.length === 0 ? '<p class="text-muted">Beceri bulunamadı</p>' : ""}
                    </div>
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-graduation-cap"></i> Eğitim</h3>
                    ${
                        cv.data.education.length > 0
                            ? cv.data.education
                                  .map(
                                      (e) => `
                        <div class="info-item">
                            <strong>${e.degree}</strong>
                            ${e.field ? ` - ${e.field}` : ""}
                            ${e.institution ? `<p>${e.institution}</p>` : ""}
                            ${e.year ? `<p class="text-muted">${e.year}</p>` : ""}
                        </div>
                    `
                                  )
                                  .join("")
                            : '<p class="text-muted">Eğitim bilgisi bulunamadı</p>'
                    }
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-briefcase"></i> Deneyim</h3>
                    ${
                        cv.data.experience.length > 0
                            ? cv.data.experience
                                  .map(
                                      (e) => `
                        <div class="info-item">
                            <strong>${e.title}</strong>
                            ${e.company ? ` - ${e.company}` : ""}
                            ${e.duration ? `<p class="text-muted">${e.duration}</p>` : ""}
                            ${e.description ? `<p>${e.description}</p>` : ""}
                        </div>
                    `
                                  )
                                  .join("")
                            : '<p class="text-muted">Deneyim bilgisi bulunamadı</p>'
                    }
                </div>

                <div class="detail-section">
                    <h3><i class="fas fa-language"></i> Diller</h3>
                    <div class="skill-tags">
                        ${cv.data.languages.map((l) => `<span class="tag tag-lang">${l}</span>`).join("")}
                        ${cv.data.languages.length === 0 ? '<p class="text-muted">Dil bilgisi bulunamadı</p>' : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
    panel.classList.remove("hidden");
    panel.classList.add("visible");
    document.querySelector("#main-app.app")?.classList.add("detail-open");
}

function closeCVDetail() {
    const panel = document.getElementById("cv-detail");
    panel.classList.remove("visible");
    panel.classList.add("hidden");
    document.querySelector("#main-app.app")?.classList.remove("detail-open");
}

function openInterviewModalForCV(cvId) {
    const modal = document.getElementById("interview-modal");
    if (!modal) return;
    
    // Clear form
    document.getElementById("interview-job-select").value = "";
    document.getElementById("interview-applicant-select").innerHTML = '<option value="">-- Başvuran Seçin --</option>';
    document.getElementById("interview-applicant-group").style.display = "none";
    document.getElementById("interview-date").value = "";
    document.getElementById("interview-time").value = "";
    document.getElementById("interview-type").value = "screening";
    document.getElementById("interview-duration").value = "60";
    document.getElementById("interview-location").value = "";
    document.getElementById("interview-meeting-link").value = "";
    document.getElementById("interview-notes").value = "";
    
    // Store CV ID for later use
    state.interviewCvId = cvId;
    
    // Load jobs and auto-select the job this CV applied to
    loadJobsIntoInterviewModalForCV(cvId);
    
    modal.classList.remove("hidden");
    modal.classList.add("visible");
    
    showToast("Lütfen tarih ve saat seçin.", "info");
}

async function loadJobsIntoInterviewModalForCV(cvId) {
    const select = document.getElementById("interview-job-select");
    if (!select) return;
    
    try {
        const jobs = await api(buildJobListUrl());
        select.innerHTML = '<option value="">-- İlan Seçin --</option>';
        jobs.forEach(job => {
            const option = document.createElement("option");
            option.value = job.id;
            option.textContent = job.title;
            select.appendChild(option);
        });
        
        // Find applications for this CV and auto-select the job
        const applications = await api(`/api/applications/cv/${cvId}`);
        if (applications && applications.length > 0) {
            const firstApp = applications[0];
            select.value = firstApp.job_id;
            // Load applicants for this job
            handleJobSelectionChange();
            // Auto-select this applicant
            setTimeout(() => {
                const applicantSelect = document.getElementById("interview-applicant-select");
                if (applicantSelect) {
                    applicantSelect.value = firstApp.id;
                }
            }, 100);
        }
        
        // Add change listener to load applicants when job is selected
        select.removeEventListener("change", handleJobSelectionChange);
        select.addEventListener("change", handleJobSelectionChange);
    } catch (error) {
        console.error("Error loading jobs:", error);
        showToast("İlanlar yüklenirken hata oluştu.", "error");
    }
}

async function downloadCV(cvId) {
    try {
        const response = await fetch(`/api/cv/${cvId}/download`, { headers: authHeaders() });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showToast(err.detail || "İndirme başarısız", "error");
            return;
        }
        const blob = await response.blob();
        const cd = response.headers.get("Content-Disposition");
        let fname = "cv.pdf";
        if (cd && cd.includes("filename=")) {
            fname = cd.split("filename=")[1].replace(/"/g, "").trim();
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        showToast("İndirme hatası", "error");
    }
}

async function downloadMatchReport(matchId) {
    if (!matchId) return;
    try {
        const response = await fetch(`/api/match/report/${matchId}`, { headers: authHeaders() });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showToast(err.detail || "Rapor indirilemedi", "error");
            return;
        }
        const blob = await response.blob();
        const ct = response.headers.get("Content-Type") || "";
        if (!ct.includes("pdf")) {
            showToast("Sunucu PDF döndürmedi; oturumu kontrol edin.", "error");
            return;
        }
        const cd = response.headers.get("Content-Disposition");
        let fname = `CVMatch_Rapor_${matchId.slice(0, 8)}.pdf`;
        if (cd) {
            const mStar = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
            if (mStar) {
                try {
                    fname = decodeURIComponent(mStar[1].trim());
                } catch {
                    /* keep default */
                }
            } else if (cd.includes("filename=")) {
                fname = cd.split("filename=")[1].replace(/"/g, "").trim();
            }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fname;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("Rapor indirildi.", "success");
    } catch (e) {
        showToast("Rapor indirme hatası", "error");
    }
}

async function deleteCV(cvId) {
    if (!confirm("Bu CV'yi silmek istediğinize emin misiniz?")) return;

    try {
        await api(`/api/cv/${cvId}`, { method: "DELETE" });
        showToast("CV silindi", "success");
        loadCVs();
    } catch (e) {

    }
}

async function handleCVUpload(file) {
    if (!isCompany()) {
        showToast("PDF yükleme yalnızca şirket hesabıyla kullanılabilir.", "warning");
        return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Sadece PDF dosyaları kabul edilmektedir", "error");
        return;
    }
    const kvkk = document.getElementById("cv-kvkk-consent");
    if (!kvkk || !kvkk.checked) {
        showToast("CV yüklemek için KVKK onayı vermeniz gerekir.", "warning");
        return;
    }

    try {
        showLoading();
        await apiUploadManagerCv("/api/cv/upload", file, true);
        showToast("CV başarıyla yüklendi ve analiz edildi!", "success");
        if (kvkk) kvkk.checked = false;
        loadCVs();
    } catch (e) {
        showToast(e.message || "Yükleme hatası", "error");
    } finally {
        hideLoading();
    }
}

