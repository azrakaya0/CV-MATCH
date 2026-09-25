function openDetailModal(title, html) {
    const modal = document.getElementById("detail-modal");
    const body = document.getElementById("detail-modal-body");
    const titleEl = document.getElementById("detail-modal-title");
    if (!modal || !body) return;
    if (titleEl) titleEl.textContent = title || "Detay";
    body.innerHTML = html;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeDetailModal() {
    const modal = document.getElementById("detail-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function openCompanyProfileModal(profile, title) {
    const html =
        formatCompanyProfileHtml(profile, { heading: title || "Şirket" }) ||
        '<p class="text-muted">Şirket bilgisi bulunamadı.</p>';
    openDetailModal(profile?.name || title || "Şirket", html);
}

