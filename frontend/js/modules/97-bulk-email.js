/* Toplu e-posta gönderme UI modülü */

let bulkEmailModal = null;
let bulkEmailJobId = null;

function openBulkEmailModal(jobId, jobTitle = "") {
    bulkEmailJobId = jobId;
    const modal = document.getElementById("bulk-email-modal");
    if (!modal) return;
    
    // Formu sıfırla
    document.getElementById("bulk-email-subject").value = "";
    document.getElementById("bulk-email-body").value = "";
    document.getElementById("bulk-email-filter").value = "all";
    
    // İlan başlığını göster
    const titleEl = document.getElementById("bulk-email-job-title");
    if (titleEl) titleEl.textContent = jobTitle || "";
    
    // Modal'ı aç
    modal.classList.add("active");
    bulkEmailModal = modal;
    
    // Değişken ipuçlarını göster
    showBulkEmailVariableHints();
}

function closeBulkEmailModal() {
    const modal = document.getElementById("bulk-email-modal");
    if (modal) modal.classList.remove("active");
    bulkEmailModal = null;
    bulkEmailJobId = null;
}

function showBulkEmailVariableHints() {
    const hints = document.getElementById("bulk-email-variable-hints");
    if (!hints) return;
    
    hints.innerHTML = `
        <div class="bulk-email-hints">
            <strong>Kullanılabilir değişkenler:</strong>
            <code>{aday_adi}</code> - Adayın tam adı<br>
            <code>{aday_kullanici_adi}</code> - Adayın kullanıcı adı<br>
            <code>{ilan_basligi}</code> - İlan başlığı<br>
            <code>{sirket_adi}</code> - Şirket adı
        </div>
    `;
}

async function sendBulkEmail() {
    if (!bulkEmailJobId) {
        showToast("İlan bilgisi bulunamadı", "error");
        return;
    }
    
    const subject = document.getElementById("bulk-email-subject").value.trim();
    const body = document.getElementById("bulk-email-body").value.trim();
    const filter = document.getElementById("bulk-email-filter").value;
    
    if (!subject) {
        showToast("Lütfen konu başlığı girin", "error");
        return;
    }
    
    if (!body) {
        showToast("Lütfen e-posta içeriği girin", "error");
        return;
    }
    
    const sendBtn = document.getElementById("bulk-email-send-btn");
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...';
    }
    
    try {
        const response = await api("/api/bulk-email/send", {
            method: "POST",
            body: JSON.stringify({
                job_id: bulkEmailJobId,
                subject: subject,
                body: body,
                recipient_filter: filter,
            }),
        });
        
        if (response.id) {
            showToast(
                `Toplu e-posta gönderimi başlatıldı. ${response.total_recipients} alıcıya gönderilecek.`,
                "success"
            );
            closeBulkEmailModal();
            
            // Geçmişi yenile
            loadBulkEmailHistory();
        } else {
            showToast("E-posta gönderimi başarısız", "error");
        }
    } catch (error) {
        console.error("Bulk email error:", error);
        showToast(error.message || "E-posta gönderim hatası", "error");
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gönder';
        }
    }
}

async function loadBulkEmailHistory() {
    const container = document.getElementById("bulk-email-history-list");
    if (!container) return;
    
    try {
        const history = await api("/api/bulk-email/history");
        
        if (!history || history.length === 0) {
            container.innerHTML = '<p class="text-muted">Henüz toplu e-posta gönderimi yok.</p>';
            return;
        }
        
        container.innerHTML = history.map((item) => `
            <div class="bulk-email-history-item">
                <div class="bulk-email-history-header">
                    <strong>${escapeHtml(item.subject)}</strong>
                    <span class="bulk-email-status bulk-email-status--${item.status}">
                        ${item.status === "sent" ? "Gönderildi" : "Beklemede"}
                    </span>
                </div>
                <div class="bulk-email-history-meta">
                    <small>${formatDate(item.created_at)}</small>
                    <span>${item.sent_count}/${item.total_recipients} gönderildi</span>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("Bulk email history error:", error);
        container.innerHTML = '<p class="text-danger">Geçmiş yüklenemedi.</p>';
    }
}

function wireBulkEmailModal() {
    const modal = document.getElementById("bulk-email-modal");
    if (!modal || modal.dataset.wired) return;
    modal.dataset.wired = "1";
    
    // Kapat butonu
    const closeBtn = modal.querySelector(".bulk-email-close");
    if (closeBtn) {
        closeBtn.addEventListener("click", closeBulkEmailModal);
    }
    
    // Gönder butonu
    const sendBtn = document.getElementById("bulk-email-send-btn");
    if (sendBtn) {
        sendBtn.addEventListener("click", sendBulkEmail);
    }
    
    // Escape tuşu
    modal.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeBulkEmailModal();
    });
    
    // Dışarı tıklayınca kapat
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeBulkEmailModal();
    });
}

// Başvurular sayfasına toplu mail butonu ekle
function addBulkEmailButtonToApplicants() {
    const header = document.getElementById("job-applicants-active-head");
    if (!header || header.dataset.bulkEmailAdded) return;
    header.dataset.bulkEmailAdded = "1";
    
    const jobId = state.applicantsJobId;
    if (!jobId) return;
    
    const job = state.applicantsJobsSnapshot?.find((j) => j.id === jobId);
    if (!job) return;
    
    // Butonu ekle
    const btnContainer = document.createElement("div");
    btnContainer.className = "applicants-bulk-actions";
    btnContainer.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" onclick="openBulkEmailModal('${jobId}', '${escapeHtml(job.title)}')">
            <i class="fas fa-envelope"></i> Toplu E-posta Gönder
        </button>
    `;
    
    header.querySelector(".applicants-active-head-inner")?.appendChild(btnContainer);
}

// Modülü başlat
function initBulkEmailModule() {
    wireBulkEmailModal();
    
    // Başvurular sayfasındaysa butonu ekle
    if (state.currentPage === "job-applicants") {
        addBulkEmailButtonToApplicants();
    }
    
    // Sayfa değişikliklerini izle
    const observer = new MutationObserver(() => {
        if (state.currentPage === "job-applicants") {
            addBulkEmailButtonToApplicants();
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

// Global fonksiyonlar
window.openBulkEmailModal = openBulkEmailModal;
window.closeBulkEmailModal = closeBulkEmailModal;
window.sendBulkEmail = sendBulkEmail;
window.loadBulkEmailHistory = loadBulkEmailHistory;

// Başlat
initBulkEmailModule();
