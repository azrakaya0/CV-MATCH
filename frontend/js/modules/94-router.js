function navigate(page) {
    const companyPanelPages = ["job", "match", "compare", "rag", "job-applicants", "candidate-filter", "ats-kanban", "interview-scheduler"];
    const adminOnlyPages = ["admin"];

    if (isCompany() && page === "cv") {
        page = "job-applicants";
    }

    if (isAdmin() && companyPanelPages.includes(page)) {
        showToast("Bu bölüm yalnızca şirket hesabına aittir.", "info");
        page = "admin";
    }
    if (isEmployee()) {
        if (companyPanelPages.includes(page) || adminOnlyPages.includes(page)) {
            showToast("Bu sayfa hesabınıza kapalıdır.", "warning");
            page = "jobs-browse";
        }
    }
    if (isCompany() && adminOnlyPages.includes(page)) {
        page = "dashboard";
    }
    if (!isEmployee() && page === "jobs-browse") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (isEmployee() && page === "job-applicants") {
        page = "jobs-browse";
    }
    if (!isEmployee() && page === "employee-cv") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (!isEmployee() && page === "employee-applications") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (!isEmployee() && page === "employee-interviews") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (!isEmployee() && page === "application-tracking") {
        page = isAdmin() ? "admin" : "dashboard";
    }
    if (page === "messages") {
        if (isAdmin()) page = "admin";
        else if (!isEmployee() && !isCompany()) page = "dashboard";
    }

    document.querySelectorAll(".detail-panel").forEach((panel) => {
        panel.classList.remove("visible");
        panel.classList.add("hidden");
    });
    document.querySelector("#main-app.app")?.classList.remove("detail-open");

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.page === page);
    });

    document.querySelectorAll(".page").forEach((section) => {
        section.classList.toggle("active", section.id === `page-${page}`);
    });

    state.currentPage = page;
    window.location.hash = page;

    switch (page) {
        case "dashboard": loadDashboard(); break;
        case "job": loadJobs(); break;
        case "match": loadMatchPage(); break;
        case "compare": loadComparePage(); break;
        case "rag": loadRagPage(); break;
        case "messages": loadMessagesPage(); break;
        case "employee-cv": loadEmployeeCvPage(); break;
        case "employee-applications": loadEmployeeApplicationsPage(); break;
        case "employee-interviews": loadEmployeeInterviewsPage(); break;
        case "settings": loadSettingsPage(); break;
        case "jobs-browse": loadJobsBrowsePage(); break;
        case "job-applicants": loadJobApplicantsPage(); break;
        case "admin": loadAdminPage(); break;
        case "candidate-filter": loadCandidateFilterPage(); break;
        case "interview-scheduler": loadInterviewSchedulerPage(); break;
        case "application-tracking": loadApplicationTrackingPage(); break;
    }
}

