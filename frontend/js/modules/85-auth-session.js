async function tryRestoreSession() {
    const t = getToken();
    if (!t) return false;
    try {
        const controller = new AbortController();
        const timeoutMs = 12000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const me = await fetch("/api/auth/me", {
            headers: authHeaders(),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!me.ok) {
            clearSession();
            return false;
        }
        const data = await me.json();
        let role = data.role === "manager" ? "company" : data.role;
        setSession(
            t,
            role,
            data.username,
            data.full_name || "",
            data.avatar_url || undefined,
            role === "company" ? data.company_access || "hr" : undefined,
            role === "company" ? data.department || undefined : undefined
        );
        syncCompanyTenantFromMe({ ...data, role });
        return true;
    } catch (err) {
        if (err?.name === "AbortError") {
            console.warn("Oturum doğrulama zaman aşımı — sunucu yanıt vermiyor olabilir.");
        }
        clearSession();
        return false;
    }
}

function formatAuthErrorDetail(detail) {
    if (!detail) return "";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((x) => (typeof x === "object" && x?.msg ? x.msg : String(x)))
            .filter(Boolean)
            .join(" ");
    }
    return String(detail);
}

async function onLoginSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-submit-btn");
    if (errEl) errEl.textContent = "";
    const u = document.getElementById("login-username")?.value?.trim();
    const p = document.getElementById("login-password")?.value || "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Giriş yapılıyor…';
    }
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (errEl) {
                errEl.textContent = formatAuthErrorDetail(data.detail) || "Giriş başarısız";
            }
            return;
        }
        let role = data.role === "manager" ? "company" : data.role;
        setSession(
            data.access_token,
            role,
            data.username,
            data.full_name || "",
            data.avatar_url || undefined,
            role === "company" ? data.company_access || "hr" : undefined,
            role === "company" ? data.department || undefined : undefined
        );
        syncCompanyTenantFromMe({ ...data, role });
        showAppShell();
        applyRoleUI();
        const defaultPage =
            role === "admin"
                ? "admin"
                : role === "company"
                  ? "dashboard"
                  : "jobs-browse";
        navigate(defaultPage);
    } catch {
        if (errEl) errEl.textContent = "Bağlantı hatası";
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Giriş';
        }
    }
}

function showPasswordResetForm(show) {
    document.getElementById("login-form")?.classList.toggle("hidden", show);
    document.getElementById("register-form")?.classList.add("hidden");
    document.getElementById("password-reset-form")?.classList.toggle("hidden", !show);
    document.getElementById("password-reset-confirm-form")?.classList.add("hidden");
    document.getElementById("show-login")?.classList.add("hidden");
    document.getElementById("show-register")?.classList.toggle("hidden", show);
}

function showAuthLoginForm(prefillUsername) {
    document.getElementById("login-form")?.classList.remove("hidden");
    document.getElementById("register-form")?.classList.add("hidden");
    document.getElementById("password-reset-form")?.classList.add("hidden");
    document.getElementById("password-reset-confirm-form")?.classList.add("hidden");
    document.getElementById("show-login")?.classList.add("hidden");
    document.getElementById("show-register")?.classList.remove("hidden");
    resetRegisterForm();
    const lu = document.getElementById("login-username");
    const lp = document.getElementById("login-password");
    if (lu && prefillUsername) lu.value = prefillUsername;
    if (lp) lp.value = "";
    const loginErr = document.getElementById("login-error");
    if (loginErr) loginErr.textContent = "";
    lp?.focus();
}

function showAuthRegisterForm() {
    resetRegisterForm();
    document.getElementById("login-form")?.classList.add("hidden");
    document.getElementById("register-form")?.classList.remove("hidden");
    document.getElementById("password-reset-form")?.classList.add("hidden");
    document.getElementById("password-reset-confirm-form")?.classList.add("hidden");
    document.getElementById("show-register")?.classList.add("hidden");
    document.getElementById("show-login")?.classList.remove("hidden");
    const regErr = document.getElementById("register-error");
    if (regErr) regErr.textContent = "";
}

async function onPasswordResetRequest(e) {
    e.preventDefault();
    const err = document.getElementById("reset-error");
    const ok = document.getElementById("reset-success");
    if (err) err.textContent = "";
    if (ok) ok.textContent = "";
    const email = document.getElementById("reset-email")?.value?.trim();
    try {
        const res = await fetch("/api/auth/password-reset-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (err) err.textContent = data.detail || "İşlem başarısız";
            return;
        }
        if (ok) {
            ok.textContent = data.message || "Şifre sıfırlama talebiniz alındı. E-posta kutunuzu kontrol edin.";
        }
        if (data.dev_reset_token) {
            document.getElementById("reset-token").value = data.dev_reset_token;
            document.getElementById("password-reset-form")?.classList.add("hidden");
            document.getElementById("password-reset-confirm-form")?.classList.remove("hidden");
        }
    } catch {
        if (err) err.textContent = "Bağlantı hatası";
    }
}

async function onPasswordResetConfirm(e) {
    e.preventDefault();
    const err = document.getElementById("reset-confirm-error");
    if (err) err.textContent = "";
    const token = document.getElementById("reset-token")?.value?.trim();
    const p1 = document.getElementById("reset-new-password")?.value || "";
    const p2 = document.getElementById("reset-new-password2")?.value || "";
    try {
        const res = await fetch("/api/auth/password-reset-confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token,
                new_password: p1,
                new_password_confirm: p2,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (err) err.textContent = data.detail || "İşlem başarısız";
            return;
        }
        showToast(data.message || "Şifre güncellendi", "success");
        showPasswordResetForm(false);
        showAuthLoginForm();
    } catch {
        if (err) err.textContent = "Bağlantı hatası";
    }
}

async function deleteMyAccount() {
    if (
        !confirm(
            "Hesabınız ve (aday iseniz) CV ile başvurularınız kalıcı olarak silinecek. Devam edilsin mi?"
        )
    ) {
        return;
    }
    try {
        await api("/api/auth/me", { method: "DELETE" });
        clearSession();
        showLoginScreen();
        showToast("Hesabınız silindi.", "success");
    } catch {
        /* api toast */
    }
}

async function onRegisterSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("register-error");
    const regBtn = document.querySelector("#register-form button[type=submit]");
    const resetRegBtn = () => {
        if (regBtn) {
            regBtn.disabled = false;
            regBtn.innerHTML = '<i class="fas fa-user-plus"></i> Kayıt ol';
        }
    };
    if (errEl) errEl.textContent = "";
    if (regBtn) {
        regBtn.disabled = true;
        regBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kayıt olunuyor…';
    }

    await loadKvkkMeta();

    const isConsultantTab = document.getElementById("reg-tab-consultant")?.classList.contains("active");
    const isCompanyTab =
        document.getElementById("reg-tab-company")?.classList.contains("active") && !isConsultantTab;
    const isEmployeeTab = !isCompanyTab && !isConsultantTab;

    const u = document.getElementById("reg-username")?.value?.trim() || "";
    const p = document.getElementById("reg-password")?.value || "";
    const p2 = document.getElementById("reg-password2")?.value || "";
    const fullName = document.getElementById("reg-full-name")?.value?.trim() || "";
    const regEmail = document.getElementById("reg-email")?.value?.trim() || "";
    const regPhone = document.getElementById("reg-phone")?.value?.trim() || "";
    const kvkk = document.getElementById("reg-kvkk");

    if (!kvkk?.checked) {
        if (errEl) errEl.textContent = "KVKK metnini okuyup onaylamanız gerekir.";
        resetRegBtn();
        return;
    }
    if (p !== p2) {
        if (errEl) errEl.textContent = "Şifreler eşleşmiyor.";
        resetRegBtn();
        return;
    }
    if (u.length < 3) {
        if (errEl) errEl.textContent = "Kullanıcı adı en az 3 karakter olmalıdır.";
        resetRegBtn();
        return;
    }
    if (fullName.length < 2) {
        if (errEl) errEl.textContent = "Ad soyad en az 2 karakter olmalıdır.";
        resetRegBtn();
        return;
    }
    if (isEmployeeTab || isCompanyTab || isConsultantTab) {
        if (!regEmail || regEmail.length < 3) {
            if (errEl) errEl.textContent = "Geçerli bir e-posta adresi girin.";
            resetRegBtn();
            return;
        }
    }
    const url = isConsultantTab
        ? "/api/auth/register-consultant"
        : isCompanyTab
          ? "/api/auth/register-company"
          : "/api/auth/register";
    const regAccess =
        document.querySelector('input[name="reg-company-access"]:checked')?.value === "department"
            ? "department"
            : "hr";
    const regDept = document.getElementById("reg-company-department")?.value?.trim() || "";
    const regCompanyName = document.getElementById("reg-company-name")?.value?.trim() || "";
    if (isCompanyTab || isConsultantTab) {
        if (!regPhone || regPhone.length < 8) {
            if (errEl) errEl.textContent = "Telefon numarası zorunludur (en az 8 karakter).";
            resetRegBtn();
            return;
        }
    }
    if (isCompanyTab && regCompanyName.length < 2) {
        if (errEl) errEl.textContent = "Şirket unvanı zorunludur (en az 2 karakter).";
        resetRegBtn();
        return;
    }
    if (isCompanyTab && regAccess === "department" && (!regDept || regDept.length < 2)) {
        if (errEl) errEl.textContent = "Departman yetkilisi için departman adı girin (en az 2 karakter).";
        resetRegBtn();
        return;
    }
    try {
        const availRes = await fetch(`/api/auth/username-available?username=${encodeURIComponent(u)}`);
        const availData = await availRes.json().catch(() => ({}));
        if (!availData.available) {
            if (errEl) {
                errEl.textContent = availData.message || "Bu kullanıcı adı zaten kayıtlı.";
            }
            resetRegBtn();
            return;
        }
    } catch {
        /* sunucu yanıt vermezse kayıt denemesine devam */
    }
    const kvkkVer = state.kvkkVersion || "1.1";
    const body = isConsultantTab
        ? {
              username: u,
              password: p,
              password_confirm: p2,
              full_name: fullName,
              email: regEmail,
              phone: regPhone,
              kvkk_accepted: true,
              kvkk_version: kvkkVer,
          }
        : isCompanyTab
        ? {
              company_name: regCompanyName,
              username: u,
              password: p,
              password_confirm: p2,
              full_name: fullName,
              email: regEmail,
              phone: regPhone,
              kvkk_accepted: true,
              kvkk_version: kvkkVer,
              company_access: regAccess,
              department: regAccess === "department" ? regDept : "",
          }
        : {
              username: u,
              password: p,
              password_confirm: p2,
              full_name: fullName,
              email: regEmail,
              phone: regPhone,
              kvkk_accepted: true,
              kvkk_version: kvkkVer,
          };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (errEl) {
                errEl.textContent = formatAuthErrorDetail(data.detail) || "Kayıt başarısız";
            }
            return;
        }
        document.getElementById("reg-password").value = "";
        document.getElementById("reg-password2").value = "";
        if (kvkk) kvkk.checked = false;
        setRegisterMode("employee");
        showAuthLoginForm(u);
        showToast(data.message || "Kayıt tamamlandı. Giriş yapabilirsiniz.", "success");
    } catch {
        if (errEl) errEl.textContent = "Bağlantı hatası";
    } finally {
        resetRegBtn();
    }
}

