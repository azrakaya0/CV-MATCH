async function loadSettingsPage() {
    const uEl = document.getElementById("settings-username");
    if (!uEl) return;
    try {
        const me = await api("/api/auth/me");
        const r = me.role === "manager" ? "company" : me.role;
        syncCompanyTenantFromMe({ ...me, role: r });
        if (r === "company") {
            localStorage.setItem(AUTH_COMPANY_ACCESS_KEY, me.company_access || "hr");
            if (me.department) localStorage.setItem(AUTH_DEPARTMENT_LABEL_KEY, me.department);
            else localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
        }
        uEl.value = me.username || "";
        const fn = document.getElementById("settings-full-name");
        const em = document.getElementById("settings-email");
        const ph = document.getElementById("settings-phone");
        if (fn) fn.value = me.full_name || "";
        if (em) em.value = me.email || "";
        if (ph) ph.value = me.phone || "";
        const themeSel = document.getElementById("settings-theme");
        if (themeSel) themeSel.value = getThemePreference();
        const notifyChk = document.getElementById("settings-notify-email");
        if (notifyChk) notifyChk.checked = me.notify_email !== false;
        if (isCompany()) {
            const cn = document.getElementById("settings-company-name");
            const dp = document.getElementById("settings-department");
            if (cn) cn.value = me.company_name || "";
            if (dp) {
                dp.value = me.department || "";
                dp.readOnly = !isCompanyHrScope();
                dp.title = isCompanyHrScope()
                    ? ""
                    : "Departman yetkilisi hesabında departman değiştirilemez.";
            }
            // Departman yetkilisi için bazı alanları disabled yap
            if (!isCompanyHrScope()) {
                if (uEl) {
                    uEl.disabled = true;
                    uEl.title = "Departman yetkilisi hesabında kullanıcı adı değiştirilemez.";
                }
                if (fn) {
                    fn.disabled = true;
                    fn.title = "Departman yetkilisi hesabında ad soyad değiştirilemez.";
                }
                if (cn) {
                    cn.disabled = true;
                    cn.title = "Departman yetkilisi hesabında şirket unvanı değiştirilemez.";
                }
            }
        }
        if (me.avatar_url) localStorage.setItem(AUTH_AVATAR_URL_KEY, me.avatar_url);
        else localStorage.removeItem(AUTH_AVATAR_URL_KEY);
        updateSettingsAvatarPreview(me.avatar_url || null);
        refreshSidebarAvatar();
        if (isCompany() && isCompanyHrScope()) {
            try {
                await loadKvkkMeta();
            } catch {
                /* ignore */
            }
            populateSettingsNewTeamCompanySelect();
            await loadSettingsManagedCompaniesSection();
            await loadSettingsPendingRegistrationsSection();
            await loadSettingsTeamSection();
            await loadSettingsCompanyProfile();
        }
    } catch {
        uEl.value = "";
    }
    ["settings-pw-current", "settings-pw-new", "settings-pw-new2"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    wireSettingsAccordions();
}

function syncSettingsNewTeamDeptVisibility() {
    const v =
        document.querySelector('input[name="settings-new-team-access"]:checked')?.value || "department";
    document.getElementById("settings-new-team-dept-wrap")?.classList.toggle("hidden", v !== "department");
    populateSettingsNewTeamCompanySelect();
}

function settingsTeamToggleRowDeptInput(row) {
    const acc = row.querySelector(".settings-team-access")?.value || "department";
    const inp = row.querySelector(".settings-team-dept");
    if (!inp) return;
    if (acc === "hr") {
        inp.disabled = true;
        inp.placeholder = "İK için boş bırakılabilir";
    } else {
        inp.disabled = false;
        inp.placeholder = "Departman adı";
    }
}

async function loadSettingsManagedCompaniesSection() {
    const wrap = document.getElementById("settings-managed-companies-list");
    if (!wrap || !isCompany() || !isCompanyHrScope()) return;
    const list = getManagedCompaniesFromStorage();
    if (!list.length) {
        wrap.innerHTML = "<p class=\"text-muted\">Yönetilen şirket bulunamadı.</p>";
    } else {
        const activeId = getActiveCompanyId();
        wrap.innerHTML = `<ul class="settings-managed-companies-ul">${list
            .map((c) => {
                const active = c.id === activeId;
                const label = c.name || c.id;
                return `<li class="${active ? "is-active" : ""}">${escapeHtml(label)}${
                    active ? ' <span class="text-muted">(aktif)</span>' : ""
                }</li>`;
            })
            .join("")}</ul>`;
    }
    
    // Load available companies for adding (for consultant only)
    if (isCompanyConsultant()) {
        await loadAvailableCompaniesForAdd();
    }
}

async function loadAvailableCompaniesForAdd() {
    try {
        // Use admin endpoint since we updated it to allow consultants
        const companies = await api("/api/admin/companies");
        
        const list = getManagedCompaniesFromStorage();
        const managedIds = list.map(c => c.id);
        const activeId = getActiveCompanyId();
        
        const select = document.getElementById("settings-add-company-select");
        if (!select) return;
        
        select.innerHTML = '<option value="">Seçiniz</option>';
        companies.forEach(c => {
            // Don't show already managed companies or the active company
            if (!managedIds.includes(c.id) && c.id !== activeId) {
                const option = document.createElement("option");
                option.value = c.id;
                option.textContent = c.name;
                select.appendChild(option);
            }
        });
        
        console.log("Available companies:", companies.length);
        console.log("Managed IDs:", managedIds);
        console.log("Active ID:", activeId);
    } catch (error) {
        console.error("Error loading available companies:", error);
        // Don't show error toast, just log it
    }
}

async function addManagedCompanyFromSettings() {
    const companyId = document.getElementById("settings-add-company-select")?.value;
    if (!companyId) {
        showToast("Lütfen bir şirket seçin.", "warning");
        return;
    }
    
    try {
        showLoading();
        const me = await api("/api/auth/me");
        const currentIds = me.managed_company_ids || [];
        
        if (currentIds.includes(companyId)) {
            showToast("Bu şirket zaten yönetilen şirketler arasında.", "warning");
            hideLoading();
            return;
        }
        
        // Use user endpoint instead of admin endpoint
        await api(`/api/users/${encodeURIComponent(me.username)}/managed-companies`, {
            method: "PATCH",
            body: JSON.stringify({ company_ids: [...currentIds, companyId] })
        });
        
        showToast("Şirket başarıyla eklendi.", "success");
        
        // Reload managed companies
        await loadSettingsManagedCompaniesSection();
        
        // Update storage
        const companies = await api("/api/companies/list");
        const newManagedIds = [...currentIds, companyId];
        const newManagedList = companies.filter(c => newManagedIds.includes(c.id));
        localStorage.setItem("managedCompanies", JSON.stringify(newManagedList));
        
        hideLoading();
    } catch (error) {
        console.error("Error adding managed company:", error);
        showToast("Şirket eklenirken hata oluştu.", "error");
        hideLoading();
    }
}

async function sendCompanyManagementRequestFromSettings() {
    const companyId = document.getElementById("settings-add-company-select")?.value;
    if (!companyId) {
        showToast("Lütfen bir şirket seçin.", "warning");
        return;
    }
    
    await sendCompanyManagementRequest(companyId);
}

async function sendCompanyManagementRequest(companyId) {
    try {
        showLoading();
        
        // Send management request to target company
        await api("/api/company/management-requests", {
            method: "POST",
            body: JSON.stringify({
                target_company_id: companyId,
                message: "Bu şirketin yönetimini almak istiyorum."
            })
        });
        
        showToast("Yönetim isteği gönderildi. Hedef şirketin onayı bekleniyor.", "success");
        hideLoading();
    } catch (error) {
        console.error("Error sending management request:", error);
        showToast("İstek gönderilirken hata oluştu.", "error");
        hideLoading();
    }
}

async function createNewCompanyForConsultant() {
    const name = document.getElementById("new-company-name")?.value?.trim();
    const email = document.getElementById("new-company-email")?.value?.trim();
    const phone = document.getElementById("new-company-phone")?.value?.trim();
    
    if (!name) {
        showToast("Şirket adı zorunludur.", "warning");
        return;
    }
    
    try {
        showLoading();
        
        // Create new company
        const company = await api("/api/companies", {
            method: "POST",
            body: JSON.stringify({
                name: name,
                email: email || null,
                phone: phone || null
            })
        });
        
        // Add to managed companies
        const me = await api("/api/auth/me");
        const currentIds = me.managed_company_ids || [];
        
        await api(`/api/users/${encodeURIComponent(me.username)}/managed-companies`, {
            method: "PATCH",
            body: JSON.stringify({ company_ids: [...currentIds, company.id] })
        });
        
        showToast("Şirket başarıyla oluşturuldu ve yönetiminize eklendi.", "success");
        
        // Clear form
        document.getElementById("new-company-name").value = "";
        document.getElementById("new-company-email").value = "";
        document.getElementById("new-company-phone").value = "";
        
        // Reload managed companies
        await loadSettingsManagedCompaniesSection();
        
        hideLoading();
    } catch (error) {
        console.error("Error creating company:", error);
        showToast("Şirket oluşturulurken hata oluştu.", "error");
        hideLoading();
    }
}

async function loadSettingsPendingRegistrationsSection() {
    const wrap = document.getElementById("settings-pending-registrations-list");
    if (!wrap || !isCompany() || !isCompanyHrScope()) return;
    try {
        const data = await api("/api/company/pending-registrations");
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
            wrap.innerHTML = "<p class=\"text-muted\">Onay bekleyen kayıt yok.</p>";
            return;
        }
        wrap.innerHTML = `
            <table class="compare-table settings-pending-table">
                <thead><tr><th>Kullanıcı</th><th>Ad</th><th>Departman</th><th>E-posta</th><th>Telefon</th><th></th></tr></thead>
                <tbody>
                    ${items
                        .map(
                            (p) => `<tr data-pending-user="${escapeHtml(p.username)}">
                                <td>${escapeHtml(p.username)}</td>
                                <td>${escapeHtml(p.full_name || "")}</td>
                                <td>${escapeHtml(p.department || "")}</td>
                                <td>${escapeHtml(p.email || "")}</td>
                                <td>${escapeHtml(p.phone || "")}</td>
                                <td class="settings-pending-actions">
                                    <button type="button" class="btn btn-primary btn-sm settings-pending-approve">Onayla</button>
                                    <button type="button" class="btn btn-secondary btn-sm settings-pending-reject">Reddet</button>
                                </td>
                            </tr>`
                        )
                        .join("")}
                </tbody>
            </table>`;
    } catch {
        wrap.innerHTML = "<p class=\"text-muted\">Liste yüklenemedi.</p>";
    }
}

async function approvePendingRegistration(username) {
    try {
        showLoading();
        await api(`/api/company/pending-registrations/${encodeURIComponent(username)}/approve`, {
            method: "POST",
        });
        showToast("Kayıt onaylandı.", "success");
        await loadSettingsPendingRegistrationsSection();
        await loadSettingsTeamSection();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function rejectPendingRegistration(username) {
    if (!confirm(`${username} kullanıcısının departman kaydı reddedilsin mi?`)) return;
    try {
        showLoading();
        await api(`/api/company/pending-registrations/${encodeURIComponent(username)}/reject`, {
            method: "POST",
        });
        showToast("Kayıt reddedildi.", "success");
        await loadSettingsPendingRegistrationsSection();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function loadSettingsTeamSection() {
    const wrap = document.getElementById("settings-team-list");
    if (!wrap || !isCompany() || !isCompanyHrScope()) return;
    const myUn = (localStorage.getItem(AUTH_USER_KEY) || "").trim();
    try {
        const team = await api("/api/applications/company-team");
        if (!team.length) {
            wrap.innerHTML = "<p class=\"text-muted\">Şirket kullanıcısı yok.</p>";
            return;
        }
        wrap.innerHTML = `
            <table class="compare-table settings-team-table">
                <thead><tr><th>Kullanıcı</th><th>Ad</th><th>Erişim</th><th>Departman</th><th>E-posta</th><th>Telefon</th><th></th></tr></thead>
                <tbody>
                    ${team
                        .map((t) => {
                            const isSelf =
                                myUn &&
                                String(t.username || "").toLowerCase() === myUn.toLowerCase();
                            const ca = (t.company_access || "hr") === "hr" ? "hr" : "department";
                            const dept = escapeHtml(t.department || "");
                            const email = escapeHtml(t.email || "");
                            const phone = escapeHtml(t.phone || "");
                            const selfNote = isSelf ? " <small class=\"text-muted\">(siz)</small>" : "";
                            return `<tr data-team-user="${escapeHtml(t.username)}">
                                <td>${escapeHtml(t.username)}${selfNote}</td>
                                <td>${escapeHtml(t.full_name || "")}</td>
                                <td>
                                    <select class="settings-team-access" aria-label="Erişim">
                                        <option value="department" ${ca === "department" ? "selected" : ""}>Departman</option>
                                        <option value="hr" ${ca === "hr" ? "selected" : ""}>İK</option>
                                    </select>
                                </td>
                                <td><input type="text" class="settings-team-dept" maxlength="120" value="${dept}" aria-label="Departman"></td>
                                <td>${email}</td>
                                <td>${phone}</td>
                                <td>
                                    <button type="button" class="btn btn-secondary btn-sm settings-team-save-btn">Kaydet</button>
                                    ${!isSelf ? `<button type="button" class="btn btn-danger btn-sm settings-team-delete-btn">Sil</button>` : ""}
                                </td>
                            </tr>`;
                        })
                        .join("")}
                </tbody>
            </table>`;
        wrap.querySelectorAll("[data-team-user]").forEach((row) => {
            settingsTeamToggleRowDeptInput(row);
            row.querySelector(".settings-team-access")?.addEventListener("change", () => {
                settingsTeamToggleRowDeptInput(row);
            });
            row.querySelector(".settings-team-save-btn")?.addEventListener("click", (e) => {
                saveSettingsTeamRow(e.target);
            });
            row.querySelector(".settings-team-delete-btn")?.addEventListener("click", (e) => {
                const username = row.getAttribute("data-team-user");
                deleteSettingsTeamMember(username);
            });
        });
    } catch {
        wrap.innerHTML = "<p class=\"text-muted\">Liste yüklenemedi.</p>";
    }
}

async function deleteSettingsTeamMember(username) {
    if (!confirm(`${username} kullanıcısı şirketten çıkarılsın mı? Bu işlem geri alınamaz.`)) return;
    try {
        showLoading();
        await api(`/api/company/team-member/${encodeURIComponent(username)}`, {
            method: "DELETE",
        });
        showToast("Kullanıcı şirketten çıkarıldı.", "success");
        await loadSettingsTeamSection();
    } catch {
        /* toast from api */
    } finally {
        hideLoading();
    }
}

async function saveSettingsTeamRow(btn) {
    const row = btn.closest("[data-team-user]");
    if (!row) return;
    const username = row.getAttribute("data-team-user");
    const company_access = row.querySelector(".settings-team-access")?.value || "department";
    const department = row.querySelector(".settings-team-dept")?.value?.trim() || "";
    if (company_access === "department" && department.length < 2) {
        showToast("Departman yetkilisi için departman adı en az 2 karakter olmalıdır.", "warning");
        return;
    }
    try {
        showLoading();
        await api(`/api/company/team-member/${encodeURIComponent(username)}`, {
            method: "PATCH",
            body: JSON.stringify({ company_access, department }),
        });
        showToast("Kullanıcı güncellendi.", "success");
        const myUn = (localStorage.getItem(AUTH_USER_KEY) || "").trim();
        if (myUn && String(username).toLowerCase() === myUn.toLowerCase()) {
            localStorage.setItem(AUTH_COMPANY_ACCESS_KEY, company_access);
            if (company_access === "department" && department) {
                localStorage.setItem(AUTH_DEPARTMENT_LABEL_KEY, department);
            } else if (company_access === "hr") {
                localStorage.removeItem(AUTH_DEPARTMENT_LABEL_KEY);
            }
            applyRoleUI();
        }
        await loadSettingsTeamSection();
    } catch {
        /* toast from api */
    } finally {
        hideLoading();
    }
}

async function addSettingsTeamMember() {
    if (!isCompany() || !isCompanyHrScope()) return;
    const kvkk = document.getElementById("settings-team-kvkk");
    if (!kvkk?.checked) {
        showToast("KVKK onayı gerekir.", "warning");
        return;
    }
    const username = document.getElementById("settings-new-team-username")?.value?.trim() || "";
    const password = document.getElementById("settings-new-team-password")?.value || "";
    const full_name = document.getElementById("settings-new-team-fullname")?.value?.trim() || "";
    const email = document.getElementById("settings-new-team-email")?.value?.trim() || "";
    const company_access =
        document.querySelector('input[name="settings-new-team-access"]:checked')?.value === "hr"
            ? "hr"
            : "department";
    const department = document.getElementById("settings-new-team-dept")?.value?.trim() || "";
    if (username.length < 3 || password.length < 6) {
        showToast("Kullanıcı adı ve şifre kurallarına uyun.", "warning");
        return;
    }
    if (full_name.length < 2 || email.length < 3) {
        showToast("Ad soyad ve e-posta girin.", "warning");
        return;
    }
    if (company_access === "department" && department.length < 2) {
        showToast("Departman yetkilisi için departman adı girin.", "warning");
        return;
    }
    const mclist = getManagedCompaniesFromStorage();
    let target_company_id;
    if (mclist.length > 1) {
        target_company_id =
            document.getElementById("settings-new-team-target-company")?.value?.trim() || "";
        if (!target_company_id) {
            showToast("Birden fazla şirketiniz var: hedef şirketi seçin.", "warning");
            return;
        }
    }
    try {
        showLoading();
        const payload = {
            username,
            password,
            full_name,
            email,
            company_access,
            department: company_access === "department" ? department : "",
            kvkk_accepted: true,
            kvkk_version: state.kvkkVersion || "1.0",
        };
        if (target_company_id) payload.target_company_id = target_company_id;
        await api("/api/company/team-member", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        showToast("Kullanıcı oluşturuldu.", "success");
        document.getElementById("settings-new-team-username").value = "";
        document.getElementById("settings-new-team-password").value = "";
        document.getElementById("settings-new-team-fullname").value = "";
        document.getElementById("settings-new-team-email").value = "";
        if (kvkk) kvkk.checked = false;
        await loadSettingsTeamSection();
    } catch {
        /* api */
    } finally {
        hideLoading();
    }
}

async function loadSettingsCompanyProfile() {
    if (!isCompany() || !isCompanyHrScope()) return;
    try {
        const p = await api("/api/company/profile");
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v || "";
        };
        set("settings-co-email", p.email);
        set("settings-co-phone", p.phone);
        set("settings-co-address", p.address);
        set("settings-co-website", p.website);
        if (p.name) {
            const cn = document.getElementById("settings-company-name");
            if (cn && !cn.value) cn.value = p.name;
        }
    } catch {
        /* optional */
    }
}

async function saveSettingsCompanyProfile() {
    if (!isCompany() || !isCompanyHrScope()) return;
    const name = document.getElementById("settings-company-name")?.value?.trim() || "";
    const body = {
        name: name || null,
        email: document.getElementById("settings-co-email")?.value?.trim() || null,
        phone: document.getElementById("settings-co-phone")?.value?.trim() || null,
        address: document.getElementById("settings-co-address")?.value?.trim() || null,
        website: document.getElementById("settings-co-website")?.value?.trim() || null,
    };
    if (name && name.length < 2) {
        showToast("Şirket unvanı en az 2 karakter olmalıdır.", "warning");
        return;
    }
    try {
        showLoading();
        await api("/api/company/profile", { method: "PATCH", body: JSON.stringify(body) });
        showToast("Şirket bilgileri kaydedildi. İlanlarda adaylara görünür.", "success");
    } catch {
        /* toast */
    } finally {
        hideLoading();
    }
}

async function saveSettingsProfile() {
    const full_name = document.getElementById("settings-full-name")?.value?.trim() || "";
    const email = document.getElementById("settings-email")?.value?.trim() || "";
    const phone = document.getElementById("settings-phone")?.value?.trim() || "";
    if (full_name.length < 2) {
        showToast("Ad soyad en az 2 karakter olmalıdır.", "warning");
        return;
    }
    const body = {
        full_name,
        email,
        phone,
        notify_email: !!document.getElementById("settings-notify-email")?.checked,
    };
    if (isCompany()) {
        const cn = document.getElementById("settings-company-name")?.value?.trim() || "";
        if (cn.length < 2) {
            showToast("Şirket unvanı en az 2 karakter olmalıdır.", "warning");
            return;
        }
        body.company_name = cn;
        if (isCompanyHrScope()) {
            body.department = document.getElementById("settings-department")?.value?.trim() || null;
        }
    }
    try {
        showLoading();
        await api("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
        showToast("Profil kaydedildi.", "success");
        const un = localStorage.getItem(AUTH_USER_KEY) || "";
        const av = localStorage.getItem(AUTH_AVATAR_URL_KEY) || "";
        const ca = localStorage.getItem(AUTH_COMPANY_ACCESS_KEY) || "hr";
        let deptLab = localStorage.getItem(AUTH_DEPARTMENT_LABEL_KEY) || undefined;
        if (isCompanyHrScope()) {
            const d = document.getElementById("settings-department")?.value?.trim() || "";
            deptLab = d || undefined;
        }
        setSession(getToken(), getRole(), un, full_name, av || undefined, ca, deptLab);
        applyRoleUI();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function saveSettingsPassword() {
    const current_password = document.getElementById("settings-pw-current")?.value || "";
    const new_password = document.getElementById("settings-pw-new")?.value || "";
    const new_password_confirm = document.getElementById("settings-pw-new2")?.value || "";
    if (!current_password || !new_password) {
        showToast("Mevcut ve yeni şifreyi girin.", "warning");
        return;
    }
    if (new_password.length < 6) {
        showToast("Yeni şifre en az 6 karakter olmalıdır.", "warning");
        return;
    }
    if (new_password !== new_password_confirm) {
        showToast("Yeni şifreler eşleşmiyor.", "warning");
        return;
    }
    try {
        showLoading();
        await api("/api/auth/password", {
            method: "POST",
            body: JSON.stringify({
                current_password,
                new_password,
                new_password_confirm,
            }),
        });
        showToast("Şifre güncellendi. Tekrar giriş yapın.", "success");
        stopNotificationPolling();
        closeNotifDropdown();
        clearSession();
        showLoginScreen();
    } catch {
        /* api toast */
    } finally {
        hideLoading();
    }
}

async function loadKvkkMeta() {
    try {
        const d = await fetch("/api/auth/kvkk-document").then((r) => r.json());
        state.kvkkVersion = d.version || "1.0";
        return d;
    } catch {
        state.kvkkVersion = "1.0";
        return { version: "1.0", html: "" };
    }
}

async function openKvkkFullDocumentModal() {
    const d = await loadKvkkMeta();
    const box = document.getElementById("kvkk-modal-body");
    if (box) box.innerHTML = d.html || "";
    document.getElementById("kvkk-modal")?.classList.remove("hidden");
}

