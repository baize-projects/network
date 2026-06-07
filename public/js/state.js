import {
  defaultDnsForm,
  defaultFirewallForm,
  defaultPageRuleForm,
  defaultSpeedForm,
} from "./constants.js";

export const state = {
  checkingSession: true,
  connectingSession: false,
  selectingCloudflareAccount: false,
  connected: false,
  sessionAuthenticated: false,
  sessionEmail: "",
  sessionHasServerCredentials: false,
  sessionExpiresAt: "",
  sessionSource: "",
  csrfToken: "",
  sessionError: "",
  loginRequired: false,
  setupRequired: false,
  setupLoadingSecret: false,
  setupLoginSubmitting: false,
  setupSubmitting: false,
  setupSecret: "",
  setupOtpAuthUrl: "",
  setupToken: "",
  setupStep: "admin",
  setupCloudflareAccounts: [
    { cloudflareName: "主账号", cfEmail: "", cfApiKey: "" },
    { cloudflareName: "备用账号", cfEmail: "", cfApiKey: "" },
    { cloudflareName: "第三账号", cfEmail: "", cfApiKey: "" },
  ],
  cloudflareAccounts: [],
  activeCloudflareAccount: null,
  activeCloudflareAccountId: "",
  mainSection: "domain",
  view: "domains",
  zoneSection: "dns",
  zones: [],
  selectedZone: null,
  analytics: null,
  analyticsRange: "7d",
  analyticsStartDate: "",
  analyticsEndDate: "",
  pageRules: [],
  sslSettings: null,
  sslWarnings: [],
  customCertificates: [],
  originCertificates: [],
  originCertificateCreated: null,
  universalSsl: null,
  certificateWarnings: [],
  dnsRecords: [],
  cacheSettings: null,
  cacheWarnings: [],
  firewallRules: [],
  firewallRulesets: null,
  firewallWarnings: [],
  loadingZones: true,
  loadingAnalytics: false,
  loadingPageRules: false,
  loadingSslSettings: false,
  loadingCertificates: false,
  loadingDns: false,
  loadingCacheSettings: false,
  loadingFirewallRules: false,
  addingDomain: false,
  domainDraft: "",
  zoneError: "",
  analyticsError: "",
  pageRulesError: "",
  sslError: "",
  certificateError: "",
  dnsError: "",
  cacheError: "",
  firewallError: "",
  notice: "",
  dnsFormOpen: false,
  dnsBulkFormOpen: false,
  dnsBulkText: "",
  selectedDnsRecordIds: [],
  savingDns: false,
  savingDnsBulk: false,
  deletingDnsBulk: false,
  savingCacheSettings: false,
  savingSslSettings: false,
  savingCertificate: false,
  purgingCache: false,
  savingFirewallRule: false,
  savingRulesetRule: false,
  savingPageRule: false,
  deletingFirewallRuleId: "",
  deletingPageRuleId: "",
  deletingCertificateId: "",
  updatingFirewallRuleId: "",
  updatingPageRuleId: "",
  editingFirewallRuleId: "",
  editingPageRuleId: "",
  showFirewallExamples: false,
  dnsForm: { ...defaultDnsForm },
  firewallForm: { ...defaultFirewallForm },
  pageRuleForm: { ...defaultPageRuleForm },
  speedStep: "domains",
  speedProgress: 0,
  speedDeploying: false,
  speedDomainsOpen: false,
  speedDomainDeleteId: "",
  speedDomainsLoading: false,
  speedNotice: "",
  speedForm: { ...defaultSpeedForm },
  speedAcceleratedDomains: [],
  automationZoneId: "",
  automationPreset: "",
  automationState: null,
  automationLoading: false,
  automationApplying: false,
  automationNotice: "",
  automationPendingKey: "",
  workersAccountId: "",
  workersAccounts: [],
  workersList: [],
  workersDomains: [],
  workersWarnings: [],
  workersLoading: false,
  workersLoaded: false,
  workersNotice: "",
  workersModal: "",
  workersActiveName: "",
  workersActiveTab: "code",
  workersActiveDetail: null,
  workersScript: "",
  workersLoadingDetail: false,
  workersSaving: false,
  workersPendingKey: "",
  workersRouteZoneId: "",
  workersRoutes: [],
  workersRoutesLoading: false,
  workersDomainZoneId: "",
  workersPreferredZoneId: "",
  workersPreferredPattern: "",
  workersPreferredHostname: "saas.sin.fan",
  workersBindingFormOpen: false,
  workersCronDraft: "",
  workersSecretDraftName: "",
  workersTailInfo: null,
  workersDeleteName: "",
  workersDeleteConfirm: "",
  developerResourceType: "",
  developerResourceAccountId: "",
  developerResourceAccounts: [],
  developerResourceItems: [],
  developerResourceActiveId: "",
  developerResourceDetail: null,
  developerResourceDetailLoading: false,
  developerResourceDetailNotice: "",
  developerResourceSqlDraft: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
  developerResourceKvKey: "",
  developerResourceKvValue: "",
  developerResourceR2Key: "",
  developerResourceR2Content: "",
  developerResourceTunnelToken: null,
  developerResourceLoading: false,
  developerResourceLoadedType: "",
  developerResourceNotice: "",
  developerResourceSaving: false,
  developerResourceModal: "",
  developerResourceDeleteId: "",
  developerResourceDeleteName: "",
  developerResourceDeleteConfirm: "",
  workerTemplates: [],
  workerTemplateModal: "",
  workerTemplateNotice: "",
  operationHistory: [],
  operationHistoryFilters: {
    modules: [],
    statuses: [],
  },
  operationHistoryLoading: false,
  operationHistoryNotice: "",
  operationHistoryModule: "",
  operationHistoryStatus: "",
  operationHistoryLimit: "80",
};

export function resetSessionState() {
  state.connected = false;
  state.sessionAuthenticated = false;
  state.sessionError = "";
  state.sessionExpiresAt = "";
  state.sessionSource = "";
  state.csrfToken = "";
  state.sessionEmail = "";
  state.sessionHasServerCredentials = false;
  state.loginRequired = false;
  state.setupRequired = false;
  state.setupLoadingSecret = false;
  state.setupLoginSubmitting = false;
  state.setupSubmitting = false;
  state.setupSecret = "";
  state.setupOtpAuthUrl = "";
  state.setupToken = "";
  state.setupStep = "admin";
  state.setupCloudflareAccounts = [
    { cloudflareName: "主账号", cfEmail: "", cfApiKey: "" },
    { cloudflareName: "备用账号", cfEmail: "", cfApiKey: "" },
    { cloudflareName: "第三账号", cfEmail: "", cfApiKey: "" },
  ];
  state.cloudflareAccounts = [];
  state.activeCloudflareAccount = null;
  state.activeCloudflareAccountId = "";
  state.selectingCloudflareAccount = false;
  resetCloudflareAccountData();
}

export function resetCloudflareAccountData() {
  state.mainSection = "domain";
  state.view = "domains";
  state.zoneSection = "dns";
  state.selectedZone = null;
  state.zones = [];
  state.analytics = null;
  state.analyticsRange = "7d";
  state.analyticsStartDate = "";
  state.analyticsEndDate = "";
  state.pageRules = [];
  state.sslSettings = null;
  state.sslWarnings = [];
  state.customCertificates = [];
  state.originCertificates = [];
  state.originCertificateCreated = null;
  state.universalSsl = null;
  state.certificateWarnings = [];
  state.dnsRecords = [];
  state.cacheSettings = null;
  state.cacheWarnings = [];
  state.firewallRules = [];
  state.firewallRulesets = null;
  state.firewallWarnings = [];
  state.loadingZones = true;
  state.loadingAnalytics = false;
  state.loadingPageRules = false;
  state.loadingSslSettings = false;
  state.loadingCertificates = false;
  state.loadingDns = false;
  state.loadingCacheSettings = false;
  state.loadingFirewallRules = false;
  state.addingDomain = false;
  state.domainDraft = "";
  state.zoneError = "";
  state.analyticsError = "";
  state.pageRulesError = "";
  state.sslError = "";
  state.certificateError = "";
  state.dnsError = "";
  state.cacheError = "";
  state.firewallError = "";
  state.notice = "";
  state.dnsFormOpen = false;
  state.dnsBulkFormOpen = false;
  state.dnsBulkText = "";
  state.selectedDnsRecordIds = [];
  state.savingDns = false;
  state.savingDnsBulk = false;
  state.deletingDnsBulk = false;
  state.savingCacheSettings = false;
  state.savingSslSettings = false;
  state.savingCertificate = false;
  state.purgingCache = false;
  state.savingFirewallRule = false;
  state.savingRulesetRule = false;
  state.savingPageRule = false;
  state.deletingFirewallRuleId = "";
  state.deletingPageRuleId = "";
  state.deletingCertificateId = "";
  state.updatingFirewallRuleId = "";
  state.updatingPageRuleId = "";
  resetDnsForm();
  resetFirewallForm();
  resetPageRuleForm();
  resetSpeedState();
  resetAutomationState();
  resetWorkersState();
  resetDeveloperResourcesState();
  resetOperationHistoryState();
}

export function resetDnsForm() {
  state.dnsForm = { ...defaultDnsForm };
  state.dnsFormOpen = false;
}

export function resetDnsBulkForm() {
  state.dnsBulkFormOpen = false;
  state.dnsBulkText = "";
}

export function resetFirewallForm() {
  state.firewallForm = { ...defaultFirewallForm };
  state.editingFirewallRuleId = "";
  state.showFirewallExamples = false;
}

export function resetPageRuleForm() {
  state.pageRuleForm = { ...defaultPageRuleForm };
  state.editingPageRuleId = "";
}

export function resetSpeedForm() {
  state.speedForm = { ...defaultSpeedForm };
  state.speedProgress = 0;
  state.speedNotice = "";
}

export function resetSpeedState() {
  resetSpeedForm();
  state.speedStep = "domains";
  state.speedDeploying = false;
  state.speedDomainsOpen = false;
  state.speedDomainDeleteId = "";
  state.speedAcceleratedDomains = [];
}

export function resetAutomationState() {
  state.automationZoneId = "";
  state.automationPreset = "";
  state.automationState = null;
  state.automationLoading = false;
  state.automationApplying = false;
  state.automationNotice = "";
  state.automationPendingKey = "";
}

export function resetWorkersState() {
  state.workersAccountId = "";
  state.workersAccounts = [];
  state.workersList = [];
  state.workersDomains = [];
  state.workersWarnings = [];
  state.workersLoading = false;
  state.workersLoaded = false;
  state.workersNotice = "";
  state.workersModal = "";
  state.workersActiveName = "";
  state.workersActiveTab = "code";
  state.workersActiveDetail = null;
  state.workersScript = "";
  state.workersLoadingDetail = false;
  state.workersSaving = false;
  state.workersPendingKey = "";
  state.workersRouteZoneId = "";
  state.workersRoutes = [];
  state.workersRoutesLoading = false;
  state.workersDomainZoneId = "";
  state.workersPreferredZoneId = "";
  state.workersPreferredPattern = "";
  state.workersPreferredHostname = "saas.sin.fan";
  state.workersBindingFormOpen = false;
  state.workersCronDraft = "";
  state.workersSecretDraftName = "";
  state.workersTailInfo = null;
  state.workersDeleteName = "";
  state.workersDeleteConfirm = "";
}

export function resetDeveloperResourcesState() {
  state.developerResourceType = "";
  state.developerResourceAccountId = "";
  state.developerResourceAccounts = [];
  state.developerResourceItems = [];
  state.developerResourceActiveId = "";
  state.developerResourceDetail = null;
  state.developerResourceDetailLoading = false;
  state.developerResourceDetailNotice = "";
  state.developerResourceSqlDraft = "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;";
  state.developerResourceKvKey = "";
  state.developerResourceKvValue = "";
  state.developerResourceR2Key = "";
  state.developerResourceR2Content = "";
  state.developerResourceTunnelToken = null;
  state.developerResourceLoading = false;
  state.developerResourceLoadedType = "";
  state.developerResourceNotice = "";
  state.developerResourceSaving = false;
  state.developerResourceModal = "";
  state.developerResourceDeleteId = "";
  state.developerResourceDeleteName = "";
  state.developerResourceDeleteConfirm = "";
  state.workerTemplates = [];
  state.workerTemplateModal = "";
  state.workerTemplateNotice = "";
}

export function resetOperationHistoryState() {
  state.operationHistory = [];
  state.operationHistoryFilters = {
    modules: [],
    statuses: [],
  };
  state.operationHistoryLoading = false;
  state.operationHistoryNotice = "";
  state.operationHistoryModule = "";
  state.operationHistoryStatus = "";
  state.operationHistoryLimit = "80";
}
