"""Split app.js into ordered script modules (global functions, load order)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app.js"
OUT = ROOT / "modules"

# Explicit overrides (highest priority)
ASSIGN: dict[str, str] = {
    "getThemePreference": "10-core-theme.js",
    "resolveTheme": "10-core-theme.js",
    "updateThemeToggleIcon": "10-core-theme.js",
    "applyTheme": "10-core-theme.js",
    "cycleThemePreference": "10-core-theme.js",
    "initTheme": "10-core-theme.js",
    "getManagedCompaniesFromStorage": "20-core-company.js",
    "setManagedCompaniesList": "20-core-company.js",
    "getActiveCompanyId": "20-core-company.js",
    "syncCompanyTenantFromMe": "20-core-company.js",
    "populateSettingsNewTeamCompanySelect": "20-core-company.js",
    "refreshSidebarCompanySwitch": "20-core-company.js",
    "reloadCurrentCompanyScopedPage": "20-core-company.js",
    "getToken": "30-core-auth.js",
    "getRole": "30-core-auth.js",
    "isCompany": "30-core-auth.js",
    "isAdmin": "30-core-auth.js",
    "isEmployee": "30-core-auth.js",
    "isCompanyHrScope": "30-core-auth.js",
    "buildJobListUrl": "30-core-auth.js",
    "syncCompanyJobDepartmentInput": "30-core-auth.js",
    "isManager": "30-core-auth.js",
    "authHeaders": "30-core-auth.js",
    "setSession": "30-core-auth.js",
    "clearSession": "30-core-auth.js",
    "cvListLabel": "30-core-auth.js",
    "refreshSidebarAvatar": "30-core-auth.js",
    "applyRoleUI": "30-core-auth.js",
    "updateDashboardQuickStartSteps": "30-core-auth.js",
    "showAppShell": "30-core-auth.js",
    "showLoginScreen": "30-core-auth.js",
    "api": "40-core-api.js",
    "apiUploadManagerCv": "40-core-api.js",
    "formatDate": "15-utils.js",
    "formatRelativeNotifTime": "15-utils.js",
    "truncate": "15-utils.js",
    "escapeHtml": "15-utils.js",
    "getScoreColor": "15-utils.js",
    "renderPaginationBar": "15-utils.js",
    "showToast": "50-ui-feedback.js",
    "hideToast": "50-ui-feedback.js",
    "showLoading": "50-ui-feedback.js",
    "hideLoading": "50-ui-feedback.js",
    "isLocalDevHost": "50-ui-feedback.js",
    "emptyStateHtml": "50-ui-feedback.js",
    "messageSenderLabel": "50-ui-feedback.js",
    "renderMessageBubbleHtml": "50-ui-feedback.js",
    "setMessagesThreadOpen": "50-ui-feedback.js",
    "setupGlobalKeyboardShortcuts": "50-ui-feedback.js",
    "applyDevOnlyUi": "50-ui-feedback.js",
    "renderDashboardAlerts": "50-ui-feedback.js",
    "launchConfetti": "50-ui-feedback.js",
    "openDetailModal": "55-ui-modals.js",
    "closeDetailModal": "55-ui-modals.js",
    "stopNotificationPolling": "60-notifications.js",
    "refreshNotificationBadge": "60-notifications.js",
    "startNotificationPolling": "60-notifications.js",
    "positionNotifDropdown": "60-notifications.js",
    "closeNotifDropdown": "60-notifications.js",
    "notifRowIconClass": "60-notifications.js",
    "openNotificationsPanel": "60-notifications.js",
    "toggleNotifDropdown": "60-notifications.js",
    "updateSettingsAvatarPreview": "65-settings-ui.js",
    "uploadSettingsAvatar": "65-settings-ui.js",
    "stopCameraStream": "65-settings-ui.js",
    "closeCameraModal": "65-settings-ui.js",
    "openCameraModal": "65-settings-ui.js",
    "captureAvatarFromCamera": "65-settings-ui.js",
    "messagesWsUrl": "70-messages.js",
    "disconnectMessagesWs": "70-messages.js",
    "connectMessagesWs": "70-messages.js",
    "onRealtimeMessage": "70-messages.js",
    "refreshMessagesBadge": "70-messages.js",
    "appendChatMessage": "70-messages.js",
    "loadJobCompanyPreview": "70-messages.js",
    "openChatWithApplicant": "70-messages.js",
    "openChatWithCompany": "70-messages.js",
    "loadMessagesPage": "70-messages.js",
    "populateNewChatContacts": "70-messages.js",
    "openMessagesConversation": "70-messages.js",
    "sendCurrentMessage": "70-messages.js",
    "navigate": "94-router.js",
    "initApp": "99-init.js",
}

# Inclusive ranges by first/last function name (file order in app.js)
RANGE_RULES: list[tuple[str, str, str]] = [
    ("81-employee.js", "cloneEmpTemplate", "withdrawJobApplication"),
    ("82-settings.js", "loadSettingsPage", "openKvkkFullDocumentModal"),
    ("83-jobs-employee.js", "wireJobsBrowseFilterTabs", "submitJobApplication"),
    ("84-applicants-admin.js", "wireCompanyArchiveDetails", "adminLoadJobsPreview"),
    ("85-auth-session.js", "tryRestoreSession", "onRegisterSubmit"),
    ("86-dashboard.js", "loadDashboard", "renderTopSkillsChart"),
    ("87-cv.js", "loadCVs", "handleCVUpload"),
    ("88-jobs-company.js", "prefillJobCompanyField", "renderEmployeeApplicationsTableHtml"),
    ("89-jobs-detail.js", "setupTagInput", "deleteJob"),
    ("90-match.js", "refreshMatchCvSelect", "renderScoreBar"),
    ("91-compare.js", "refreshCompareCvCheckboxes", "createRadarChart"),
    ("92-rag.js", "_ragStorageKey", "formatRagAnswer"),
    ("93-activity-kvkk.js", "_findCvIdByName", "acceptKvkkReconsent"),
]

DEFAULT = "80-misc.js"


def module_for(name: str, order: list[str]) -> str:
    if name in ASSIGN:
        return ASSIGN[name]
    idx = order.index(name)
    for mod, start, end in RANGE_RULES:
        si, ei = order.index(start), order.index(end)
        if si <= idx <= ei:
            return mod
    return DEFAULT


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    first_fn = re.search(r"^function getThemePreference", text, re.M)
    header = text[: first_fn.start() if first_fn else 0]

    pat = re.compile(r"^(async )?function (\w+)", re.M)
    matches = list(pat.finditer(text))
    order = [m.group(2) for m in matches]
    spans: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        name = m.group(2)
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        spans.append((name, text[start:end]))

    buckets: dict[str, list[str]] = {"00-state.js": [header]}
    for name, chunk in spans:
        mod = module_for(name, order)
        buckets.setdefault(mod, []).append(chunk)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.js"):
        old.unlink()
    for mod in sorted(buckets.keys()):
        body = "".join(buckets[mod])
        (OUT / mod).write_text(body, encoding="utf-8")
        print(f"{mod}: {len(body.splitlines())} lines")

    (OUT / "manifest.txt").write_text("\n".join(sorted(buckets.keys())), encoding="utf-8")


if __name__ == "__main__":
    main()
