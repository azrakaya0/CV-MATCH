async function loadCandidateFilterPage() {
    if (!isCompany()) return;
    
    try {
        showLoading();
        
        // Load filter options
        const [skills, locations, languages] = await Promise.all([
            api("/api/candidates/skills"),
            api("/api/candidates/locations"),
            api("/api/candidates/languages")
        ]);
        
        state.filterSkills = skills.skills || [];
        state.filterLocations = locations.cities || [];
        state.filterLanguages = languages.languages || [];
        
        renderFilterOptions();
        hideLoading();
    } catch (error) {
        console.error("Error loading filter options:", error);
        showToast("Filtre seçenekleri yüklenirken hata oluştu.", "error");
        hideLoading();
    }
}

function renderFilterOptions() {
    // Render skills datalist for autocomplete
    const skillsDatalist = document.getElementById("skill-suggestions");
    if (skillsDatalist) {
        skillsDatalist.innerHTML = '';
        state.filterSkills.forEach(skill => {
            const option = document.createElement("option");
            option.value = skill;
            skillsDatalist.appendChild(option);
        });
    }
    
    // Render locations dropdown
    const locationSelect = document.getElementById("filter-location");
    if (locationSelect) {
        locationSelect.innerHTML = '<option value="">Seçiniz</option>';
        state.filterLocations.forEach(loc => {
            const option = document.createElement("option");
            option.value = loc;
            option.textContent = loc;
            locationSelect.appendChild(option);
        });
    }
    
    // Render languages dropdown
    const langSelect = document.getElementById("filter-languages");
    if (langSelect) {
        langSelect.innerHTML = '<option value="">Seçiniz</option>';
        state.filterLanguages.forEach(lang => {
            const option = document.createElement("option");
            option.value = lang;
            option.textContent = lang;
            langSelect.appendChild(option);
        });
    }
}

async function applyCandidateFilter() {
    if (!isCompany()) return;
    
    const skillsInput = document.getElementById("filter-skills")?.value;
    const location = document.getElementById("filter-location")?.value;
    const minExp = document.getElementById("filter-min-exp")?.value;
    const maxExp = document.getElementById("filter-max-exp")?.value;
    const education = document.getElementById("filter-education")?.value;
    const graduation = document.getElementById("filter-graduation")?.value;
    const languages = document.getElementById("filter-languages")?.value;
    const jobId = document.getElementById("filter-job-id")?.value;
    
    // Split skills by comma and filter empty values
    const skills = skillsInput ? skillsInput.split(',').map(s => s.trim()).filter(s => s) : null;
    
    const filterData = {
        skills: skills,
        location: location || null,
        min_experience_years: minExp ? parseInt(minExp) : null,
        max_experience_years: maxExp ? parseInt(maxExp) : null,
        education_level: education || null,
        graduation_status: graduation || null,
        languages: languages ? [languages] : null,
        job_id: jobId || null
    };
    
    try {
        showLoading();
        const results = await api("/api/candidates/filter", {
            method: "POST",
            body: JSON.stringify(filterData)
        });
        
        state.filteredCandidates = results;
        renderFilteredCandidates(results);
        hideLoading();
        
        showToast(`${results.length} aday bulundu.`, "success");
    } catch (error) {
        console.error("Error filtering candidates:", error);
        showToast("Aday filtreleme sırasında hata oluştu.", "error");
        hideLoading();
    }
}

function renderFilteredCandidates(candidates) {
    const container = document.getElementById("filtered-candidates-list");
    if (!container) return;
    
    if (candidates.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Filtre kriterlerine uygun aday bulunamadı.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = candidates.map(candidate => `
        <div class="candidate-card">
            <div class="candidate-header">
                <h4>${candidate.name || "İsimsiz"} ${candidate.display_id ? `(#${candidate.display_id})` : ""}</h4>
                ${candidate.match_score !== null ? `
                    <div class="match-badge">
                        <i class="fas fa-percentage"></i> ${candidate.match_score.toFixed(1)}% eşleşme
                    </div>
                ` : ""}
            </div>
            <div class="candidate-details">
                <p><i class="fas fa-envelope"></i> ${candidate.email || "-"}</p>
                <p><i class="fas fa-phone"></i> ${candidate.phone || "-"}</p>
                <p><i class="fas fa-map-marker-alt"></i> ${candidate.city || "-"} ${candidate.district || ""}</p>
                <p><i class="fas fa-briefcase"></i> ${candidate.total_experience_years || 0} yıl deneyim</p>
            </div>
            <div class="candidate-skills">
                <strong>Yetenekler:</strong>
                <div class="skill-tags">
                    ${candidate.skills.slice(0, 8).map(skill => `<span class="skill-tag">${skill}</span>`).join("")}
                    ${candidate.skills.length > 8 ? `<span class="skill-tag">+${candidate.skills.length - 8}</span>` : ""}
                </div>
            </div>
            <div class="candidate-actions">
                <button class="btn btn-sm btn-primary" onclick="viewCandidateDetails('${candidate.cv_id}')">
                    <i class="fas fa-eye"></i> Detaylar
                </button>
            </div>
        </div>
    `).join("");
}

async function viewCandidateDetails(cvId) {
    if (!cvId) return;
    goToCvDetail(cvId);
}

// Initialize filter form event listeners
document.addEventListener("DOMContentLoaded", () => {
    const filterForm = document.getElementById("candidate-filter-form");
    if (filterForm) {
        filterForm.addEventListener("submit", (e) => {
            e.preventDefault();
            applyCandidateFilter();
        });
    }
});
