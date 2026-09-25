async function loadEmployeeInterviewsPage() {
    if (!isEmployee()) return;
    
    try {
        showLoading();
        await loadEmployeeInterviews();
        hideLoading();
    } catch (error) {
        console.error("Error loading employee interviews:", error);
        showToast("Mülakat verileri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function loadEmployeeInterviews() {
    try {
        const interviews = await api("/api/interviews/my");
        state.employeeInterviews = interviews;
        renderEmployeeInterviews();
    } catch (error) {
        console.error("Error loading employee interviews:", error);
        throw error;
    }
}

function renderEmployeeInterviews() {
    const container = document.getElementById("employee-interviews-list");
    if (!container) return;
    
    if (!state.employeeInterviews || state.employeeInterviews.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar"></i>
                <p>Mülakat kaydı bulunmuyor.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.employeeInterviews.map(interview => `
        <div class="interview-card ${interview.status}" onclick="viewEmployeeInterviewDetails('${interview.id}')">
            <div class="interview-header">
                <div class="interview-type-badge ${interview.interview_type}">
                    ${getInterviewTypeLabel(interview.interview_type)}
                </div>
                <div class="interview-status-badge ${interview.status}">
                    ${getInterviewStatusLabel(interview.status)}
                </div>
                <div class="interview-date">
                    <i class="fas fa-calendar"></i>
                    ${formatInterviewDate(interview.scheduled_date)}
                    <i class="fas fa-clock"></i>
                    ${interview.scheduled_time}
                </div>
            </div>
            <div class="interview-body">
                <h4>Mülakat Detayları</h4>
                <p class="interview-duration">
                    <i class="fas fa-hourglass-half"></i> ${interview.duration_minutes} dakika
                </p>
                ${interview.location ? `
                    <p class="interview-location">
                        <i class="fas fa-map-marker-alt"></i> ${interview.location}
                    </p>
                ` : ""}
                ${interview.meeting_link ? `
                    <p class="interview-link">
                        <i class="fas fa-video"></i> 
                        <a href="${interview.meeting_link}" target="_blank" onclick="event.stopPropagation()">Toplantı linki</a>
                    </p>
                ` : ""}
                <div class="employee-response-status">
                    <span class="response-badge ${interview.employee_response || 'pending'}">
                        ${getEmployeeResponseLabel(interview.employee_response)}
                    </span>
                </div>
            </div>
        </div>
    `).join("");
}

async function viewEmployeeInterviewDetails(interviewId) {
    try {
        showLoading();
        const interview = await api(`/api/interviews/${interviewId}`);
        
        const detailsContainer = document.getElementById("employee-interview-details");
        detailsContainer.innerHTML = `
            <div class="interview-detail-view">
                <div class="detail-section">
                    <h3><i class="fas fa-info-circle"></i> Mülakat Bilgileri</h3>
                    <div class="detail-row">
                        <span class="detail-label">Tür:</span>
                        <span class="detail-value">${getInterviewTypeLabel(interview.interview_type)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Tarih:</span>
                        <span class="detail-value">${formatInterviewDate(interview.scheduled_date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Saat:</span>
                        <span class="detail-value">${interview.scheduled_time}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Süre:</span>
                        <span class="detail-value">${interview.duration_minutes} dakika</span>
                    </div>
                    ${interview.location ? `
                        <div class="detail-row">
                            <span class="detail-label">Konum:</span>
                            <span class="detail-value">${interview.location}</span>
                        </div>
                    ` : ""}
                    ${interview.meeting_link ? `
                        <div class="detail-row">
                            <span class="detail-label">Toplantı Linki:</span>
                            <span class="detail-value">
                                <a href="${interview.meeting_link}" target="_blank" class="btn-link">
                                    <i class="fas fa-video"></i> Katıl
                                </a>
                            </span>
                        </div>
                    ` : ""}
                    ${interview.notes ? `
                        <div class="detail-row">
                            <span class="detail-label">Notlar:</span>
                            <span class="detail-value">${interview.notes}</span>
                        </div>
                    ` : ""}
                </div>
                
                <div class="detail-section">
                    <h3><i class="fas fa-user-clock"></i> Yanıt Durumu</h3>
                    <div class="response-status-display">
                        <span class="status-badge ${interview.employee_response || 'pending'}">
                            ${getEmployeeResponseLabel(interview.employee_response)}
                        </span>
                    </div>
                    
                    ${interview.reschedule_requested && interview.reschedule_status === 'pending' ? `
                        <div class="reschedule-pending-info">
                            <i class="fas fa-clock"></i>
                            <p>Yeniden planlama talebiniz inceleniyor...</p>
                            <p class="text-muted">Önerilen tarih: ${formatInterviewDate(interview.proposed_date)} ${interview.proposed_time}</p>
                        </div>
                    ` : ""}
                    
                    ${interview.reschedule_requested && interview.reschedule_status === 'approved' ? `
                        <div class="reschedule-approved-info">
                            <i class="fas fa-check-circle text-success"></i>
                            <p>Talebiniz onaylandı! Mülakat yeni tarihte yapılacak.</p>
                        </div>
                    ` : ""}
                    
                    ${interview.reschedule_requested && interview.reschedule_status === 'rejected' ? `
                        <div class="reschedule-rejected-info">
                            <i class="fas fa-times-circle text-danger"></i>
                            <p>Talebiniz reddedildi. Orijinal tarih geçerli.</p>
                        </div>
                    ` : ""}
                </div>
                
                ${interview.employee_response === 'pending' ? `
                    <div class="detail-section">
                        <h3><i class="fas fa-check-square"></i> İşlem</h3>
                        <div class="action-buttons">
                            <button class="btn btn-success" onclick="acceptInterview('${interview.id}')">
                                <i class="fas fa-check"></i> Kabul Et
                            </button>
                            <button class="btn btn-danger" onclick="rejectInterview('${interview.id}')">
                                <i class="fas fa-times"></i> Reddet
                            </button>
                            <button class="btn btn-warning" onclick="openRescheduleModal('${interview.id}')">
                                <i class="fas fa-clock"></i> Farklı Zaman Talep Et
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        const modal = document.getElementById("employee-interview-modal");
        modal.classList.remove("hidden");
        modal.classList.add("visible");
        
        hideLoading();
    } catch (error) {
        console.error("Error loading interview details:", error);
        showToast("Mülakat detayları yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function acceptInterview(interviewId) {
    if (!confirm("Bu mülakatı kabul etmek istediğinize emin misiniz?")) return;
    
    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/employee-action`, {
            method: "POST",
            body: JSON.stringify({
                action: "accept"
            })
        });
        
        hideLoading();
        closeEmployeeInterviewModal();
        await loadEmployeeInterviews();
        showToast("Mülakat kabul edildi.", "success");
    } catch (error) {
        console.error("Error accepting interview:", error);
        showToast("Mülakat kabul edilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function rejectInterview(interviewId) {
    if (!confirm("Bu mülakatı reddetmek istediğinize emin misiniz?")) return;
    
    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/employee-action`, {
            method: "POST",
            body: JSON.stringify({
                action: "reject"
            })
        });
        
        hideLoading();
        closeEmployeeInterviewModal();
        await loadEmployeeInterviews();
        showToast("Mülakat reddedildi.", "success");
    } catch (error) {
        console.error("Error rejecting interview:", error);
        showToast("Mülakat reddedilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function openRescheduleModal(interviewId) {
    try {
        showLoading();
        // Refresh interview data to check current state
        const interview = await api(`/api/interviews/${interviewId}`);
        
        if (interview.employee_response !== 'pending') {
            hideLoading();
            showToast("Bu mülakata zaten yanıt verildi.", "warning");
            return;
        }
        
        closeEmployeeInterviewModal();
        document.getElementById("reschedule-interview-id").value = interviewId;
        document.getElementById("reschedule-proposed-date").value = "";
        document.getElementById("reschedule-proposed-time").value = "";
        document.getElementById("reschedule-notes").value = "";
        
        const modal = document.getElementById("reschedule-request-modal");
        modal.classList.remove("hidden");
        modal.classList.add("visible");
        
        hideLoading();
    } catch (error) {
        console.error("Error opening reschedule modal:", error);
        showToast("Mülakat durumu kontrol edilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function submitRescheduleRequest() {
    const interviewId = document.getElementById("reschedule-interview-id").value;
    const proposedDate = document.getElementById("reschedule-proposed-date").value;
    const proposedTime = document.getElementById("reschedule-proposed-time").value;
    const notes = document.getElementById("reschedule-notes").value;
    
    if (!proposedDate || !proposedTime) {
        showToast("Lütfen tarih ve saat seçin.", "warning");
        return;
    }
    
    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/employee-action`, {
            method: "POST",
            body: JSON.stringify({
                action: "request_reschedule",
                proposed_date: proposedDate,
                proposed_time: proposedTime,
                notes: notes || null
            })
        });
        
        hideLoading();
        closeRescheduleModal();
        await loadEmployeeInterviews();
        showToast("Farklı zaman talebi gönderildi.", "success");
    } catch (error) {
        console.error("Error submitting reschedule request:", error);
        showToast("Talep gönderilirken hata oluştu.", "error");
        hideLoading();
    }
}

function closeEmployeeInterviewModal() {
    const modal = document.getElementById("employee-interview-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
    }
}

function closeRescheduleModal() {
    const modal = document.getElementById("reschedule-request-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
    }
}

function getEmployeeResponseLabel(response) {
    const labels = {
        "pending": "Bekliyor",
        "accepted": "Kabul Edildi",
        "rejected": "Reddedildi",
        "reschedule_requested": "Yeniden Planlama Talep Edildi"
    };
    return labels[response] || response;
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

function formatInterviewDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

// Initialize employee interviews page
document.addEventListener("DOMContentLoaded", () => {
    const rescheduleForm = document.getElementById("reschedule-request-form");
    if (rescheduleForm) {
        rescheduleForm.addEventListener("submit", (e) => {
            e.preventDefault();
            submitRescheduleRequest();
        });
    }
});

// Make functions globally accessible
window.loadEmployeeInterviewsPage = loadEmployeeInterviewsPage;
window.viewEmployeeInterviewDetails = viewEmployeeInterviewDetails;
window.acceptInterview = acceptInterview;
window.rejectInterview = rejectInterview;
window.openRescheduleModal = openRescheduleModal;
window.submitRescheduleRequest = submitRescheduleRequest;
window.closeEmployeeInterviewModal = closeEmployeeInterviewModal;
window.closeRescheduleModal = closeRescheduleModal;
