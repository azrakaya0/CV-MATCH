function cloneEmpTemplate(templateId, listId) {
    const t = document.getElementById(templateId);
    const list = document.getElementById(listId);
    if (!t || !list) return;
    list.appendChild(t.content.cloneNode(true));
}

function initDefaultEmployeeCvRows() {
    if (document.getElementById("emp-exp-list")?.children.length === 0) {
        cloneEmpTemplate("emp-exp-template", "emp-exp-list");
    }
    if (document.getElementById("emp-edu-list")?.children.length === 0) {
        cloneEmpTemplate("emp-edu-template", "emp-edu-list");
    }
    if (document.getElementById("emp-lang-list")?.children.length === 0) {
        cloneEmpTemplate("emp-lang-template", "emp-lang-list");
    }
}

function initEmployeeCvFormUI() {
    const form = document.getElementById("employee-cv-form");
    if (!form) return;
    initDefaultEmployeeCvRows();
    form.addEventListener("click", (e) => {
        if (e.target.closest(".emp-add-exp")) {
            e.preventDefault();
            cloneEmpTemplate("emp-exp-template", "emp-exp-list");
            wireExpCurrentToggle(document.getElementById("emp-exp-list"));
        }
        if (e.target.closest(".emp-add-edu")) {
            e.preventDefault();
            cloneEmpTemplate("emp-edu-template", "emp-edu-list");
        }
        if (e.target.closest(".emp-add-lang")) {
            e.preventDefault();
            cloneEmpTemplate("emp-lang-template", "emp-lang-list");
        }
        if (e.target.closest(".emp-add-ref")) {
            e.preventDefault();
            cloneEmpTemplate("emp-ref-template", "emp-ref-list");
        }
        if (e.target.closest(".emp-remove-entry")) {
            e.preventDefault();
            const card = e.target.closest("[data-emp-entry]");
            const kind = card?.dataset.empEntry;
            if (!card || !kind) return;
            const listId =
                kind === "exp"
                    ? "emp-exp-list"
                    : kind === "edu"
                      ? "emp-edu-list"
                      : kind === "ref"
                        ? "emp-ref-list"
                        : "emp-lang-list";
            const list = document.getElementById(listId);
            if (!list) return;
            const same = list.querySelectorAll(`[data-emp-entry="${kind}"]`);
            if (same.length <= 1) return;
            card.remove();
        }
    });
    wireExpCurrentToggle(document.getElementById("emp-exp-list"));
}

function collectEmployeeCvPayload() {
    const experiences = [];
    document.querySelectorAll('#emp-exp-list [data-emp-entry="exp"]').forEach((row) => {
        experiences.push({
            title: row.querySelector(".js-exp-title")?.value?.trim() || "",
            company: row.querySelector(".js-exp-company")?.value?.trim() || "",
            start: row.querySelector(".js-exp-start")?.value?.trim() || "",
            end: row.querySelector(".js-exp-current")?.checked
                ? ""
                : row.querySelector(".js-exp-end")?.value?.trim() || "",
            current: !!row.querySelector(".js-exp-current")?.checked,
            description: row.querySelector(".js-exp-desc")?.value?.trim() || "",
        });
    });
    const educations = [];
    document.querySelectorAll('#emp-edu-list [data-emp-entry="edu"]').forEach((row) => {
        educations.push({
            institution: row.querySelector(".js-edu-inst")?.value?.trim() || "",
            field: row.querySelector(".js-edu-field")?.value?.trim() || "",
            degree: row.querySelector(".js-edu-degree")?.value?.trim() || "",
            year: row.querySelector(".js-edu-year")?.value?.trim() || "",
        });
    });
    const languages = [];
    document.querySelectorAll('#emp-lang-list [data-emp-entry="lang"]').forEach((row) => {
        languages.push({
            name: row.querySelector(".js-lang-name")?.value?.trim() || "",
            level: row.querySelector(".js-lang-level")?.value?.trim() || "",
        });
    });
    return {
        full_name: document.getElementById("emp-full-name")?.value?.trim() || "",
        email: document.getElementById("emp-email")?.value?.trim() || "",
        phone: document.getElementById("emp-phone")?.value?.trim() || "",
        city: document.getElementById("emp-city")?.value?.trim() || "",
        district: document.getElementById("emp-district")?.value?.trim() || "",
        summary: document.getElementById("emp-summary")?.value?.trim() || "",
        experiences,
        educations,
        skills: [...(tagData["emp-skills"] || [])],
        languages,
        references: (() => {
            const refs = [];
            document.querySelectorAll('#emp-ref-list [data-emp-entry="ref"]').forEach((row) => {
                refs.push({
                    name: row.querySelector(".js-ref-name")?.value?.trim() || "",
                    title: row.querySelector(".js-ref-title")?.value?.trim() || "",
                    company: row.querySelector(".js-ref-company")?.value?.trim() || "",
                    phone: row.querySelector(".js-ref-phone")?.value?.trim() || "",
                    email: row.querySelector(".js-ref-email")?.value?.trim() || "",
                });
            });
            return refs;
        })(),
        certifications: [...(tagData["emp-certs"] || [])],
    };
}

function parseCvDuration(duration) {
    const d = (duration || "").trim();
    if (!d) return { start: "", end: "", current: false };
    if (/devam/i.test(d)) {
        const start = d.split(/\s*[—\-–]\s*/)[0]?.trim() || "";
        return { start, end: "", current: true };
    }
    const parts = d.split(/\s*[—\-–]\s*/);
    return {
        start: (parts[0] || "").trim(),
        end: (parts[1] || "").trim(),
        current: false,
    };
}

function fillEmpListFromForm(listId, templateId, items, fillRow) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = "";
    const rows = Array.isArray(items) && items.length ? items : [{}];
    rows.forEach((item) => {
        cloneEmpTemplate(templateId, listId);
        const row = list.lastElementChild;
        if (row) fillRow(row, item);
    });
}

async function loadEmployeeCvIntoForm(cvId) {
    if (!cvId) {
        resetEmployeeCvForm();
        return;
    }
    try {
        showLoading();
        const cv = await api(`/api/cv/${cvId}`);
        const form = cv.employee_form || {};
        const d = cv.data || {};

        document.getElementById("emp-full-name").value =
            form.full_name || d.name || "";
        document.getElementById("emp-email").value = form.email || d.email || "";
        document.getElementById("emp-phone").value = form.phone || d.phone || "";
        const cityEl = document.getElementById("emp-city");
        const distEl = document.getElementById("emp-district");
        if (cityEl) cityEl.value = form.city || d.city || "";
        if (distEl) distEl.value = form.district || d.district || "";
        const sum = document.getElementById("emp-summary");
        if (sum) sum.value = form.summary || "";

        const exps =
            form.experiences?.length
                ? form.experiences
                : (d.experience || []).map((e) => {
                      const p = parseCvDuration(e.duration);
                      return {
                          title: e.title || "",
                          company: e.company || "",
                          start: p.start,
                          end: p.end,
                          current: p.current,
                          description: e.description || "",
                      };
                  });
        fillEmpListFromForm("emp-exp-list", "emp-exp-template", exps, (row, ex) => {
            row.querySelector(".js-exp-title").value = ex.title || "";
            row.querySelector(".js-exp-company").value = ex.company || "";
            row.querySelector(".js-exp-start").value = ex.start || "";
            row.querySelector(".js-exp-end").value = ex.end || "";
            const cur = row.querySelector(".js-exp-current");
            if (cur) cur.checked = !!ex.current;
            row.querySelector(".js-exp-desc").value = ex.description || "";
            syncExpEndFieldForRow(row);
        });

        const edus =
            form.educations?.length
                ? form.educations
                : (d.education || []).map((e) => ({
                      institution: e.institution || "",
                      field: e.field || "",
                      degree: e.degree || "",
                      year: e.year || "",
                  }));
        fillEmpListFromForm("emp-edu-list", "emp-edu-template", edus, (row, ed) => {
            row.querySelector(".js-edu-inst").value = ed.institution || "";
            row.querySelector(".js-edu-field").value = ed.field || "";
            row.querySelector(".js-edu-degree").value = ed.degree || "";
            row.querySelector(".js-edu-year").value = ed.year || "";
        });

        const langs = form.languages?.length
            ? form.languages
            : (d.languages || []).map((l) => {
                  const m = String(l).match(/^(.+?)\s*[\(:]\s*(.+?)\s*\)?$/);
                  return m
                      ? { name: m[1].trim(), level: m[2].trim() }
                      : { name: String(l), level: "" };
              });
        fillEmpListFromForm("emp-lang-list", "emp-lang-template", langs, (row, lg) => {
            row.querySelector(".js-lang-name").value = lg.name || "";
            const sel = row.querySelector(".js-lang-level");
            if (sel && lg.level) sel.value = lg.level;
        });

        const refs = form.references?.length
            ? form.references
            : (d.references || []);
        fillEmpListFromForm("emp-ref-list", "emp-ref-template", refs, (row, rf) => {
            row.querySelector(".js-ref-name").value = rf.name || "";
            row.querySelector(".js-ref-title").value = rf.title || "";
            row.querySelector(".js-ref-company").value = rf.company || "";
            row.querySelector(".js-ref-phone").value = rf.phone || "";
            row.querySelector(".js-ref-email").value = rf.email || "";
        });

        tagData["emp-skills"] = [...(form.skills?.length ? form.skills : d.skills || [])];
        tagData["emp-certs"] = [
            ...(form.certifications?.length ? form.certifications : d.certifications || []),
        ];
        renderTags("emp-skills", "tag-skill");
        renderTags("emp-certs", "tag-skill");

        state.editingCvId = cvId;
        const es = document.getElementById("emp-cv-edit-select");
        if (es) es.value = cvId;
        await renderEmployeeCvAnalysis();
    } catch (e) {
        showToast(e.message || "CV yüklenemedi", "error");
    } finally {
        hideLoading();
    }
}

function resetEmployeeCvForm() {
    document.getElementById("emp-full-name").value = "";
    document.getElementById("emp-email").value = "";
    document.getElementById("emp-phone").value = "";
    const cityEl = document.getElementById("emp-city");
    const distEl = document.getElementById("emp-district");
    if (cityEl) cityEl.value = "";
    if (distEl) distEl.value = "";
    const sum = document.getElementById("emp-summary");
    if (sum) sum.value = "";
    ["emp-exp-list", "emp-edu-list", "emp-lang-list", "emp-ref-list"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });
    initDefaultEmployeeCvRows();
    tagData["emp-skills"] = [];
    tagData["emp-certs"] = [];
    renderTags("emp-skills", "tag-skill");
    renderTags("emp-certs", "tag-skill");
    const kvkk = document.getElementById("emp-kvkk");
    if (kvkk) kvkk.checked = false;
    const pdf = document.getElementById("emp-pdf");
    if (pdf) pdf.value = "";
    state.editingCvId = null;
    const es = document.getElementById("emp-cv-edit-select");
    if (es) es.value = "";
}

async function submitEmployeeCvForm() {
    const kvkk = document.getElementById("emp-kvkk");
    if (!kvkk?.checked) {
        showToast("KVKK onayı zorunludur.", "warning");
        throw new Error("KVKK onayı gerekli");
    }
    const fd = new FormData();
    fd.append("kvkk_accepted", "true");
    fd.append("cv_payload", JSON.stringify(collectEmployeeCvPayload()));
    const pf = document.getElementById("emp-pdf")?.files?.[0];
    if (pf) fd.append("file", pf);

    const editId = state.editingCvId || document.getElementById("emp-cv-edit-select")?.value || "";
    const url = editId ? `/api/cv/employee/${editId}` : "/api/cv/employee-submit";
    const method = editId ? "PUT" : "POST";

    const response = await fetch(url, {
        method,
        headers: authHeaders(),
        body: fd,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Gönderim başarısız" }));
        const msg = typeof error.detail === "string" ? error.detail : "Gönderim başarısız";
        throw new Error(msg);
    }
    return response.json();
}

async function renderEmployeeCvAnalysis() {
    const wrap = document.getElementById("emp-cv-analysis");
    if (!wrap || !isEmployee()) return;
    const sel = document.getElementById("emp-cv-edit-select");
    const id = state.editingCvId || sel?.value || "";
    if (!id) {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
        return;
    }
    try {
        wrap.classList.remove("hidden");
        wrap.innerHTML = `<p class="text-muted emp-cv-analysis-loading"><i class="fas fa-spinner fa-spin"></i> Yükleniyor…</p>`;
        const cv = await api(`/api/cv/${id}`);
        const d = cv.data || {};
        const skills = (d.skills || []).filter(Boolean).slice(0, 24);
        const ex = (d.experience || []).slice(0, 5);
        const ed = (d.education || []).slice(0, 4);
        const langs = (d.languages || []).filter(Boolean);
        const did = cv.display_id != null ? `CV #${cv.display_id}` : escapeHtml(cv.filename || id);

        const skillHtml = skills.length
            ? `<div class="emp-cv-analysis-skills">${skills.map((s) => `<span class="tag tag-skill">${escapeHtml(String(s))}</span>`).join("")}</div>`
            : "<p class=\"text-muted\">Beceri yok</p>";

        const exHtml =
            ex.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>İş deneyimi</h4><ul class="emp-cv-analysis-list">${ex
                      .map((e) => {
                          const head = [e.title, e.company].filter(Boolean).join(" · ");
                          const sub = [e.duration, e.description].filter(Boolean).join(" — ");
                          if (!head && !sub) return "";
                          return `<li><strong>${escapeHtml(head || "—")}</strong>${sub ? `<br><span class="text-muted">${escapeHtml(sub)}</span>` : ""}</li>`;
                      })
                      .filter(Boolean)
                      .join("")}</ul></div>`;

        const edHtml =
            ed.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>Eğitim</h4><ul class="emp-cv-analysis-list">${ed
                      .map((u) => {
                          const line = [u.institution, u.field, u.degree, u.year].filter(Boolean).join(" · ");
                          return line ? `<li>${escapeHtml(line)}</li>` : "";
                      })
                      .filter(Boolean)
                      .join("")}</ul></div>`;

        const langHtml =
            langs.length === 0
                ? ""
                : `<div class="emp-cv-analysis-block"><h4>Diller</h4><p>${langs.map((l) => escapeHtml(String(l))).join(", ")}</p></div>`;

        wrap.innerHTML = `
            <div class="emp-cv-analysis-head">
                <h3><i class="fas fa-microscope"></i> Otomatik analiz</h3>
                <span class="emp-cv-analysis-id">${did}</span>
            </div>
            <div class="emp-cv-analysis-block"><h4>Beceriler</h4>${skillHtml}</div>
            ${exHtml}
            ${edHtml}
            ${langHtml}
        `;
    } catch {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
    }
}

async function loadEmployeeCvPage() {
    if (!isEmployee()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const sel = document.getElementById("emp-cv-edit-select");
    if (!sel) return;
    try {
        const cvs = await api("/api/cv/list");
        const cur = state.editingCvId || "";
        sel.innerHTML =
            '<option value="">— Yeni CV oluştur —</option>' +
            cvs.map((c) => `<option value="${c.id}">${escapeHtml(cvListLabel(c))}</option>`).join("");
        sel.value = cur && cvs.some((c) => c.id === cur) ? cur : "";
        if (!sel.value) state.editingCvId = null;
        sel.onchange = () => {
            const id = sel.value || "";
            state.editingCvId = id || null;
            if (id) void loadEmployeeCvIntoForm(id);
            else {
                resetEmployeeCvForm();
                renderEmployeeCvAnalysis();
            }
        };
    } catch {
        sel.innerHTML = '<option value="">—</option>';
    }
    await updateKvkkRevokedBanner();
    if (state.editingCvId) {
        await loadEmployeeCvIntoForm(state.editingCvId);
    } else {
        await renderEmployeeCvAnalysis();
    }
}

async function loadEmployeeApplicationsPage() {
    if (!isEmployee()) {
        navigate(isAdmin() ? "admin" : "dashboard");
        return;
    }
    const body = document.getElementById("employee-applications-body");
    if (!body) return;
    body.innerHTML = '<p class="text-muted">Yükleniyor…</p>';
    try {
        const [my, cvs] = await Promise.all([
            api("/api/applications/my"),
            api("/api/cv/list").catch(() => []),
        ]);
        state.employeeApplications = my;
        const byCv = new Map((Array.isArray(cvs) ? cvs : []).map((c) => [c.id, cvListLabel(c)]));
        if (!my.length) {
            body.innerHTML = '<p class="text-muted">Başvuru yok</p>';
            return;
        }
        body.innerHTML = renderEmployeeApplicationsTableHtml(my, byCv);
        body.querySelectorAll(".app-withdraw-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-app-id");
                if (id) void withdrawJobApplication(id);
            });
        });
        wireEmployeeApplicationTableRows(body, my, byCv);
    } catch {
        body.innerHTML = '<p class="text-muted">Yüklenemedi</p>';
    }
}

async function withdrawJobApplication(applicationId) {
    if (!isEmployee() || !applicationId) return;
    if (!confirm("Bu başvuruyu geri çekmek istiyor musunuz?")) return;
    try {
        showLoading();
        await api(`/api/applications/my/${encodeURIComponent(applicationId)}`, { method: "DELETE" });
        showToast("Başvuru geri çekildi.", "success");
        if (state.currentPage === "jobs-browse") await loadJobsBrowsePage();
        else if (state.currentPage === "employee-applications") await loadEmployeeApplicationsPage();
        if (state.currentPage === "dashboard") await loadDashboard();
    } catch {
        /* toast from api */
    } finally {
        hideLoading();
    }
}

