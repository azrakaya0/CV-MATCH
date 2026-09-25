async function loadAtsKanbanPage() {
    if (!isCompany()) return;
    
    try {
        showLoading();
        await loadPipelineStages();
        await loadPipelineData();
        hideLoading();
    } catch (error) {
        console.error("Error loading ATS data:", error);
        showToast("ATS verileri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function loadPipelineStages() {
    try {
        const stages = await api("/api/ats/stages");
        state.pipelineStages = stages;
        renderKanbanBoard();
    } catch (error) {
        console.error("Error loading pipeline stages:", error);
        throw error;
    }
}

async function loadPipelineData() {
    try {
        const pipeline = await api("/api/ats/pipeline");
        state.pipelineData = pipeline;
        renderKanbanBoard();
    } catch (error) {
        console.error("Error loading pipeline data:", error);
        throw error;
    }
}

async function loadJobPipeline(jobId) {
    try {
        showLoading();
        const pipeline = await api(`/api/ats/job/${jobId}/pipeline`);
        state.pipelineData = pipeline;
        state.currentJobPipeline = jobId;
        renderKanbanBoard();
        hideLoading();
    } catch (error) {
        console.error("Error loading job pipeline:", error);
        showToast("İş pipeline verileri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

function renderKanbanBoard() {
    const container = document.getElementById("kanban-board");
    if (!container) return;
    
    if (!state.pipelineStages || state.pipelineStages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-columns"></i>
                <p>Pipeline aşamaları bulunamadı.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.pipelineStages.map(stage => {
        const stageData = state.pipelineData?.[stage.id] || { stage, candidates: [] };
        const candidates = stageData.candidates || [];
        
        return `
            <div class="kanban-column" data-stage="${stage.id}" style="border-left: 4px solid ${stage.color}">
                <div class="kanban-column-header">
                    <h4>${stage.name}</h4>
                    <span class="candidate-count">${candidates.length}</span>
                </div>
                <div class="kanban-column-body" data-stage="${stage.id}">
                    ${candidates.map(candidate => renderCandidateCard(candidate, stage)).join("")}
                </div>
            </div>
        `;
    }).join("");
    
    // Initialize drag and drop
    initDragAndDrop();
}

function renderCandidateCard(candidate, stage) {
    return `
        <div class="kanban-card" draggable="true" data-application-id="${candidate.application_id}" data-stage="${stage.id}">
            <div class="card-header">
                <span class="applicant-name">${candidate.applicant_username}</span>
                <span class="cv-id">#${candidate.cv_display_id || "?"}</span>
            </div>
            <div class="card-body">
                <p class="card-meta">
                    <i class="fas fa-calendar"></i> ${formatDate(candidate.created_at)}
                </p>
                ${candidate.notes ? `
                    <p class="card-notes">
                        <i class="fas fa-sticky-note"></i> ${candidate.notes}
                    </p>
                ` : ""}
            </div>
            <div class="card-actions">
                <button class="btn btn-xs btn-primary" onclick="openApplicationDetails('${candidate.application_id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-xs btn-secondary" onclick="openInterviewModal('${candidate.application_id}')">
                    <i class="fas fa-calendar-plus"></i>
                </button>
            </div>
        </div>
    `;
}

function initDragAndDrop() {
    const cards = document.querySelectorAll(".kanban-card");
    const columns = document.querySelectorAll(".kanban-column-body");
    
    cards.forEach(card => {
        card.addEventListener("dragstart", handleDragStart);
        card.addEventListener("dragend", handleDragEnd);
    });
    
    columns.forEach(column => {
        column.addEventListener("dragover", handleDragOver);
        column.addEventListener("drop", handleDrop);
        column.addEventListener("dragenter", handleDragEnter);
        column.addEventListener("dragleave", handleDragLeave);
    });
}

let draggedCard = null;
let draggedFromStage = null;

function handleDragStart(e) {
    draggedCard = e.target;
    draggedFromStage = e.target.dataset.stage;
    e.target.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd(e) {
    e.target.classList.remove("dragging");
    draggedCard = null;
    draggedFromStage = null;
    
    document.querySelectorAll(".kanban-column-body").forEach(col => {
        col.classList.remove("drag-over");
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
    e.preventDefault();
    e.target.closest(".kanban-column-body")?.classList.add("drag-over");
}

function handleDragLeave(e) {
    e.target.closest(".kanban-column-body")?.classList.remove("drag-over");
}

async function handleDrop(e) {
    e.preventDefault();
    const column = e.target.closest(".kanban-column-body");
    if (!column || !draggedCard) return;
    
    const toStage = column.dataset.stage;
    const applicationId = draggedCard.dataset.application_id;
    
    if (toStage === draggedFromStage) return;
    
    try {
        await updateApplicationStage(applicationId, toStage);
        // Reload pipeline data
        if (state.currentJobPipeline) {
            await loadJobPipeline(state.currentJobPipeline);
        } else {
            await loadPipelineData();
        }
        showToast("Aday aşaması güncellendi.", "success");
    } catch (error) {
        console.error("Error updating stage:", error);
        showToast("Aşama güncellenirken hata oluştu.", "error");
    }
}

async function updateApplicationStage(applicationId, newStage) {
    const notes = prompt("Not eklemek ister misiniz? (İsteğe bağlı)");
    
    await api(`/api/ats/application/${applicationId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({
            stage: newStage,
            notes: notes || null
        })
    });
}

async function openApplicationDetails(applicationId) {
    try {
        showLoading();
        const pipeline = await api(`/api/ats/application/${applicationId}`);
        const application = await api(`/api/applications/job/${pipeline.application_id.replace(pipeline.application_id.split('_')[0] + '_', '')}`);
        // Show modal with application details
        hideLoading();
    } catch (error) {
        console.error("Error loading application details:", error);
        showToast("Başvuru detayları yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

function openInterviewModal(applicationId) {
    const modal = document.getElementById("interview-modal");
    if (!modal) return;
    
    document.getElementById("interview-application-id").value = applicationId;
    modal.classList.remove("hidden");
    modal.classList.add("visible");
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

// Initialize ATS page
document.addEventListener("DOMContentLoaded", () => {
    const jobFilter = document.getElementById("ats-job-filter");
    if (jobFilter) {
        jobFilter.addEventListener("change", async (e) => {
            if (e.target.value) {
                await loadJobPipeline(e.target.value);
            } else {
                state.currentJobPipeline = null;
                await loadPipelineData();
            }
        });
    }
});
