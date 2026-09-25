from pathlib import Path

css = Path(__file__).resolve().parents[2] / "css" / "style.css"
append = """

/* —— Tema okunabilirlik + UI iyileştirmeleri —— */
:root {
    --bg-primary: #181c24;
    --bg-secondary: #1e232c;
    --bg-card: #252b36;
    --bg-input: #1a1f28;
    --text-muted: #94a3b8;
}

[data-theme="light"] .tag,
[data-theme="light"] .skill-tags .tag {
    background: rgba(37, 99, 235, 0.12);
    color: #1e40af;
    border-color: rgba(37, 99, 235, 0.28);
}
[data-theme="light"] .tag-lang {
    background: rgba(5, 150, 105, 0.1);
    color: #047857;
    border-color: rgba(5, 150, 105, 0.25);
}

[data-theme="light"] .detail-content,
[data-theme="light"] #detail-modal .modal-panel {
    background: #ffffff;
    color: var(--text-primary);
}
[data-theme="light"] .detail-header,
[data-theme="light"] #detail-modal .modal-header {
    background: #f1f5f9;
    border-bottom: 1px solid var(--border);
}
[data-theme="light"] .detail-header h2,
[data-theme="light"] #detail-modal .modal-header h2 {
    background: none;
    -webkit-text-fill-color: currentColor;
    color: #0f172a;
}
[data-theme="light"] .detail-section h3,
[data-theme="light"] .cv-detail-modal .detail-section h3 {
    color: #334155;
}
[data-theme="light"] .detail-section {
    background: #f8fafc;
    border-color: var(--border);
}

[data-theme="light"] #page-settings label,
[data-theme="light"] #page-settings .settings-card h2 {
    color: #334155;
}
[data-theme="light"] #page-settings .text-muted {
    color: #64748b;
}
[data-theme="light"] #page-settings .btn-secondary {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #cbd5e1;
}
[data-theme="light"] #page-settings .btn-secondary:hover {
    background: #cbd5e1;
}

.reg-tabs-three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
}
.reg-tabs-three .reg-tab {
    font-size: 0.78rem;
    padding: 0.45rem 0.35rem;
}
.reg-mode-hint {
    margin: 0 0 0.75rem;
    padding: 0.55rem 0.65rem;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
}

.job-form-collapsible {
    border: none;
}
.job-form-collapsible > summary {
    list-style: none;
    cursor: pointer;
    padding: 0.15rem 0 0.85rem;
    user-select: none;
}
.job-form-collapsible > summary::-webkit-details-marker {
    display: none;
}
.job-form-summary-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--primary);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
}
.job-form-collapsible[open] > summary {
    margin-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
}
.job-form-collapsible #job-form {
    padding-top: 0.25rem;
}

.messages-ctx-action {
    margin-top: 0.5rem;
    width: 100%;
}
#messages-delete-conv-btn {
    flex-shrink: 0;
}

.modal-actions-row {
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
#detail-modal .modal-panel {
    width: min(640px, 100%);
    max-height: min(88vh, 800px);
}
#detail-modal .detail-section {
    margin-bottom: 1rem;
}
"""

text = css.read_text(encoding="utf-8")
if "Tema okunabilirlik" in text:
    print("css already appended")
else:
    css.write_text(text + append, encoding="utf-8")
    print("css appended")
