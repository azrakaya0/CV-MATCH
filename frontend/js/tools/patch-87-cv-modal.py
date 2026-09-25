from pathlib import Path

p = Path(__file__).resolve().parents[1] / "modules" / "87-cv.js"
t = p.read_text(encoding="utf-8")
if "function buildCvDetailModalHtml" in t:
    print("already patched")
    raise SystemExit(0)

insert = '''
function buildCvDetailModalHtml(cv) {
    const d = cv.data || {};
    const skills = d.skills || [];
    const education = d.education || [];
    const experience = d.experience || [];
    const languages = d.languages || [];
    const cvId = cv.id || cv._id;
    return `
        <div class="cv-detail-modal">
            <motion.div class="detail-section">
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

'''.replace("<motion.div", "<div")

marker = "function showCVDetail(cvId) {"
t = t.replace(marker, insert + marker, 1)
t = t.replace(
    "    const cv = state.cvs.find((c) => c.id === cvId);\n    if (!cv) return;",
    "    const cv = state.cvs?.find((c) => c.id === cvId);\n    if (!cv) {\n        void openCvDetailModal(cvId);\n        return;\n    }",
    1,
)
p.write_text(t, encoding="utf-8")
print("patched")
