async function loadInterviewSchedulerPage() {
    if (!isCompany()) return;

    try {
        showLoading();
        await loadRescheduleRequests();
        await loadUpcomingInterviews();
        await loadInterviewsList();
        hideLoading();
    } catch (error) {
        console.error("Error loading interview data:", error);
        showToast("Mülakat verileri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

function openCreateInterviewModal() {
    const modal = document.getElementById("interview-modal");
    if (!modal) return;
    
    // Clear form
    document.getElementById("interview-job-select").value = "";
    document.getElementById("interview-applicant-select").innerHTML = '<option value="">-- Başvuran Seçin --</option>';
    document.getElementById("interview-applicant-group").style.display = "none";
    document.getElementById("interview-date").value = "";
    document.getElementById("interview-time").value = "";
    document.getElementById("interview-type").value = "technical";
    document.getElementById("interview-duration").value = "60";
    document.getElementById("interview-location").value = "";
    document.getElementById("interview-meeting-link").value = "";
    document.getElementById("interview-notes").value = "";
    
    // Load jobs into select
    loadJobsIntoInterviewModal();
    
    modal.classList.remove("hidden");
    modal.classList.add("visible");
}

async function loadJobsIntoInterviewModal() {
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
        
        // Add change listener to load applicants when job is selected
        select.addEventListener("change", handleJobSelectionChange);
    } catch (error) {
        console.error("Error loading jobs:", error);
        showToast("İlanlar yüklenirken hata oluştu.", "error");
    }
}

async function handleJobSelectionChange() {
    const jobId = document.getElementById("interview-job-select").value;
    const applicantGroup = document.getElementById("interview-applicant-group");
    const applicantSelect = document.getElementById("interview-applicant-select");

    if (!jobId) {
        applicantGroup.style.display = "none";
        applicantSelect.innerHTML = '<option value="">-- Başvuran Seçin --</option>';
        return;
    }

    try {
        const applicants = await api(`/api/applications/job/${jobId}`);
        applicantGroup.style.display = "block";
        applicantSelect.innerHTML = '<option value="">-- Başvuran Seçin --</option>';

        applicants.forEach(app => {
            const option = document.createElement("option");
            option.value = app.id;
            option.textContent = `${app.applicant_username || 'Aday'} - ${app.cv_display_id || app.cv_id}`;
            applicantSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading applicants:", error);
        showToast("Başvurular yüklenirken hata oluştu.", "error");
    }
}

async function loadRescheduleRequests() {
    try {
        const interviews = await api("/api/interviews/company/list");
        state.rescheduleRequests = interviews.filter(i => i.reschedule_requested && i.reschedule_status === "pending");
        renderRescheduleRequests();
    } catch (error) {
        console.error("Error loading reschedule requests:", error);
        throw error;
    }
}

function renderRescheduleRequests() {
    const container = document.getElementById("reschedule-requests-list");
    if (!container) return;

    if (!state.rescheduleRequests || state.rescheduleRequests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle"></i>
                <p>Bekleyen yeniden planlama talebi yok.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.rescheduleRequests.map(interview => `
        <div class="interview-card reschedule-request">
            <div class="interview-header">
                <div class="interview-type-badge ${interview.interview_type}">
                    ${getInterviewTypeLabel(interview.interview_type)}
                </div>
                <div class="interview-status-badge pending">
                    <i class="fas fa-clock"></i> Yeniden Planlama Talebi
                </div>
            </div>
            <div class="interview-body">
                <h4>${interview.applicant_username}</h4>
                <div class="reschedule-details">
                    <p class="text-muted">
                        <i class="fas fa-calendar-times"></i> Orijinal Tarih: ${formatInterviewDate(interview.scheduled_date)} ${interview.scheduled_time}
                    </p>
                    <p class="text-success">
                        <i class="fas fa-calendar-check"></i> Önerilen Tarih: ${formatInterviewDate(interview.proposed_date)} ${interview.proposed_time}
                    </p>
                    ${interview.reschedule_request_notes ? `
                        <p class="text-muted">
                            <i class="fas fa-sticky-note"></i> Not: ${interview.reschedule_request_notes}
                        </p>
                    ` : ""}
                </div>
            </div>
            <div class="interview-actions">
                <button class="btn btn-sm btn-success" onclick="approveReschedule('${interview.id}')">
                    <i class="fas fa-check"></i> Onayla
                </button>
                <button class="btn btn-sm btn-danger" onclick="rejectReschedule('${interview.id}')">
                    <i class="fas fa-times"></i> Reddet
                </button>
            </div>
        </div>
    `).join("");
}

async function approveReschedule(interviewId) {
    if (!confirm("Bu yeniden planlama talebini onaylamak istediğinize emin misiniz?")) return;

    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/reschedule-decision`, {
            method: "POST",
            body: JSON.stringify({
                decision: "approve"
            })
        });

        hideLoading();
        await loadInterviewSchedulerPage();
        showToast("Yeniden planlama talebi onaylandı.", "success");
    } catch (error) {
        console.error("Error approving reschedule:", error);
        showToast("Talep onaylanırken hata oluştu.", "error");
        hideLoading();
    }
}

async function rejectReschedule(interviewId) {
    if (!confirm("Bu yeniden planlama talebini reddetmek istediğinize emin misiniz?")) return;

    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/reschedule-decision`, {
            method: "POST",
            body: JSON.stringify({
                decision: "reject"
            })
        });

        hideLoading();
        await loadInterviewSchedulerPage();
        showToast("Yeniden planlama talebi reddedildi.", "success");
    } catch (error) {
        console.error("Error rejecting reschedule:", error);
        showToast("Talep reddedilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function loadUpcomingInterviews() {
    try {
        const interviews = await api("/api/interviews/company/upcoming");
        state.upcomingInterviews = interviews;
        renderUpcomingInterviews();
    } catch (error) {
        console.error("Error loading upcoming interviews:", error);
        throw error;
    }
}

async function loadInterviewsList() {
    try {
        const interviews = await api("/api/interviews/company/list");
        state.allInterviews = interviews;
        renderInterviewsList();
    } catch (error) {
        console.error("Error loading interviews list:", error);
        throw error;
    }
}

function renderUpcomingInterviews() {
    const container = document.getElementById("upcoming-interviews-list");
    if (!container) return;
    
    if (!state.upcomingInterviews || state.upcomingInterviews.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-check"></i>
                <p>Yaklaşan mülakat bulunmuyor.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.upcomingInterviews.map(interview => `
        <div class="interview-card upcoming">
            <div class="interview-header">
                <div class="interview-type-badge ${interview.interview_type}">
                    ${getInterviewTypeLabel(interview.interview_type)}
                </div>
                <div class="interview-date">
                    <i class="fas fa-calendar"></i>
                    ${formatInterviewDate(interview.scheduled_date)}
                    <i class="fas fa-clock"></i>
                    ${interview.scheduled_time}
                </div>
            </div>
            <div class="interview-body">
                <h4>${interview.applicant_username}</h4>
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
                        <a href="${interview.meeting_link}" target="_blank">Toplantı linki</a>
                    </p>
                ` : ""}
            </div>
            <div class="interview-actions">
                <button class="btn btn-sm btn-primary" onclick="editInterview('${interview.id}')">
                    <i class="fas fa-edit"></i> Düzenle
                </button>
                <button class="btn btn-sm btn-secondary" onclick="getCalendarInvite('${interview.id}')">
                    <i class="fas fa-calendar-plus"></i> Takvim
                </button>
                <button class="btn btn-sm btn-danger" onclick="cancelInterview('${interview.id}')">
                    <i class="fas fa-times"></i> İptal
                </button>
            </div>
        </div>
    `).join("");
}

function renderInterviewsList() {
    const container = document.getElementById("all-interviews-list");
    if (!container) return;

    if (!state.allInterviews || state.allInterviews.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar"></i>
                <p>Mülakat kaydı bulunmuyor.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.allInterviews.map(interview => `
        <div class="interview-card ${interview.status}">
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
                <h4>${interview.applicant_username}</h4>
                <p class="interview-duration">
                    <i class="fas fa-hourglass-half"></i> ${interview.duration_minutes} dakika
                </p>
                ${interview.notes ? `
                    <p class="interview-notes">
                        <i class="fas fa-sticky-note"></i> ${interview.notes}
                    </p>
                ` : ""}
                <div class="employee-response-status">
                    <span class="response-badge ${interview.employee_response || 'pending'}">
                        ${getEmployeeResponseLabel(interview.employee_response)}
                    </span>
                </div>
            </div>
            <div class="interview-actions">
                <button class="btn btn-sm btn-primary" onclick="editInterview('${interview.id}')">
                    <i class="fas fa-edit"></i> Düzenle
                </button>
                ${interview.status === "scheduled" ? `
                    <button class="btn btn-sm btn-danger" onclick="cancelInterview('${interview.id}')">
                        <i class="fas fa-times"></i> İptal
                    </button>
                ` : ""}
                <button class="btn btn-sm btn-secondary" onclick="deleteInterview('${interview.id}')">
                    <i class="fas fa-trash"></i> Sil
                </button>
            </div>
        </div>
    `).join("");
}

async function createInterview() {
    const applicationId = document.getElementById("interview-applicant-select").value;
    const scheduledDate = document.getElementById("interview-date").value;
    const scheduledTime = document.getElementById("interview-time").value;
    const duration = document.getElementById("interview-duration").value;
    const interviewType = document.getElementById("interview-type").value;
    const location = document.getElementById("interview-location").value;
    const meetingLink = document.getElementById("interview-meeting-link").value;
    const notes = document.getElementById("interview-notes").value;
    
    if (!applicationId || !scheduledDate || !scheduledTime) {
        showToast("Lütfen gerekli alanları doldurun.", "warning");
        return;
    }
    
    try {
        showLoading();
        await api("/api/interviews/", {
            method: "POST",
            body: JSON.stringify({
                application_id: applicationId,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                duration_minutes: parseInt(duration),
                interview_type: interviewType,
                location: location || null,
                meeting_link: meetingLink || null,
                notes: notes || null
            })
        });

        hideLoading();
        closeInterviewModal();
        await loadInterviewSchedulerPage();
        showToast("Mülakat başarıyla oluşturuldu.", "success");
    } catch (error) {
        console.error("Error creating interview:", error);
        const errorMsg = error.message || error.detail || "Mülakat oluşturulurken hata oluştu.";
        showToast(errorMsg, "error");
        hideLoading();
    }
}

async function editInterview(interviewId) {
    try {
        showLoading();
        const interview = await api(`/api/interviews/${interviewId}`);
        
        // Populate form
        document.getElementById("edit-interview-id").value = interview.id;
        document.getElementById("edit-interview-date").value = interview.scheduled_date;
        document.getElementById("edit-interview-time").value = interview.scheduled_time;
        document.getElementById("edit-interview-duration").value = interview.duration_minutes;
        document.getElementById("edit-interview-type").value = interview.interview_type;
        document.getElementById("edit-interview-location").value = interview.location || "";
        document.getElementById("edit-interview-meeting-link").value = interview.meeting_link || "";
        document.getElementById("edit-interview-notes").value = interview.notes || "";
        document.getElementById("edit-interview-status").value = interview.status;
        
        const modal = document.getElementById("edit-interview-modal");
        modal.classList.remove("hidden");
        modal.classList.add("visible");
        
        hideLoading();
    } catch (error) {
        console.error("Error loading interview details:", error);
        showToast("Mülakat detayları yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function updateInterview() {
    const interviewId = document.getElementById("edit-interview-id").value;
    const scheduledDate = document.getElementById("edit-interview-date").value;
    const scheduledTime = document.getElementById("edit-interview-time").value;
    const duration = document.getElementById("edit-interview-duration").value;
    const interviewType = document.getElementById("edit-interview-type").value;
    const location = document.getElementById("edit-interview-location").value;
    const meetingLink = document.getElementById("edit-interview-meeting-link").value;
    const notes = document.getElementById("edit-interview-notes").value;
    const status = document.getElementById("edit-interview-status").value;
    
    const updateData = {
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration_minutes: parseInt(duration),
        interview_type: interviewType,
        location: location || null,
        meeting_link: meetingLink || null,
        notes: notes || null
    };
    
    // Only include status if it's a valid value
    if (status && ["scheduled", "completed", "cancelled", "rescheduled"].includes(status)) {
        updateData.status = status;
    }
    
    try {
        showLoading();
        await api(`/api/interviews/${interviewId}`, {
            method: "PATCH",
            body: JSON.stringify(updateData)
        });
        
        hideLoading();
        closeEditInterviewModal();
        await loadInterviewSchedulerPage();
        showToast("Mülakat başarıyla güncellendi.", "success");
    } catch (error) {
        console.error("Error updating interview:", error);
        showToast("Mülakat güncellenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function cancelInterview(interviewId) {
    console.log("Canceling interview with ID:", interviewId);
    if (!confirm("Bu mülakatı iptal etmek istediğinize emin misiniz?")) return;

    try {
        showLoading();
        await api(`/api/interviews/${interviewId}/cancel`, {
            method: "POST"
        });

        hideLoading();
        await loadInterviewSchedulerPage();
        showToast("Mülakat iptal edildi.", "success");
    } catch (error) {
        console.error("Error cancelling interview:", error);
        showToast("Mülakat iptal edilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function deleteInterview(interviewId) {
    console.log("Deleting interview with ID:", interviewId);
    if (!confirm("Bu mülakatı tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;

    try {
        showLoading();
        await api(`/api/interviews/${interviewId}`, {
            method: "DELETE"
        });

        hideLoading();
        await loadInterviewSchedulerPage();
        showToast("Mülakat silindi.", "success");
    } catch (error) {
        console.error("Error deleting interview:", error);
        showToast("Mülakat silinirken hata oluştu.", "error");
        hideLoading();
    }
}

async function getCalendarInvite(interviewId) {
    try {
        showLoading();
        const calendarData = await api(`/api/interviews/${interviewId}/calendar`);
        
        // Create Google Calendar link
        const startDate = calendarData.start.replace(/[-:]/g, "").replace("T", "T").slice(0, -1) + "00Z";
        const endDate = new Date(new Date(calendarData.start).getTime() + calendarData.duration * 60000)
            .toISOString().replace(/[-:]/g, "").replace("T", "T").slice(0, -1) + "00Z";
        
        const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarData.title)}&dates=${startDate}/${endDate}&details=${encodeURIComponent(calendarData.description)}&location=${encodeURIComponent(calendarData.location)}`;
        
        window.open(googleCalendarUrl, "_blank");
        hideLoading();
    } catch (error) {
        console.error("Error generating calendar invite:", error);
        showToast("Takvim davetiyesi oluşturulurken hata oluştu.", "error");
        hideLoading();
    }
}

function closeInterviewModal() {
    const modal = document.getElementById("interview-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
        document.getElementById("interview-job-select").value = "";
        document.getElementById("interview-applicant-select").innerHTML = '<option value="">-- Başvuran Seçin --</option>';
        document.getElementById("interview-applicant-group").style.display = "none";
        document.getElementById("interview-date").value = "";
        document.getElementById("interview-time").value = "";
        document.getElementById("interview-type").value = "technical";
        document.getElementById("interview-duration").value = "60";
        document.getElementById("interview-location").value = "";
        document.getElementById("interview-meeting-link").value = "";
        document.getElementById("interview-notes").value = "";
    }
}

// Make closeInterviewModal global
window.closeInterviewModal = closeInterviewModal;

function closeEditInterviewModal() {
    const modal = document.getElementById("edit-interview-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("visible");
    }
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

function getEmployeeResponseLabel(response) {
    const labels = {
        "pending": "Bekliyor",
        "accepted": "Kabul Edildi",
        "rejected": "Reddedildi",
        "reschedule_requested": "Yeniden Planlama Talep Edildi"
    };
    return labels[response] || response;
}

// Initialize interview scheduler page
document.addEventListener("DOMContentLoaded", () => {
    const closeEditBtn = document.getElementById("close-edit-interview-modal");
    if (closeEditBtn) {
        closeEditBtn.addEventListener("click", closeEditInterviewModal);
    }

    // Add create interview button listener
    const createBtn = document.getElementById("interview-create-btn");
    if (createBtn) {
        createBtn.addEventListener("click", createInterview);
    }

    // Add open create interview modal button listener
    const openCreateBtn = document.getElementById("open-create-interview-btn");
    if (openCreateBtn) {
        openCreateBtn.addEventListener("click", openCreateInterviewModal);
    }

    // Add edit interview save button listener
    const editSaveBtn = document.getElementById("edit-interview-save-btn");
    if (editSaveBtn) {
        editSaveBtn.addEventListener("click", updateInterview);
    }

    // Make loadJobsIntoInterviewModal and handleJobSelectionChange global
    window.loadJobsIntoInterviewModal = loadJobsIntoInterviewModal;
    window.handleJobSelectionChange = handleJobSelectionChange;
    window.buildJobListUrl = buildJobListUrl;
});

// Make functions globally accessible
window.approveReschedule = approveReschedule;
window.rejectReschedule = rejectReschedule;

function formatInterviewDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

// Initialize interview scheduler page
document.addEventListener("DOMContentLoaded", () => {
    const createForm = document.getElementById("create-interview-form");
    if (createForm) {
        createForm.addEventListener("submit", (e) => {
            e.preventDefault();
            createInterview();
        });
    }
    
    const editForm = document.getElementById("edit-interview-form");
    if (editForm) {
        editForm.addEventListener("submit", (e) => {
            e.preventDefault();
            updateInterview();
        });
    }
});
