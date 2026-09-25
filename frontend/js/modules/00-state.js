

const state = {
    cvs: [],
    jobs: [],
    employeeJobs: [],
    currentPage: "dashboard",
    charts: {},
    applicantsJobId: null,
    editingCvId: null,
    kvkkVersion: "1.1",
    jobBrowseFilter: "all",
    pendingApplyJobId: null,
    jobDeptFilter: "",
    ragScopeAll: true,
    jobBrowseSearch: "",
    applicantsJobsSnapshot: [],
    applicantsJobFilter: "",
    ikJobServerDeptFilter: "",
    adminJobCompanyFilter: "",
    adminJobDeptFilter: "",
    jobsPerPage: 9,
    jobListPage: 0,
    jobsBrowsePage: 0,
    matchPrefillCvId: null,
    matchPrefillJobId: null,
    messagesActiveConvId: null,
    messagesConversations: [],
    employeeApplications: [],
};

const AUTH_TOKEN_KEY = "cvmatch_token";
const AUTH_ROLE_KEY = "cvmatch_role";
const AUTH_USER_KEY = "cvmatch_username";
const AUTH_DISPLAY_NAME_KEY = "cvmatch_display_name";
const AUTH_AVATAR_URL_KEY = "cvmatch_avatar_url";
const AUTH_COMPANY_ACCESS_KEY = "cvmatch_company_access";
const AUTH_DEPARTMENT_LABEL_KEY = "cvmatch_company_department";
const AUTH_MANAGED_COMPANIES_KEY = "cvmatch_managed_companies_json";
const AUTH_ACTIVE_COMPANY_ID_KEY = "cvmatch_active_company_id";
const AUTH_THEME_KEY = "cvmatch_theme";

let notifPollTimer = null;

