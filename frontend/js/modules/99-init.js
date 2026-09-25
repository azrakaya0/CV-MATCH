async function initApp() {
    initTheme();
    initPasswordToggles();
    setupGlobalKeyboardShortcuts();
    applyDevOnlyUi();
    void loadKvkkMeta();

    document.getElementById("sidebar-theme-btn")?.addEventListener("click", () => {
        cycleThemePreference();
    });
    document.getElementById("settings-theme")?.addEventListener("change", (e) => {
        const v = e.target.value || "dark";
        localStorage.setItem(AUTH_THEME_KEY, v);
        applyTheme(v);
    });

    document.getElementById("messages-back-btn")?.addEventListener("click", () => {
        setMessagesThreadOpen(false);
        state.messagesActiveConvId = null;
        const titleEl = document.getElementById("messages-thread-title");
        if (titleEl) titleEl.textContent = "Mesajlar";
        const threadEl = document.getElementById("messages-thread");
        if (threadEl) {
            threadEl.innerHTML = emptyStateHtml(
                "inbox",
                "Sohbet seçin",
                "Soldan bir konuşma seçin veya yeni sohbet başlatın."
            );
        }
    });

    document.getElementById("logout-btn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        stopNotificationPolling();
        closeNotifDropdown();
        try {
            if (getToken()) {
                await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
            }
        } catch {
            /* offline */
        }
        clearSession();
        showLoginScreen();
    });
    document.getElementById("show-password-reset")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPasswordResetForm(true);
    });
    document.getElementById("hide-password-reset")?.addEventListener("click", (e) => {
        e.preventDefault();
        showPasswordResetForm(false);
        document.getElementById("login-form")?.classList.remove("hidden");
        document.getElementById("show-register")?.classList.remove("hidden");
    });
    document.getElementById("password-reset-form")?.addEventListener("submit", onPasswordResetRequest);
    document.getElementById("password-reset-confirm-form")?.addEventListener("submit", onPasswordResetConfirm);
    document.getElementById("settings-delete-account")?.addEventListener("click", deleteMyAccount);
    document.getElementById("sidebar-settings-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        navigate("settings");
    });

    document.getElementById("sidebar-notifications-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifDropdown();
    });

    document.getElementById("notif-dropdown-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        closeNotifDropdown();
    });

    document.addEventListener("click", (e) => {
        const panel = document.getElementById("notif-dropdown");
        const btn = document.getElementById("sidebar-notifications-btn");
        if (!panel || panel.classList.contains("hidden")) return;
        if (panel.contains(e.target) || btn?.contains(e.target)) return;
        closeNotifDropdown();
    });

    document.getElementById("settings-avatar-pick")?.addEventListener("click", () => {
        document.getElementById("settings-avatar-input")?.click();
    });
    document.getElementById("settings-avatar-input")?.addEventListener("change", () => {
        const inp = document.getElementById("settings-avatar-input");
        const up = document.getElementById("settings-avatar-upload");
        if (up) up.disabled = !inp?.files?.length;
    });
    document.getElementById("settings-avatar-upload")?.addEventListener("click", () => {
        void uploadSettingsAvatar();
    });
    document.getElementById("settings-avatar-remove")?.addEventListener("click", () => {
        void removeSettingsAvatar();
    });
    document.getElementById("settings-avatar-camera")?.addEventListener("click", () => {
        void openCameraModal();
    });
    document.getElementById("camera-capture-btn")?.addEventListener("click", captureAvatarFromCamera);
    document.querySelectorAll("[data-camera-close]").forEach((el) => {
        el.addEventListener("click", closeCameraModal);
    });

    document.getElementById("settings-add-team-member")?.addEventListener("click", () => {
        void addSettingsTeamMember();
    });
    document.getElementById("page-settings")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".settings-team-save-btn");
        if (btn) {
            e.preventDefault();
            void saveSettingsTeamRow(btn);
        }
        const approveBtn = e.target.closest(".settings-pending-approve");
        if (approveBtn) {
            e.preventDefault();
            const row = approveBtn.closest("[data-pending-user]");
            const un = row?.getAttribute("data-pending-user");
            if (un) void approvePendingRegistration(un);
        }
        const rejectBtn = e.target.closest(".settings-pending-reject");
        if (rejectBtn) {
            e.preventDefault();
            const row = rejectBtn.closest("[data-pending-user]");
            const un = row?.getAttribute("data-pending-user");
            if (un) void rejectPendingRegistration(un);
        }
    });
    document.querySelectorAll('input[name="settings-new-team-access"]').forEach((r) => {
        r.addEventListener("change", syncSettingsNewTeamDeptVisibility);
    });
    syncSettingsNewTeamDeptVisibility();

    document.getElementById("login-form")?.addEventListener("submit", onLoginSubmit);
    document.getElementById("register-form")?.addEventListener("submit", onRegisterSubmit);

    document.getElementById("show-register")?.addEventListener("click", async (e) => {
        e.preventDefault();
        showAuthRegisterForm();
        await loadKvkkMeta();
    });
    document.getElementById("show-login")?.addEventListener("click", (e) => {
        e.preventDefault();
        showAuthLoginForm();
    });

    const empForm = document.getElementById("employee-cv-form");
    if (empForm) {
        empForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!isEmployee()) return;
            try {
                showLoading();
                const saved = await submitEmployeeCvForm();
                showToast("CV kaydedildi ve analiz edildi.", "success");
                const sid = saved?.id || null;
                resetEmployeeCvForm();
                if (sid) state.editingCvId = sid;
                await loadEmployeeCvPage();
            } catch (err) {
                showToast(err.message || "Hata", "error");
            } finally {
                hideLoading();
            }
        });
    }

    document.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(link.dataset.page);
        });
    });

    document.getElementById("settings-save-profile")?.addEventListener("click", () => {
        void saveSettingsProfile();
    });
    document.getElementById("settings-save-company-profile")?.addEventListener("click", () => {
        void saveSettingsCompanyProfile();
    });
    document.getElementById("settings-save-password")?.addEventListener("click", () => {
        void saveSettingsPassword();
    });

    const uploadArea = document.getElementById("cv-upload-area");
    const fileInput = document.getElementById("cv-file-input");

    if (uploadArea) {
        uploadArea.addEventListener("click", () => fileInput.click());

        uploadArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadArea.classList.add("dragover");
        });

        uploadArea.addEventListener("dragleave", () => {
            uploadArea.classList.remove("dragover");
        });

        uploadArea.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadArea.classList.remove("dragover");
            const file = e.dataTransfer.files[0];
            if (file) handleCVUpload(file);
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) handleCVUpload(file);
        });
    }

    const jobForm = document.getElementById("job-form");
    if (jobForm) {
        jobForm.addEventListener("submit", createJob);
    }

    setupTagInput("required-skills-input", "required-skills", "tag-required");
    setupTagInput("preferred-skills-input", "preferred-skills", "tag-preferred");
    setupTagInput("languages-input", "languages", "tag-lang");
    setupTagInput("emp-skills-input", "emp-skills", "tag-skill");
    setupTagInput("emp-certs-input", "emp-certs", "tag-skill");

    initEmployeeCvFormUI();
    wireDetailModal();

    const matchBtn = document.getElementById("match-btn");
    if (matchBtn) {
        matchBtn.addEventListener("click", runMatch);
    }

    const compareBtn = document.getElementById("compare-btn");
    if (compareBtn) {
        compareBtn.addEventListener("click", runCompare);
    }

    const cvSearch = document.getElementById("cv-search");
    if (cvSearch) {
        cvSearch.addEventListener("input", () => renderCVList());
    }

    const jobSearch = document.getElementById("job-search");
    if (jobSearch) {
        jobSearch.addEventListener("input", () => renderJobList());
    }

    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            const sidebar = document.getElementById("sidebar");
            sidebar.classList.toggle("collapsed");
            document.querySelector("#main-app.app")?.classList.toggle("sidebar-collapsed");
        });
    }

    if (getToken()) {
        showAppShell();
        applyRoleUI();
    } else {
        showLoginScreen();
    }
    const restored = await tryRestoreSession();
    if (restored) {
        showAppShell();
        applyRoleUI();
    } else {
        showLoginScreen();
    }

    const validPages = [
        "dashboard",
        "job",
        "match",
        "compare",
        "rag",
        "employee-cv",
        "employee-applications",
        "settings",
        "jobs-browse",
        "job-applicants",
        "messages",
        "admin",
    ];
    const companyPanelPages = ["job", "match", "compare", "rag", "job-applicants"];

    document.getElementById("admin-save-kvkk")?.addEventListener("click", async () => {
        if (!isAdmin()) return;
        try {
            showLoading();
            await api("/api/admin/kvkk", {
                method: "PUT",
                body: JSON.stringify({
                    html: document.getElementById("admin-kvkk-html")?.value || "",
                    version: document.getElementById("admin-kvkk-version")?.value || "1.0",
                }),
            });
            showToast("KVKK metni kaydedildi.", "success");
            await loadKvkkMeta();
        } catch (e) {
            showToast(e.message || "Hata", "error");
        } finally {
            hideLoading();
        }
    });

    document.getElementById("reg-tab-employee")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        setRegisterMode("employee");
    });
    document.getElementById("reg-tab-company")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        setRegisterMode("company");
    });
    document.getElementById("reg-tab-consultant")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        setRegisterMode("consultant");
    });
    setRegisterMode("employee");
    document.getElementById("reg-username")?.addEventListener("blur", () => {
        void checkRegisterUsernameAvailability();
    });

    function syncRegisterCompanyDeptVisibility() {
        const v =
            document.querySelector('input[name="reg-company-access"]:checked')?.value || "hr";
        document.getElementById("reg-company-dept-row")?.classList.toggle("hidden", v !== "department");
    }
    document.querySelectorAll('input[name="reg-company-access"]').forEach((r) => {
        r.addEventListener("change", syncRegisterCompanyDeptVisibility);
    });
    syncRegisterCompanyDeptVisibility();

    document.getElementById("ik-job-server-filter-btn")?.addEventListener("click", () => {
        state.ikJobServerDeptFilter =
            document.getElementById("ik-job-server-dept")?.value?.trim() || "";
        if (state.currentPage === "job") void loadJobs();
    });
    document.getElementById("ik-job-server-filter-clear")?.addEventListener("click", () => {
        state.ikJobServerDeptFilter = "";
        const el = document.getElementById("ik-job-server-dept");
        if (el) el.value = "";
        if (state.currentPage === "job") void loadJobs();
    });

    document.getElementById("admin-load-jobs-btn")?.addEventListener("click", () => {
        void adminLoadJobsPreview();
    });
    document.getElementById("admin-save-managed-companies")?.addEventListener("click", async () => {
        if (!isAdmin()) return;
        const un = document.getElementById("admin-managed-username")?.value?.trim() || "";
        const sel = document.getElementById("admin-managed-companies");
        const chosen = sel ? [...sel.selectedOptions].map((o) => o.value).filter(Boolean) : [];
        if (un.length < 3 || !chosen.length) {
            showToast("İK kullanıcı adı ve en az bir şirket seçin.", "warning");
            return;
        }
        try {
            showLoading();
            await api(`/api/admin/users/${encodeURIComponent(un)}/managed-companies`, {
                method: "PATCH",
                body: JSON.stringify({ company_ids: chosen }),
            });
            showToast("Şirket erişimi güncellendi.", "success");
            await loadAdminPage();
        } catch {
            /* api toast */
        } finally {
            hideLoading();
        }
    });
    document.getElementById("open-kvkk-modal")?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        await openKvkkFullDocumentModal();
    });
    document.addEventListener("click", async (ev) => {
        const link = ev.target.closest(".open-kvkk-modal-link");
        if (!link || link.id === "open-kvkk-modal") return;
        ev.preventDefault();
        await openKvkkFullDocumentModal();
    });

    document.getElementById("close-kvkk-modal")?.addEventListener("click", () => {
        document.getElementById("kvkk-modal")?.classList.add("hidden");
    });

    document.getElementById("close-apply-cv-modal")?.addEventListener("click", () => {
        document.getElementById("apply-cv-modal")?.classList.add("hidden");
        state.pendingApplyJobId = null;
    });
    document.getElementById("apply-cv-modal-confirm")?.addEventListener("click", async () => {
        const jobId = state.pendingApplyJobId;
        const cvId = document.getElementById("apply-cv-modal-select")?.value;
        if (!jobId || !cvId) return;
        await submitJobApplication(jobId, cvId);
    });

    document.getElementById("messages-compose-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void sendCurrentMessage();
    });
    const hashRaw = window.location.hash.replace("#", "");
    if (hashRaw.startsWith("password-reset")) {
        showLoginScreen();
        const q = hashRaw.includes("?") ? hashRaw.split("?")[1] : "";
        const token = new URLSearchParams(q).get("token");
        if (token) {
            document.getElementById("reset-token").value = token;
            document.getElementById("login-form")?.classList.add("hidden");
            document.getElementById("password-reset-confirm-form")?.classList.remove("hidden");
            document.getElementById("show-register")?.classList.add("hidden");
        } else {
            showPasswordResetForm(true);
        }
    }

    if (getToken()) {
        let initial = window.location.hash.replace("#", "").split("?")[0];
        if (!validPages.includes(initial)) {
            initial = isAdmin() ? "admin" : isCompany() ? "dashboard" : "jobs-browse";
        }
        if (isAdmin() && companyPanelPages.includes(initial)) {
            initial = "admin";
        }
        if (isEmployee() && (companyPanelPages.includes(initial) || initial === "admin")) {
            initial = "jobs-browse";
        }
        if (isCompany() && initial === "admin") {
            initial = "dashboard";
        }
        if (!isEmployee() && (initial === "employee-cv" || initial === "employee-applications")) {
            initial = isAdmin() ? "admin" : "dashboard";
        }
        if (isAdmin() && initial === "messages") {
            initial = "admin";
        }
        if (!isEmployee() && !isCompany() && initial === "messages") {
            initial = "dashboard";
        }
        navigate(initial);
    }

    window.addEventListener("hashchange", () => {
        const p = window.location.hash.replace("#", "");
        if (!validPages.includes(p) || p === state.currentPage) return;
        navigate(p);
    });

}

document.addEventListener("DOMContentLoaded", () => {
    initApp().catch((e) => console.error(e));
});
