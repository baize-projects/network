import { CloudflareClient } from "./services/cloudflare/cloudflare-client.js";
import { AnalyticsService } from "./services/cloudflare/analytics-service.js";
import { AutomationService } from "./services/cloudflare/automation-service.js";
import { CacheSettingsService } from "./services/cloudflare/cache-settings-service.js";
import { CertificatesService } from "./services/cloudflare/certificates-service.js";
import { DnsRecordsService } from "./services/cloudflare/dns-records-service.js";
import { DeveloperResourcesService } from "./services/cloudflare/developer-resources-service.js";
import { FirewallRulesService } from "./services/cloudflare/firewall-rules-service.js";
import { CloudflareAccountService } from "./services/cloudflare-account-service.js";
import { CredentialSessionService } from "./services/credential-session-service.js";
import { OperationHistoryService } from "./services/operation-history-service.js";
import { PanelAuthService } from "./services/panel-auth-service.js";
import { PageRulesService } from "./services/cloudflare/page-rules-service.js";
import { PersistentSecretService } from "./services/persistent-secret-service.js";
import { RateLimiterService } from "./services/rate-limiter-service.js";
import { SpeedDeployService } from "./services/cloudflare/speed-deploy-service.js";
import { SetupGuardService } from "./services/setup-guard-service.js";
import { SqliteStore } from "./services/sqlite-store.js";
import { SslSettingsService } from "./services/cloudflare/ssl-settings-service.js";
import { WorkersService } from "./services/cloudflare/workers-service.js";
import { ZonesService } from "./services/cloudflare/zones-service.js";
import { AnalyticsController } from "./controllers/analytics-controller.js";
import { AutomationController } from "./controllers/automation-controller.js";
import { CacheSettingsController } from "./controllers/cache-settings-controller.js";
import { CertificatesController } from "./controllers/certificates-controller.js";
import { CredentialsController } from "./controllers/credentials-controller.js";
import { DeveloperResourcesController } from "./controllers/developer-resources-controller.js";
import { DnsRecordsController } from "./controllers/dns-records-controller.js";
import { FirewallRulesController } from "./controllers/firewall-rules-controller.js";
import { OperationHistoryController } from "./controllers/operation-history-controller.js";
import { PageRulesController } from "./controllers/page-rules-controller.js";
import { SpeedDeployController } from "./controllers/speed-deploy-controller.js";
import { SslSettingsController } from "./controllers/ssl-settings-controller.js";
import { WorkersController } from "./controllers/workers-controller.js";
import { ZonesController } from "./controllers/zones-controller.js";
import { createApp } from "./app.js";

export function createContainer(config) {
  const persistentSecretService = new PersistentSecretService({
    externalSecret: config.database.secretKey,
    externalSecretPath: config.database.secretKeyFile,
    secretPath: config.database.secretPath,
  });
  const sqliteStore = new SqliteStore({
    databasePath: config.database.path,
    secretKey: persistentSecretService.readOrCreate(),
  });
  const cloudflareAccountService = new CloudflareAccountService({
    store: sqliteStore,
  });
  const cloudflareClient = new CloudflareClient({
    apiBaseUrl: config.cloudflare.apiBaseUrl,
    email: "",
    globalApiKey: "",
    requestTimeoutMs: config.cloudflare.requestTimeoutMs,
  });
  const zonesService = new ZonesService({
    cloudflareClient,
    perPage: config.cloudflare.zonesPerPage,
  });
  const analyticsService = new AnalyticsService({
    cloudflareClient,
  });
  const dnsRecordsService = new DnsRecordsService({
    cloudflareClient,
  });
  const developerResourcesService = new DeveloperResourcesService({
    cloudflareClient,
  });
  const cacheSettingsService = new CacheSettingsService({
    cloudflareClient,
  });
  const certificatesService = new CertificatesService({
    cloudflareClient,
  });
  const firewallRulesService = new FirewallRulesService({
    cloudflareClient,
  });
  const pageRulesService = new PageRulesService({
    cloudflareClient,
  });
  const speedDeployService = new SpeedDeployService({
    cloudflareClient,
    dnsRecordsService,
  });
  const sslSettingsService = new SslSettingsService({
    cloudflareClient,
  });
  const automationService = new AutomationService({
    cloudflareClient,
    dnsRecordsService,
  });
  const workersService = new WorkersService({
    cloudflareClient,
    dnsRecordsService,
  });
  const credentialSessionService = new CredentialSessionService({
    publicOrigin: config.server.publicOrigin,
    secureCookies: config.server.secureCookies,
    trustProxyHeaders: config.server.trustProxyHeaders,
    ttlDays: config.session.ttlDays,
  });
  const operationHistoryService = new OperationHistoryService();
  const panelAuthService = new PanelAuthService({
    store: sqliteStore,
  });
  const setupGuardService = new SetupGuardService({
    token: config.security.setupToken,
    tokenPath: config.security.setupTokenPath,
  });
  const authRateLimiter = new RateLimiterService({
    limit: config.security.rateLimitAttempts,
    windowMs: config.security.rateLimitWindowMs,
  });
  const analyticsController = new AnalyticsController({ analyticsService });
  const automationController = new AutomationController({ automationService });
  const certificatesController = new CertificatesController({ certificatesService });
  const zonesController = new ZonesController({ zonesService });
  const dnsRecordsController = new DnsRecordsController({ dnsRecordsService });
  const cacheSettingsController = new CacheSettingsController({ cacheSettingsService });
  const credentialsController = new CredentialsController({
    authRateLimiter,
    cloudflareAccountService,
    cloudflareClient,
    credentialSessionService,
    panelAuthService,
    setupGuardService,
  });
  const developerResourcesController = new DeveloperResourcesController({
    developerResourcesService,
    d1SqlConsoleAllowMutations: config.features.d1SqlConsoleAllowMutations,
    d1SqlConsoleEnabled: config.features.d1SqlConsoleEnabled,
  });
  const firewallRulesController = new FirewallRulesController({ firewallRulesService });
  const operationHistoryController = new OperationHistoryController({
    operationHistoryService,
  });
  const pageRulesController = new PageRulesController({ pageRulesService });
  const speedDeployController = new SpeedDeployController({ speedDeployService });
  const sslSettingsController = new SslSettingsController({ sslSettingsService });
  const workersController = new WorkersController({ workersService });

  return {
    app: createApp({
      analyticsController,
      automationController,
      cacheSettingsController,
      certificatesController,
      cloudflareAccountService,
      cloudflareClient,
      credentialsController,
      credentialSessionService,
      developerResourcesController,
      dnsRecordsController,
      firewallRulesController,
      operationHistoryController,
      operationHistoryService,
      pageRulesController,
      panelAuthService,
      publicOrigin: config.server.publicOrigin,
      setupGuardService,
      speedDeployController,
      sslSettingsController,
      trustProxyHeaders: config.server.trustProxyHeaders,
      workersController,
      zonesController,
    }),
    analyticsController,
    analyticsService,
    automationController,
    automationService,
    cacheSettingsController,
    cacheSettingsService,
    certificatesController,
    certificatesService,
    cloudflareAccountService,
    cloudflareClient,
    credentialSessionService,
    credentialsController,
    developerResourcesController,
    developerResourcesService,
    dnsRecordsController,
    dnsRecordsService,
    firewallRulesController,
    firewallRulesService,
    operationHistoryController,
    operationHistoryService,
    pageRulesController,
    pageRulesService,
    panelAuthService,
    persistentSecretService,
    setupGuardService,
    sqliteStore,
    speedDeployController,
    speedDeployService,
    sslSettingsController,
    sslSettingsService,
    workersController,
    workersService,
    zonesController,
    zonesService,
  };
}
