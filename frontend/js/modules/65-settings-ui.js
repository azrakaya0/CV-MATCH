function updateSettingsAvatarPreview(url) {
    const img = document.getElementById("settings-avatar-preview-img");
    const ic = document.getElementById("settings-avatar-preview-icon");
    if (!img || !ic) return;
    if (url) {
        img.src = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
        img.classList.remove("hidden");
        ic.classList.add("hidden");
    } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        ic.classList.remove("hidden");
    }
}

async function removeSettingsAvatar() {
    showLoading();
    try {
        const res = await fetch("/api/auth/avatar", {
            method: "DELETE",
            headers: authHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = typeof data.detail === "string" ? data.detail : "Silinemedi";
            throw new Error(msg);
        }
        localStorage.removeItem(AUTH_AVATAR_URL_KEY);
        refreshSidebarAvatar();
        updateSettingsAvatarPreview(null);
        const inp = document.getElementById("settings-avatar-input");
        if (inp) inp.value = "";
        const up = document.getElementById("settings-avatar-upload");
        if (up) up.disabled = true;
        showToast("Profil fotoğrafı kaldırıldı.", "success");
    } catch (e) {
        showToast(e.message || "Hata", "error");
    } finally {
        hideLoading();
    }
}

async function uploadSettingsAvatar() {
    const inp = document.getElementById("settings-avatar-input");
    const upBtn = document.getElementById("settings-avatar-upload");
    const f = inp?.files?.[0];
    if (!f) {
        showToast("Dosya seçin.", "warning");
        return;
    }
    showLoading();
    try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/auth/avatar", {
            method: "POST",
            headers: authHeaders(),
            body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg =
                typeof data.detail === "string" ? data.detail : "Yükleme başarısız";
            throw new Error(msg);
        }
        if (data.avatar_url) {
            localStorage.setItem(AUTH_AVATAR_URL_KEY, data.avatar_url);
            refreshSidebarAvatar();
            updateSettingsAvatarPreview(data.avatar_url);
        }
        showToast("Fotoğraf güncellendi.", "success");
        if (inp) inp.value = "";
        if (upBtn) upBtn.disabled = true;
    } catch (e) {
        showToast(e.message || "Hata", "error");
    } finally {
        hideLoading();
    }
}

let _cameraStream = null;

function stopCameraStream() {
    if (_cameraStream) {
        _cameraStream.getTracks().forEach((t) => t.stop());
        _cameraStream = null;
    }
    const video = document.getElementById("camera-preview");
    if (video) video.srcObject = null;
}

function closeCameraModal() {
    stopCameraStream();
    document.getElementById("camera-modal")?.classList.add("hidden");
}

async function openCameraModal() {
    const modal = document.getElementById("camera-modal");
    const video = document.getElementById("camera-preview");
    const captureBtn = document.getElementById("camera-capture-btn");
    const hint = document.getElementById("camera-permission-hint");
    if (!modal || !video) return;
    modal.classList.remove("hidden");
    if (hint) hint.textContent = "Kamera izni isteniyor…";
    if (captureBtn) captureBtn.disabled = true;
    stopCameraStream();
    try {
        _cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
        });
        video.srcObject = _cameraStream;
        if (hint) hint.textContent = "Kadrajı ayarlayıp fotoğraf çekin.";
        if (captureBtn) captureBtn.disabled = false;
    } catch {
        if (hint) hint.textContent = "Kamera açılamadı. Tarayıcı izinlerini kontrol edin veya dosya yükleyin.";
        showToast("Kamera izni gerekli.", "warning");
    }
}

function captureAvatarFromCamera() {
    const video = document.getElementById("camera-preview");
    const canvas = document.getElementById("camera-canvas");
    const inp = document.getElementById("settings-avatar-input");
    const up = document.getElementById("settings-avatar-upload");
    if (!video || !canvas || !inp) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
        (blob) => {
            if (!blob) {
                showToast("Fotoğraf alınamadı.", "error");
                return;
            }
            const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
            const dt = new DataTransfer();
            dt.items.add(file);
            inp.files = dt.files;
            if (up) up.disabled = false;
            closeCameraModal();
            showToast("Fotoğraf hazır — Kaydet ile yükleyin.", "success");
        },
        "image/jpeg",
        0.9
    );
}

