function wireSettingsAccordions() {
    const cards = document.querySelectorAll("#page-settings .settings-card");
    cards.forEach((card, idx) => {
        if (card.dataset.accordionWired === "1") return;
        const title = card.querySelector("h2");
        if (!title) return;
        card.dataset.accordionWired = "1";
        card.classList.add("settings-accordion");

        const panel = document.createElement("div");
        panel.className = "settings-accordion-panel";
        let n = title.nextElementSibling;
        while (n) {
            const next = n.nextElementSibling;
            panel.appendChild(n);
            n = next;
        }
        card.appendChild(panel);

        title.classList.add("settings-accordion-head");
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        title.setAttribute("aria-expanded", "false");

        const chevron = document.createElement("i");
        chevron.className = "fas fa-chevron-right settings-accordion-chevron";
        chevron.setAttribute("aria-hidden", "true");
        title.appendChild(chevron);

        panel.classList.add("hidden");

        if (idx === 0) {
            panel.classList.remove("hidden");
            title.setAttribute("aria-expanded", "true");
            chevron.className = "fas fa-chevron-down settings-accordion-chevron";
        }

        const toggle = () => {
            const hidden = panel.classList.toggle("hidden");
            title.setAttribute("aria-expanded", hidden ? "false" : "true");
            chevron.className = `fas fa-chevron-${hidden ? "right" : "down"} settings-accordion-chevron`;
        };
        title.addEventListener("click", toggle);
        title.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
            }
        });
    });
}
