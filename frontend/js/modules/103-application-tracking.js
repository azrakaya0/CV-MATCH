async function loadApplicationTrackingPage() {
    if (!isEmployee()) return;
    
    try {
        showLoading();
        await loadApplicationSummary();
        await loadMyApplications();
        hideLoading();
    } catch (error) {
        console.error("Error loading application tracking data:", error);
        showToast("Başvuru takip verileri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function loadApplicationSummary() {
    try {
        const summary = await api("/api/tracking/my/summary");
        state.applicationSummary = summary;
        renderApplicationSummary();
    } catch (error) {
        console.error("Error loading application summary:", error);
        throw error;
    }
}

async function loadMyApplications() {
    try {
        const applications = await api("/api/tracking/my/applications");
        state.trackedApplications = applications;
        renderTrackedApplications();
    } catch (error) {
        console.error("Error loading my applications:", error);
        throw error;
    }
}

function renderApplicationSummary() {
    const container = document.getElementById("application-summary");
    if (!container) return;
    
    const summary = state.applicationSummary || {};
    
    container.innerHTML = `
        <div class="summary-cards">
            <div class="summary-card">
                <div class="summary-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.total || 0}</h3>
                    <p>Toplam Başvuru</p>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon pending">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.by_status?.pending || 0}</h3>
                    <p>İncelemede</p>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon interview">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.by_status?.interview_scheduled || 0}</h3>
                    <p>Mülakat Aşamasında</p>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon upcoming">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.upcoming_interviews || 0}</h3>
                    <p>Yaklaşan Mülakat</p>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon offer">
                    <i class="fas fa-handshake"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.by_status?.offer || 0}</h3>
                    <p>Teklif</p>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-icon rejected">
                    <i class="fas fa-times-circle"></i>
                </div>
                <div class="summary-content">
                    <h3>${summary.by_status?.rejected || 0}</h3>
                    <p>Reddedildi</p>
                </div>
            </div>
        </div>
    `;
}

function renderTrackedApplications() {
    const container = document.getElementById("tracked-applications-list");
    if (!container) return;
    
    if (!state.trackedApplications || state.trackedApplications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>Henüz başvurunuz bulunmuyor.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.trackedApplications.map(app => `
        <div class="application-tracking-card">
            <div class="card-header">
                <div class="job-info">
                    <h4>${app.job_title}</h4>
                    <p class="company-name">${app.company_name || "Şirket"}</p>
                </div>
                <div class="stage-badge ${getStageClass(app.current_stage)}">
                    ${getStageLabel(app.current_stage)}
                </div>
            </div>
            <div class="card-body">
                <div class="application-meta">
                    <p>
                        <i class="fas fa-calendar"></i>
                        Başvuru: ${formatDate(app.created_at)}
                    </p>
                    <p>
                        <i class="fas fa-clock"></i>
                        Son güncelleme: ${formatDate(app.updated_at)}
                    </p>
                </div>
                
                ${app.interviews && app.interviews.length > 0 ? `
                    <div class="interviews-preview">
                        <strong>Mülakatlar:</strong>
                        <div class="interview-list">
                            ${app.interviews.slice(0, 3).map(interview => `
                                <div class="interview-item ${interview.status}">
                                    <span class="interview-type">${getInterviewTypeLabel(interview.interview_type)}</span>
                                    <span class="interview-date">${formatInterviewDate(interview.scheduled_date)}</span>
                                    <span class="interview-status">${getInterviewStatusLabel(interview.status)}</span>
                                </div>
                            `).join("")}
                            ${app.interviews.length > 3 ? `
                                <div class="interview-item more">
                                    +${app.interviews.length - 3} daha fazla
                                </div>
                            ` : ""}
                        </div>
                    </div>
                ` : ""}
                
                ${app.status_history && app.status_history.length > 0 ? `
                    <div class="status-history">
                        <strong>Durum Geçmişi:</strong>
                        <div class="history-timeline">
                            ${app.status_history.slice(-3).map(history => `
                                <div class="history-item">
                                    <span class="history-stage">${getStageLabel(history.stage)}</span>
                                    <span class="history-date">${formatDate(history.changed_at)}</span>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                ` : ""}
            </div>
            <div class="card-actions">
                <button class="btn btn-sm btn-primary" onclick="viewApplicationDetails('${app.id}')">
                    <i class="fas fa-eye"></i> Detaylar
                </button>
                <button class="btn btn-sm btn-secondary" onclick="viewJobDetails('${app.job_id}')">
                    <i class="fas fa-briefcase"></i> İlan
                </button>
            </div>
        </div>
    `).join("");
}

async function viewApplicationDetails(applicationId) {
    try {
        showLoading();
        const tracking = await api(`/api/tracking/application/${applicationId}`);
        state.currentApplicationTracking = tracking;
        renderApplicationDetailModal(tracking);
        hideLoading();
    } catch (error) {
        console.error("Error loading application details:", error);
        showToast("Başvuru detayları yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

function renderApplicationDetailModal(tracking) {
    const modal = document.getElementById("application-detail-modal");
    if (!modal) return;
    
    const content = document.getElementById("application-detail-content");
    content.innerHTML = `
        <div class="detail-header">
            <h3>${tracking.job_title}</h3>
            <p class="company">${tracking.company_name || "Şirket"}</p>
        </div>
        
        <div class="detail-section">
            <h4>Durum</h4>
            <div class="current-stage-badge ${getStageClass(tracking.current_stage)}">
                ${getStageLabel(tracking.current_stage)}
            </div>
        </div>
        
        <div class="detail-section">
            <h4>Tarihler</h4>
            <p>Başvuru: ${formatDate(tracking.created_at)}</p>
            <p>Son güncelleme: ${formatDate(tracking.updated_at)}</p>
        </div>
        
        ${tracking.interviews && tracking.interviews.length > 0 ? `
            <div class="detail-section">
                <h4>Mülakatlar</h4>
                <div class="interviews-full-list">
                    ${tracking.interviews.map(interview => `
                        <div class="interview-detail-card ${interview.status}">
                            <div class="interview-header">
                                <span class="interview-type">${getInterviewTypeLabel(interview.interview_type)}</span>
                                <span class="interview-status">${getInterviewStatusLabel(interview.status)}</span>
                            </div>
                            <div class="interview-body">
                                <p>
                                    <i class="fas fa-calendar"></i> ${formatInterviewDate(interview.scheduled_date)}
                                    <i class="fas fa-clock"></i> ${interview.scheduled_time}
                                </p>
                                <p>
                                    <i class="fas fa-hourglass-half"></i> ${interview.duration_minutes} dakika
                                </p>
                                ${interview.location ? `<p><i class="fas fa-map-marker-alt"></i> ${interview.location}</p>` : ""}
                                ${interview.meeting_link ? `
                                    <p>
                                        <i class="fas fa-video"></i> 
                                        <a href="${interview.meeting_link}" target="_blank">Toplantı linki</a>
                                    </p>
                                ` : ""}
                                ${interview.notes ? `<p class="notes"><i class="fas fa-sticky-note"></i> ${interview.notes}</p>` : ""}
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        ` : ""}
        
        ${tracking.status_history && tracking.status_history.length > 0 ? `
            <div class="detail-section">
                <h4>Durum Geçmişi</h4>
                <div class="history-full-timeline">
                    ${tracking.status_history.map(history => `
                        <div class="history-detail-item">
                            <div class="history-stage">${getStageLabel(history.stage)}</div>
                            <div class="history-date">${formatDate(history.changed_at)}</div>
                            ${history.changed_by ? `<div class="history-by">Tarafından: ${history.changed_by}</div>` : ""}
                            ${history.notes ? `<div class="history-notes">${history.notes}</div>` : ""}
                        </div>
                    `).join("")}
                </div>
            </div>
        ` : ""}
    `;
    
    modal.classList.remove("hidden");
    modal.classList.add("visible");
}

function closeApplicationDetailModal() {
    const modal = document.getElementById("application-detail-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
    }
}

function getStageLabel(stage) {
    const labels = {
        "applied": "Başvurdu",
        "screening": "Ön Değerlendirme",
        "technical_interview": "Teknik Mülakat",
        "hr_interview": "İK Mülakatı",
        "offer": "Teklif Yapıldı",
        "rejected": "Reddedildi"
    };
    return labels[stage] || stage;
}

function getStageClass(stage) {
    const classes = {
        "applied": "pending",
        "screening": "screening",
        "technical_interview": "interview",
        "hr_interview": "interview",
        "offer": "offer",
        "rejected": "rejected"
    };
    return classes[stage] || "pending";
}

function getInterviewTypeLabel(type) {
    const labels = {
        "technical": "Teknik",
        "hr": "İK",
        "final": "Final"
    };
    return labels[type] || type;
}

function getInterviewStatusLabel(status) {
    const labels = {
        "scheduled": "Planlandı",
        "completed": "Tamamlandı",
        "cancelled": "İptal",
        "rescheduled": "Yeniden Planlandı"
    };
    return labels[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatInterviewDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function viewJobDetails(jobId) {
    // Navigate to job detail page
    navigate("jobs-browse");
    // Implementation depends on existing job detail viewing mechanism
}

// Initialize application tracking page
document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("close-application-detail-modal");
    if (closeBtn) {
        closeBtn.addEventListener("click", closeApplicationDetailModal);
    }
});
