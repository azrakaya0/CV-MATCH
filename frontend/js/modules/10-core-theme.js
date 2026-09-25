function getThemePreference() {

    return localStorage.getItem(AUTH_THEME_KEY) || "dark";

}



function resolveTheme(pref) {

    const p = pref || getThemePreference();

    if (p === "system") {

        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

    }

    return p === "light" ? "light" : "dark";

}



/** Kenar çubuğu: şu anki görünüm */

function themePreferenceLabel(pref) {

    const resolved = resolveTheme(pref);

    return resolved === "light" ? "Açık mod" : "Koyu mod";

}



function updateThemeToggleUi(pref) {

    const raw = pref || getThemePreference();

    const resolved = resolveTheme(raw);

    const icon = document.getElementById("sidebar-theme-icon");

    const label = document.getElementById("sidebar-theme-label");

    if (icon) {

        icon.className = resolved === "light" ? "fas fa-sun" : "fas fa-moon";

    }

    if (label) label.textContent = themePreferenceLabel(raw);

    const btn = document.getElementById("sidebar-theme-btn");

    if (btn) {

        const next = resolved === "dark" ? "Açık mod" : "Koyu mod";

        btn.title = `Şu an: ${themePreferenceLabel(raw)}. Tıklayınca: ${next}`;

    }

}



function applyTheme(pref) {

    const p = pref || getThemePreference();

    const resolved = resolveTheme(p);

    document.documentElement.setAttribute("data-theme", resolved);

    const meta = document.querySelector('meta[name="theme-color"]');

    if (meta) meta.content = resolved === "light" ? "#e8eaef" : "#0c0e12";

    updateThemeToggleUi(p);

    const sel = document.getElementById("settings-theme");

    if (sel && sel.value !== p) sel.value = p;

}



function cycleThemePreference() {

    const resolved = resolveTheme(getThemePreference());

    const next = resolved === "dark" ? "light" : "dark";

    localStorage.setItem(AUTH_THEME_KEY, next);

    applyTheme(next);

    showToast(`Görünüm: ${themePreferenceLabel(next)}`, "info");

}



function initTheme() {

    applyTheme(getThemePreference());

    try {

        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {

            if (getThemePreference() === "system") applyTheme("system");

        });

    } catch {

        /* ignore */

    }

}

