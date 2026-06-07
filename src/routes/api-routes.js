import { sameOriginRequest } from "../lib/request-origin.js";

function matchRoute(method, pathname) {
  const cloudflareAccountSelectMatch = pathname.match(
    /^\/api\/session\/cloudflare-accounts\/(?<accountId>[a-z0-9_-]{1,96})\/select$/i
  );

  if (cloudflareAccountSelectMatch) {
    return {
      key: `${method} /api/session/cloudflare-accounts/:accountId/select`,
      params: cloudflareAccountSelectMatch.groups,
    };
  }

  if (pathname === "/api/workers/queues") {
    return {
      key: `${method} /api/workers/queues`,
      params: {},
    };
  }

  const developerResourcePagesBuildConfigMatch = pathname.match(
    /^\/api\/developer-resources\/pages\/(?<resourceId>[^/]{1,256})\/build-config$/i
  );

  if (developerResourcePagesBuildConfigMatch) {
    return {
      key: `${method} /api/developer-resources/pages/:resourceId/build-config`,
      params: { ...developerResourcePagesBuildConfigMatch.groups, type: "pages" },
    };
  }

  const developerResourceD1QueryMatch = pathname.match(
    /^\/api\/developer-resources\/d1\/(?<resourceId>[^/]{1,256})\/query$/i
  );

  if (developerResourceD1QueryMatch) {
    return {
      key: `${method} /api/developer-resources/d1/:resourceId/query`,
      params: { ...developerResourceD1QueryMatch.groups, type: "d1" },
    };
  }

  const developerResourceR2ObjectMatch = pathname.match(
    /^\/api\/developer-resources\/r2\/(?<resourceId>[^/]{1,256})\/objects$/i
  );

  if (developerResourceR2ObjectMatch) {
    return {
      key: `${method} /api/developer-resources/r2/:resourceId/objects`,
      params: { ...developerResourceR2ObjectMatch.groups, type: "r2" },
    };
  }

  const developerResourceKvValueMatch = pathname.match(
    /^\/api\/developer-resources\/kv\/(?<resourceId>[^/]{1,256})\/values$/i
  );

  if (developerResourceKvValueMatch) {
    return {
      key: `${method} /api/developer-resources/kv/:resourceId/values`,
      params: { ...developerResourceKvValueMatch.groups, type: "kv" },
    };
  }

  const developerResourceTunnelConfigMatch = pathname.match(
    /^\/api\/developer-resources\/tunnels\/(?<resourceId>[^/]{1,256})\/configuration$/i
  );

  if (developerResourceTunnelConfigMatch) {
    return {
      key: `${method} /api/developer-resources/tunnels/:resourceId/configuration`,
      params: { ...developerResourceTunnelConfigMatch.groups, type: "tunnels" },
    };
  }

  const developerResourceTunnelTokenMatch = pathname.match(
    /^\/api\/developer-resources\/tunnels\/(?<resourceId>[^/]{1,256})\/token$/i
  );

  if (developerResourceTunnelTokenMatch) {
    return {
      key: `${method} /api/developer-resources/tunnels/:resourceId/token`,
      params: { ...developerResourceTunnelTokenMatch.groups, type: "tunnels" },
    };
  }

  const developerResourceDetailMatch = pathname.match(
    /^\/api\/developer-resources\/(?<type>pages|d1|r2|kv|tunnels)\/(?<resourceId>[^/]{1,256})\/detail$/i
  );

  if (developerResourceDetailMatch) {
    return {
      key: `${method} /api/developer-resources/:type/:resourceId/detail`,
      params: developerResourceDetailMatch.groups,
    };
  }

  const developerResourceItemMatch = pathname.match(
    /^\/api\/developer-resources\/(?<type>pages|d1|r2|kv|tunnels)\/(?<resourceId>[^/]{1,256})$/i
  );

  if (developerResourceItemMatch) {
    return {
      key: `${method} /api/developer-resources/:type/:resourceId`,
      params: developerResourceItemMatch.groups,
    };
  }

  const developerResourcesMatch = pathname.match(
    /^\/api\/developer-resources\/(?<type>pages|d1|r2|kv|tunnels)$/i
  );

  if (developerResourcesMatch) {
    return {
      key: `${method} /api/developer-resources/:type`,
      params: developerResourcesMatch.groups,
    };
  }

  const workersRouteMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/routes\/(?<routeId>[a-z0-9_-]{1,128})$/i
  );

  if (workersRouteMatch) {
    return {
      key: `${method} /api/workers/:scriptName/routes/:routeId`,
      params: workersRouteMatch.groups,
    };
  }

  const workersSecretMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/secrets\/(?<secretName>[A-Z0-9_]{1,64})$/i
  );

  if (workersSecretMatch) {
    return {
      key: `${method} /api/workers/:scriptName/secrets/:secretName`,
      params: workersSecretMatch.groups,
    };
  }

  const workersSecretsMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/secrets$/i
  );

  if (workersSecretsMatch) {
    return {
      key: `${method} /api/workers/:scriptName/secrets`,
      params: workersSecretsMatch.groups,
    };
  }

  const workersSchedulesMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/schedules$/i
  );

  if (workersSchedulesMatch) {
    return {
      key: `${method} /api/workers/:scriptName/schedules`,
      params: workersSchedulesMatch.groups,
    };
  }

  const workersDeploymentsMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/deployments$/i
  );

  if (workersDeploymentsMatch) {
    return {
      key: `${method} /api/workers/:scriptName/deployments`,
      params: workersDeploymentsMatch.groups,
    };
  }

  const workersTailMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/tail$/i
  );

  if (workersTailMatch) {
    return {
      key: `${method} /api/workers/:scriptName/tail`,
      params: workersTailMatch.groups,
    };
  }

  const workersSettingsMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/settings$/i
  );

  if (workersSettingsMatch) {
    return {
      key: `${method} /api/workers/:scriptName/settings`,
      params: workersSettingsMatch.groups,
    };
  }

  const workersRoutesMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/routes$/i
  );

  if (workersRoutesMatch) {
    return {
      key: `${method} /api/workers/:scriptName/routes`,
      params: workersRoutesMatch.groups,
    };
  }

  const workersPreferredRouteMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/preferred-route$/i
  );

  if (workersPreferredRouteMatch) {
    return {
      key: `${method} /api/workers/:scriptName/preferred-route`,
      params: workersPreferredRouteMatch.groups,
    };
  }

  const workersDomainMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/domains\/(?<domainId>[a-z0-9_-]{1,128})$/i
  );

  if (workersDomainMatch) {
    return {
      key: `${method} /api/workers/:scriptName/domains/:domainId`,
      params: workersDomainMatch.groups,
    };
  }

  const workersDomainsMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/domains$/i
  );

  if (workersDomainsMatch) {
    return {
      key: `${method} /api/workers/:scriptName/domains`,
      params: workersDomainsMatch.groups,
    };
  }

  const workersSubdomainMatch = pathname.match(
    /^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})\/subdomain$/i
  );

  if (workersSubdomainMatch) {
    return {
      key: `${method} /api/workers/:scriptName/subdomain`,
      params: workersSubdomainMatch.groups,
    };
  }

  const workerMatch = pathname.match(/^\/api\/workers\/(?<scriptName>[a-z0-9-]{1,63})$/i);

  if (workerMatch) {
    return {
      key: `${method} /api/workers/:scriptName`,
      params: workerMatch.groups,
    };
  }

  const zoneCustomCertificateMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/certificates\/(?<certificateId>[a-z0-9_-]{1,128})$/i
  );

  if (zoneCustomCertificateMatch) {
    return {
      key: `${method} /api/zones/:zoneId/certificates/:certificateId`,
      params: zoneCustomCertificateMatch.groups,
    };
  }

  const zoneOriginCertificateMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/origin-certificates\/(?<certificateId>[a-z0-9_-]{1,128})$/i
  );

  if (zoneOriginCertificateMatch) {
    return {
      key: `${method} /api/zones/:zoneId/origin-certificates/:certificateId`,
      params: zoneOriginCertificateMatch.groups,
    };
  }

  const zoneOriginCertificatesMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/origin-certificates$/i
  );

  if (zoneOriginCertificatesMatch) {
    return {
      key: `${method} /api/zones/:zoneId/origin-certificates`,
      params: zoneOriginCertificatesMatch.groups,
    };
  }

  const zoneCertificatesMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/certificates$/i
  );

  if (zoneCertificatesMatch) {
    return {
      key: `${method} /api/zones/:zoneId/certificates`,
      params: zoneCertificatesMatch.groups,
    };
  }

  const zonePageRuleMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/page-rules\/(?<ruleId>[a-z0-9]{32})$/i
  );

  if (zonePageRuleMatch) {
    return {
      key: `${method} /api/zones/:zoneId/page-rules/:ruleId`,
      params: zonePageRuleMatch.groups,
    };
  }

  const zonePageRulesMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/page-rules$/i
  );

  if (zonePageRulesMatch) {
    return {
      key: `${method} /api/zones/:zoneId/page-rules`,
      params: zonePageRulesMatch.groups,
    };
  }

  const zoneAnalyticsMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/analytics$/i
  );

  if (zoneAnalyticsMatch) {
    return {
      key: `${method} /api/zones/:zoneId/analytics`,
      params: zoneAnalyticsMatch.groups,
    };
  }

  const zoneCacheSettingsMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/cache-settings$/i
  );

  if (zoneCacheSettingsMatch) {
    return {
      key: `${method} /api/zones/:zoneId/cache-settings`,
      params: zoneCacheSettingsMatch.groups,
    };
  }

  const zoneSslSettingsMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/ssl-settings$/i
  );

  if (zoneSslSettingsMatch) {
    return {
      key: `${method} /api/zones/:zoneId/ssl-settings`,
      params: zoneSslSettingsMatch.groups,
    };
  }

  const zoneCachePurgeMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/purge-cache$/i
  );

  if (zoneCachePurgeMatch) {
    return {
      key: `${method} /api/zones/:zoneId/purge-cache`,
      params: zoneCachePurgeMatch.groups,
    };
  }

  const zoneAutomationFirewallMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation\/firewall\/(?<ruleKey>[a-zA-Z0-9_-]+)$/i
  );

  if (zoneAutomationFirewallMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation/firewall/:ruleKey`,
      params: zoneAutomationFirewallMatch.groups,
    };
  }

  const zoneAutomationPageRuleMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation\/page-rules\/(?<ruleKey>[a-zA-Z0-9_-]+)$/i
  );

  if (zoneAutomationPageRuleMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation/page-rules/:ruleKey`,
      params: zoneAutomationPageRuleMatch.groups,
    };
  }

  const zoneAutomationDnsProxyMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation\/dns-proxy$/i
  );

  if (zoneAutomationDnsProxyMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation/dns-proxy`,
      params: zoneAutomationDnsProxyMatch.groups,
    };
  }

  const zoneAutomationTieredCachingMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation\/tiered-caching$/i
  );

  if (zoneAutomationTieredCachingMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation/tiered-caching`,
      params: zoneAutomationTieredCachingMatch.groups,
    };
  }

  const zoneAutomationApplyMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation\/apply$/i
  );

  if (zoneAutomationApplyMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation/apply`,
      params: zoneAutomationApplyMatch.groups,
    };
  }

  const zoneAutomationMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/automation$/i
  );

  if (zoneAutomationMatch) {
    return {
      key: `${method} /api/zones/:zoneId/automation`,
      params: zoneAutomationMatch.groups,
    };
  }

  const zoneDnsRecordsMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/dns-records$/i
  );

  if (zoneDnsRecordsMatch) {
    return {
      key: `${method} /api/zones/:zoneId/dns-records`,
      params: zoneDnsRecordsMatch.groups,
    };
  }

  const zoneDnsRecordsBulkMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/dns-records\/bulk$/i
  );

  if (zoneDnsRecordsBulkMatch) {
    return {
      key: `${method} /api/zones/:zoneId/dns-records/bulk`,
      params: zoneDnsRecordsBulkMatch.groups,
    };
  }

  const zoneDnsRecordsBulkDeleteMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/dns-records\/bulk-delete$/i
  );

  if (zoneDnsRecordsBulkDeleteMatch) {
    return {
      key: `${method} /api/zones/:zoneId/dns-records/bulk-delete`,
      params: zoneDnsRecordsBulkDeleteMatch.groups,
    };
  }

  const zoneSpeedDeployMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/speed-deploy$/i
  );

  if (zoneSpeedDeployMatch) {
    return {
      key: `${method} /api/zones/:zoneId/speed-deploy`,
      params: zoneSpeedDeployMatch.groups,
    };
  }

  const zoneSpeedManagedDomainMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/speed-deploy\/(?<accessDomain>[^/]{1,253})$/i
  );

  if (zoneSpeedManagedDomainMatch) {
    return {
      key: `${method} /api/zones/:zoneId/speed-deploy/:accessDomain`,
      params: zoneSpeedManagedDomainMatch.groups,
    };
  }

  const zoneFirewallRulesetRuleMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/firewall-rulesets\/(?<rulesetId>[a-z0-9_-]{1,128})\/rules\/(?<ruleId>[a-z0-9_-]{1,128})$/i
  );

  if (zoneFirewallRulesetRuleMatch) {
    return {
      key: `${method} /api/zones/:zoneId/firewall-rulesets/:rulesetId/rules/:ruleId`,
      params: zoneFirewallRulesetRuleMatch.groups,
    };
  }

  const zoneFirewallRulesetsRulesMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/firewall-rulesets\/rules$/i
  );

  if (zoneFirewallRulesetsRulesMatch) {
    return {
      key: `${method} /api/zones/:zoneId/firewall-rulesets/rules`,
      params: zoneFirewallRulesetsRulesMatch.groups,
    };
  }

  const zoneDnsRecordMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/dns-records\/(?<recordId>[a-z0-9]{32})$/i
  );

  if (zoneDnsRecordMatch) {
    return {
      key: `${method} /api/zones/:zoneId/dns-records/:recordId`,
      params: zoneDnsRecordMatch.groups,
    };
  }

  const zoneFirewallRulesMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/firewall-rules$/i
  );

  if (zoneFirewallRulesMatch) {
    return {
      key: `${method} /api/zones/:zoneId/firewall-rules`,
      params: zoneFirewallRulesMatch.groups,
    };
  }

  const zoneFirewallRuleMatch = pathname.match(
    /^\/api\/zones\/(?<zoneId>[a-z0-9]{32})\/firewall-rules\/(?<ruleId>[a-z0-9]{32})$/i
  );

  if (zoneFirewallRuleMatch) {
    return {
      key: `${method} /api/zones/:zoneId/firewall-rules/:ruleId`,
      params: zoneFirewallRuleMatch.groups,
    };
  }

  return { key: `${method} ${pathname}`, params: {} };
}

const csrfExemptRoutes = new Set([
  "POST /api/session/connect",
  "POST /api/setup/secret",
  "POST /api/setup/admin",
  "POST /api/setup/complete",
]);

const stateChangingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

export function createApiRouter({
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
  publicOrigin = "",
  speedDeployController,
  sslSettingsController,
  trustProxyHeaders = false,
  workersController,
  zonesController,
}) {
  const routes = new Map([
    ["GET /api/setup/status", credentialsController.setupStatus],
    ["POST /api/setup/secret", credentialsController.setupSecret],
    ["POST /api/setup/admin", credentialsController.createSetupAdmin],
    ["POST /api/setup/cloudflare-accounts", credentialsController.createSetupCloudflareAccounts],
    ["POST /api/setup/complete", credentialsController.completeSetup],
    ["GET /api/session/status", credentialsController.status],
    ["POST /api/session/connect", credentialsController.connect],
    ["POST /api/session/logout", credentialsController.logout],
    ["POST /api/session/cloudflare-accounts", credentialsController.createCloudflareAccount],
    [
      "POST /api/session/cloudflare-accounts/:accountId/select",
      credentialsController.switchCloudflareAccount,
    ],
    ["GET /api/operation-history", operationHistoryController.list],
    ["DELETE /api/operation-history", operationHistoryController.clear],
    ["GET /api/developer-resources/:type", developerResourcesController.list],
    ["POST /api/developer-resources/:type", developerResourcesController.create],
    ["GET /api/developer-resources/:type/:resourceId/detail", developerResourcesController.detail],
    [
      "PATCH /api/developer-resources/pages/:resourceId/build-config",
      developerResourcesController.updatePagesBuildConfig,
    ],
    [
      "POST /api/developer-resources/d1/:resourceId/query",
      developerResourcesController.queryD1,
    ],
    [
      "PUT /api/developer-resources/r2/:resourceId/objects",
      developerResourcesController.putR2Object,
    ],
    [
      "DELETE /api/developer-resources/r2/:resourceId/objects",
      developerResourcesController.deleteR2Object,
    ],
    [
      "GET /api/developer-resources/kv/:resourceId/values",
      developerResourcesController.getKvValue,
    ],
    [
      "PUT /api/developer-resources/kv/:resourceId/values",
      developerResourcesController.putKvValue,
    ],
    [
      "DELETE /api/developer-resources/kv/:resourceId/values",
      developerResourcesController.deleteKvValue,
    ],
    [
      "PUT /api/developer-resources/tunnels/:resourceId/configuration",
      developerResourcesController.updateTunnelConfiguration,
    ],
    [
      "GET /api/developer-resources/tunnels/:resourceId/token",
      developerResourcesController.getTunnelToken,
    ],
    [
      "DELETE /api/developer-resources/:type/:resourceId",
      developerResourcesController.delete,
    ],
    ["GET /api/workers", workersController.list],
    ["POST /api/workers", workersController.create],
    ["GET /api/workers/queues", workersController.listQueues],
    ["GET /api/workers/:scriptName", workersController.get],
    ["PUT /api/workers/:scriptName", workersController.update],
    ["DELETE /api/workers/:scriptName", workersController.delete],
    ["POST /api/workers/:scriptName/subdomain", workersController.updateSubdomain],
    ["PATCH /api/workers/:scriptName/settings", workersController.updateSettings],
    ["PUT /api/workers/:scriptName/secrets", workersController.putSecret],
    ["DELETE /api/workers/:scriptName/secrets/:secretName", workersController.deleteSecret],
    ["PUT /api/workers/:scriptName/schedules", workersController.updateSchedules],
    ["GET /api/workers/:scriptName/deployments", workersController.listDeployments],
    ["POST /api/workers/:scriptName/tail", workersController.createTail],
    ["GET /api/workers/:scriptName/routes", workersController.listRoutes],
    ["POST /api/workers/:scriptName/routes", workersController.createRoute],
    ["POST /api/workers/:scriptName/preferred-route", workersController.createPreferredRoute],
    ["DELETE /api/workers/:scriptName/routes/:routeId", workersController.deleteRoute],
    ["GET /api/workers/:scriptName/domains", workersController.listDomains],
    ["PUT /api/workers/:scriptName/domains", workersController.createDomain],
    ["DELETE /api/workers/:scriptName/domains/:domainId", workersController.deleteDomain],
    ["GET /api/zones", zonesController.list],
    ["POST /api/zones", zonesController.create],
    ["GET /api/zones/:zoneId/analytics", analyticsController.get],
    ["GET /api/zones/:zoneId/automation", automationController.get],
    ["PATCH /api/zones/:zoneId/automation", automationController.updateSettings],
    ["POST /api/zones/:zoneId/automation/apply", automationController.applyPreset],
    ["PATCH /api/zones/:zoneId/automation/dns-proxy", automationController.updateDnsProxy],
    [
      "PATCH /api/zones/:zoneId/automation/firewall/:ruleKey",
      automationController.updateFirewall,
    ],
    [
      "PATCH /api/zones/:zoneId/automation/page-rules/:ruleKey",
      automationController.updatePageRule,
    ],
    [
      "PATCH /api/zones/:zoneId/automation/tiered-caching",
      automationController.updateTieredCaching,
    ],
    ["GET /api/zones/:zoneId/cache-settings", cacheSettingsController.get],
    ["PATCH /api/zones/:zoneId/cache-settings", cacheSettingsController.update],
    ["GET /api/zones/:zoneId/ssl-settings", sslSettingsController.get],
    ["PATCH /api/zones/:zoneId/ssl-settings", sslSettingsController.update],
    ["POST /api/zones/:zoneId/purge-cache", cacheSettingsController.purge],
    ["GET /api/zones/:zoneId/certificates", certificatesController.get],
    ["POST /api/zones/:zoneId/certificates", certificatesController.upload],
    ["POST /api/zones/:zoneId/origin-certificates", certificatesController.createOrigin],
    [
      "DELETE /api/zones/:zoneId/origin-certificates/:certificateId",
      certificatesController.deleteOrigin,
    ],
    [
      "DELETE /api/zones/:zoneId/certificates/:certificateId",
      certificatesController.delete,
    ],
    ["GET /api/zones/:zoneId/dns-records", dnsRecordsController.list],
    ["POST /api/zones/:zoneId/dns-records", dnsRecordsController.create],
    ["POST /api/zones/:zoneId/dns-records/bulk", dnsRecordsController.createBulk],
    ["POST /api/zones/:zoneId/dns-records/bulk-delete", dnsRecordsController.deleteBulk],
    ["PATCH /api/zones/:zoneId/dns-records/:recordId", dnsRecordsController.update],
    ["DELETE /api/zones/:zoneId/dns-records/:recordId", dnsRecordsController.delete],
    ["GET /api/zones/:zoneId/speed-deploy", speedDeployController.list],
    ["POST /api/zones/:zoneId/speed-deploy", speedDeployController.deploy],
    ["DELETE /api/zones/:zoneId/speed-deploy/:accessDomain", speedDeployController.delete],
    ["GET /api/zones/:zoneId/firewall-rules", firewallRulesController.list],
    ["POST /api/zones/:zoneId/firewall-rules", firewallRulesController.create],
    [
      "POST /api/zones/:zoneId/firewall-rulesets/rules",
      firewallRulesController.createRulesetRule,
    ],
    [
      "PATCH /api/zones/:zoneId/firewall-rulesets/:rulesetId/rules/:ruleId",
      firewallRulesController.updateRulesetRule,
    ],
    [
      "DELETE /api/zones/:zoneId/firewall-rulesets/:rulesetId/rules/:ruleId",
      firewallRulesController.deleteRulesetRule,
    ],
    ["PATCH /api/zones/:zoneId/firewall-rules/:ruleId", firewallRulesController.update],
    [
      "DELETE /api/zones/:zoneId/firewall-rules/:ruleId",
      firewallRulesController.delete,
    ],
    ["GET /api/zones/:zoneId/page-rules", pageRulesController.list],
    ["POST /api/zones/:zoneId/page-rules", pageRulesController.create],
    ["PATCH /api/zones/:zoneId/page-rules/:ruleId", pageRulesController.update],
    ["DELETE /api/zones/:zoneId/page-rules/:ruleId", pageRulesController.delete],
  ]);

  return {
    match(request, url) {
      const match = matchRoute(request.method, url.pathname);
      const handler = routes.get(match.key);

      if (!handler) {
        return null;
      }

      return async (context) => {
        const startedAt = Date.now();
        const sessionCredentials = credentialSessionService?.getCredentials(context.request);
        const isSessionRoute = context.url.pathname.startsWith("/api/session/");
        const isSetupRoute = context.url.pathname.startsWith("/api/setup/");
        const setupRequired = Boolean(panelAuthService?.getSetupState?.().setupRequired);
        const requiresPanelLogin = !setupRequired && panelAuthService?.isConfigured() && !isSessionRoute && !isSetupRoute;
        const selectedAccountId = cloudflareAccountService?.resolveSelectedAccountId(
          sessionCredentials?.activeCloudflareAccountId
        );
        const cloudflareCredentials =
          sessionCredentials?.email && sessionCredentials?.globalApiKey
            ? sessionCredentials
            : cloudflareAccountService?.getCredentials(selectedAccountId);
        const credentials =
          requiresPanelLogin && !sessionCredentials?.authenticated
            ? null
            : cloudflareCredentials;
        const executeHandler = () => handler({ ...context, credentials, params: match.params });

        try {
          if (setupRequired && !isSessionRoute && !isSetupRoute) {
            return {
              statusCode: 412,
              body: { error: "请先完成首次初始化。" },
            };
          }

          if (requiresPanelLogin && !sessionCredentials?.authenticated) {
            return {
              statusCode: 401,
              body: { error: "请先登录面板。" },
            };
          }

          if (
            stateChangingMethods.has(context.request.method) &&
            !sameOriginRequest(context.request, { publicOrigin, trustProxyHeaders })
          ) {
            return {
              statusCode: 403,
              body: { error: "请求来源校验失败。" },
            };
          }

          if (
            sessionCredentials?.authenticated &&
            stateChangingMethods.has(context.request.method) &&
            !csrfExemptRoutes.has(match.key) &&
            !credentialSessionService.verifyCsrf(context.request)
          ) {
            return {
              statusCode: 403,
              body: { error: "CSRF 校验失败，请刷新页面后重试。" },
            };
          }

          const result = await cloudflareClient.withCredentials(credentials, executeHandler);

          if (operationHistoryService?.shouldRecord(context.request.method, context.url.pathname)) {
            operationHistoryService.record({
              durationMs: Date.now() - startedAt,
              method: context.request.method,
              params: match.params,
              pathname: context.url.pathname,
              status: result.statusCode >= 400 ? "failed" : "success",
              statusCode: result.statusCode,
            });
          }

          return result;
        } catch (error) {
          if (operationHistoryService?.shouldRecord(context.request.method, context.url.pathname)) {
            operationHistoryService.record({
              durationMs: Date.now() - startedAt,
              error: error.message,
              method: context.request.method,
              params: match.params,
              pathname: context.url.pathname,
              status: "failed",
              statusCode: error.statusCode || 500,
            });
          }

          throw error;
        }
      };
    },
    isApiPath(url) {
      return url.pathname.startsWith("/api/");
    },
  };
}
