function updateRegisterFieldLabels(mode) {
    const m = ["employee", "company", "consultant"].includes(mode) ? mode : "employee";
    const requireContact = m === "company" || m === "consultant";
    const emailLabel = document.getElementById("reg-email-label");
    const phoneLabel = document.getElementById("reg-phone-label");
    const emailInput = document.getElementById("reg-email");
    const phoneInput = document.getElementById("reg-phone");
    const companyNameInput = document.getElementById("reg-company-name");
    if (emailLabel) emailLabel.textContent = "E-posta *";
    if (phoneLabel) {
        phoneLabel.textContent = requireContact ? "Telefon *" : "Telefon (isteğe bağlı)";
    }
    if (emailInput) emailInput.required = true;
    if (phoneInput) {
        phoneInput.required = requireContact;
        if (requireContact) phoneInput.setAttribute("minlength", "8");
        else phoneInput.removeAttribute("minlength");
    }
    if (companyNameInput) {
        if (m === "company") companyNameInput.setAttribute("required", "");
        else companyNameInput.removeAttribute("required");
    }
}

function setRegisterMode(mode) {
    const modes = ["employee", "company", "consultant"];
    const m = modes.includes(mode) ? mode : "employee";
    document.getElementById("reg-tab-employee")?.classList.toggle("active", m === "employee");
    document.getElementById("reg-tab-company")?.classList.toggle("active", m === "company");
    document.getElementById("reg-tab-consultant")?.classList.toggle("active", m === "consultant");
    document.getElementById("reg-company-name-wrap")?.classList.toggle("hidden", m !== "company");
    document.getElementById("reg-company-access-wrap")?.classList.toggle("hidden", m !== "company");
    document.getElementById("reg-consultant-info")?.classList.toggle("hidden", m !== "consultant");
    updateRegisterFieldLabels(m);
}

function resetRegisterForm() {
    const form = document.getElementById("register-form");
    form?.reset();
    setRegisterMode("employee");
    document.getElementById("reg-company-dept-row")?.classList.add("hidden");
    const hint = document.getElementById("reg-username-hint");
    if (hint) {
        hint.textContent = "";
        hint.classList.remove("login-error");
    }
    document.getElementById("reg-username-ok")?.classList.add("hidden");
    document.getElementById("register-error").textContent = "";
    document.getElementById("reg-kvkk").checked = false;
}

function setRegUsernameAvailabilityState(state, message) {
    const hint = document.getElementById("reg-username-hint");
    const ok = document.getElementById("reg-username-ok");
    if (state === "available") {
        if (hint) {
            hint.textContent = "";
            hint.classList.remove("login-error");
        }
        ok?.classList.remove("hidden");
        return;
    }
    ok?.classList.add("hidden");
    if (!hint) return;
    if (state === "error" && message) {
        hint.textContent = message;
        hint.classList.add("login-error");
    } else {
        hint.textContent = "";
        hint.classList.remove("login-error");
    }
}

async function checkRegisterUsernameAvailability() {
    const input = document.getElementById("reg-username");
    if (!input) return;
    const u = input.value?.trim() || "";
    if (u.length < 3) {
        setRegUsernameAvailabilityState("idle");
        return;
    }
    try {
        const res = await fetch(`/api/auth/username-available?username=${encodeURIComponent(u)}`);
        const data = await res.json().catch(() => ({}));
        if (data.available) {
            setRegUsernameAvailabilityState("available");
        } else {
            setRegUsernameAvailabilityState("error", data.message || "Bu kullanıcı adı kullanılamaz.");
        }
    } catch {
        setRegUsernameAvailabilityState("idle");
    }
}

function syncExpEndFieldForRow(row) {
    if (!row) return;
    const cur = row.querySelector(".js-exp-current");
    const end = row.querySelector(".js-exp-end");
    if (!end) return;
    if (cur?.checked) {
        end.value = "";
        end.disabled = true;
        end.removeAttribute("required");
        end.placeholder = "Devam ediyor";
    } else {
        end.disabled = false;
        end.removeAttribute("required");
        end.placeholder = "Boş bırakılabilir";
    }
}

function wireExpCurrentToggle(container) {
    container?.querySelectorAll('[data-emp-entry="exp"]').forEach((row) => {
        syncExpEndFieldForRow(row);
        const cur = row.querySelector(".js-exp-current");
        if (cur && !cur.dataset.endWired) {
            cur.dataset.endWired = "1";
            cur.addEventListener("change", () => syncExpEndFieldForRow(row));
        }
    });
}
