async function api(url, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    if (options.body && typeof options.body === "string") {
        headers["Content-Type"] = "application/json";
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 && getToken()) {
            clearSession();
            showLoginScreen();
            throw new Error("Oturum süresi doldu veya geçersiz. Lütfen tekrar giriş yapın.");
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                detail: "Bir hata oluştu",
            }));
            let msg = "Bir hata oluştu";
            if (typeof error.detail === "string") {
                msg = error.detail;
            } else if (Array.isArray(error.detail) && error.detail.length > 0) {
                msg = error.detail.map(e => e.msg || JSON.stringify(e)).join(", ");
            } else if (typeof error.detail === "object") {
                msg = JSON.stringify(error.detail);
            }
            console.error("API Error:", error);
            throw new Error(msg);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            showToast("Bağlantı hatası", "error");
        } else {
            showToast(error.message, "error");
        }
        throw error;
    }
}

async function apiUploadManagerCv(url, file, kvkkAccepted) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kvkk_accepted", kvkkAccepted ? "true" : "false");

    const response = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
    });

    if (response.status === 401 && getToken()) {
        clearSession();
        showLoginScreen();
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Yükleme başarısız" }));
        const msg = typeof error.detail === "string" ? error.detail : "Yükleme başarısız";
        throw new Error(msg);
    }

    return response.json();
}

