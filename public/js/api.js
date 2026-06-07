export class ApiUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiUnavailableError";
    this.code = "API_UNAVAILABLE";
  }
}

const API_UNAVAILABLE_MESSAGE =
  "当前页面未连接 Node.js 后端，请在 Node 服务部署地址打开后再登录。";

let csrfToken = "";

export function setCsrfToken(token = "") {
  csrfToken = String(token || "");
}

function requestHeaders(headers = {}, method = "GET") {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const nextHeaders = { ...headers };

  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    nextHeaders["X-CSRF-Token"] = csrfToken;
  }

  return nextHeaders;
}

function apiFetch(url, options = {}) {
  const method = options.method || "GET";

  return fetch(url, {
    ...options,
    headers: requestHeaders(options.headers, method),
  });
}

function isJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  return /\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(contentType);
}

async function readJson(response, fallbackMessage) {
  if (!isJsonResponse(response)) {
    await response.text().catch(() => "");
    throw new ApiUnavailableError(API_UNAVAILABLE_MESSAGE);
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

export async function fetchZones() {
  const response = await apiFetch("/api/zones");
  const payload = await readJson(response, "读取域名失败");

  return payload.zones;
}

export async function createZone(request) {
  const response = await apiFetch("/api/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "添加域名失败");

  return payload.zone;
}

export async function fetchSessionStatus() {
  const response = await apiFetch("/api/session/status");
  return readJson(response, "读取连接状态失败");
}

export async function fetchSetupSecret(setupToken = "") {
  const response = await apiFetch("/api/setup/secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupToken }),
  });

  return readJson(response, "生成 2FA 登录密钥失败");
}

export async function completeFirstRunSetup(payload) {
  const response = await apiFetch("/api/setup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJson(response, "首次初始化失败");
}

export async function createSetupAdmin(payload) {
  const response = await apiFetch("/api/setup/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJson(response, "管理员账户初始化失败");
}

export async function createSetupCloudflareAccounts(payload) {
  const response = await apiFetch("/api/setup/cloudflare-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJson(response, "Cloudflare 账号初始化失败");
}

export async function createCloudflareAccount(payload) {
  const response = await apiFetch("/api/session/cloudflare-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return readJson(response, "Cloudflare 账号添加失败");
}

export async function loginPanel(credentials) {
  const response = await apiFetch("/api/session/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  return readJson(response, "面板登录失败");
}

export const connectCloudflareAccount = loginPanel;

export async function switchCloudflareAccount(accountId) {
  const response = await apiFetch(
    `/api/session/cloudflare-accounts/${encodeURIComponent(accountId)}/select`,
    {
      method: "POST",
    }
  );

  return readJson(response, "切换 Cloudflare 账号失败");
}

export async function logoutCloudflareAccount() {
  const response = await apiFetch("/api/session/logout", {
    method: "POST",
  });

  return readJson(response, "退出登录失败");
}

export async function fetchDnsRecords(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records`);
  const payload = await readJson(response, "读取 DNS 记录失败");

  return payload.records;
}

export async function createDnsRecord(zoneId, record) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  const payload = await readJson(response, "保存 DNS 记录失败");

  return payload.record;
}

export async function updateDnsRecord(zoneId, recordId, record) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records/${recordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  const payload = await readJson(response, "保存 DNS 记录失败");

  return payload.record;
}

export async function removeDnsRecord(zoneId, recordId) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records/${recordId}`, {
    method: "DELETE",
  });

  return readJson(response, "删除 DNS 记录失败");
}

export async function createDnsRecordsBulk(zoneId, records) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const payload = await readJson(response, "批量添加 DNS 记录失败");

  return payload.records;
}

export async function removeDnsRecordsBulk(zoneId, recordIds) {
  const response = await apiFetch(`/api/zones/${zoneId}/dns-records/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordIds }),
  });

  return readJson(response, "批量删除 DNS 记录失败");
}

export async function fetchCacheSettings(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/cache-settings`);
  return readJson(response, "读取缓存设置失败");
}

export async function fetchSslSettings(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/ssl-settings`);
  const payload = await readJson(response, "读取 SSL/TLS 设置失败");

  return payload.ssl;
}

export async function saveSslSettings(zoneId, settings) {
  const response = await apiFetch(`/api/zones/${zoneId}/ssl-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const payload = await readJson(response, "保存 SSL/TLS 设置失败");

  return payload.ssl;
}

export async function fetchCertificates(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/certificates`);
  return readJson(response, "读取证书状态失败");
}

export async function fetchZoneAnalytics(zoneId, options = 7) {
  const params = new URLSearchParams();

  if (typeof options === "number") {
    params.set("days", String(options));
  } else {
    if (options.days) {
      params.set("days", String(options.days));
    }

    if (options.startDate) {
      params.set("startDate", options.startDate);
    }

    if (options.endDate) {
      params.set("endDate", options.endDate);
    }
  }

  const response = await apiFetch(`/api/zones/${zoneId}/analytics?${params.toString()}`);
  const payload = await readJson(response, "读取统计分析失败");

  return payload.analytics;
}

export async function saveCacheSettings(zoneId, settings) {
  const response = await apiFetch(`/api/zones/${zoneId}/cache-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  return readJson(response, "保存缓存设置失败");
}

export async function purgeCache(zoneId, request) {
  const response = await apiFetch(`/api/zones/${zoneId}/purge-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  return readJson(response, "清除缓存失败");
}

export async function fetchFirewallRules(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/firewall-rules`);
  return readJson(response, "读取防火墙规则失败");
}

export async function createRulesetRule(zoneId, rule) {
  const response = await apiFetch(`/api/zones/${zoneId}/firewall-rulesets/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  const payload = await readJson(response, "创建新版防火墙规则失败");

  return payload.rule;
}

export async function updateRulesetRule(zoneId, rulesetId, ruleId, rule) {
  const response = await apiFetch(
    `/api/zones/${zoneId}/firewall-rulesets/${encodeURIComponent(rulesetId)}/rules/${encodeURIComponent(ruleId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    }
  );
  const payload = await readJson(response, "更新新版防火墙规则失败");

  return payload.rule;
}

export async function removeRulesetRule(zoneId, rulesetId, ruleId) {
  const response = await apiFetch(
    `/api/zones/${zoneId}/firewall-rulesets/${encodeURIComponent(rulesetId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除新版防火墙规则失败");
}

export async function fetchPageRules(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/page-rules`);
  const payload = await readJson(response, "读取页面规则失败");

  return payload.rules;
}

export async function createFirewallRule(zoneId, rule) {
  const response = await apiFetch(`/api/zones/${zoneId}/firewall-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  const payload = await readJson(response, "创建防火墙规则失败");

  return payload.rule;
}

export async function createPageRule(zoneId, rule) {
  const response = await apiFetch(`/api/zones/${zoneId}/page-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  const payload = await readJson(response, "创建页面规则失败");

  return payload.rule;
}

export async function updateFirewallRule(zoneId, ruleId, rule) {
  const response = await apiFetch(`/api/zones/${zoneId}/firewall-rules/${ruleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  const payload = await readJson(response, "更新防火墙规则失败");

  return payload.rule;
}

export async function updatePageRule(zoneId, ruleId, rule) {
  const response = await apiFetch(`/api/zones/${zoneId}/page-rules/${ruleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  const payload = await readJson(response, "更新页面规则失败");

  return payload.rule;
}

export async function removeFirewallRule(zoneId, ruleId) {
  const response = await apiFetch(`/api/zones/${zoneId}/firewall-rules/${ruleId}`, {
    method: "DELETE",
  });

  return readJson(response, "删除防火墙规则失败");
}

export async function removePageRule(zoneId, ruleId) {
  const response = await apiFetch(`/api/zones/${zoneId}/page-rules/${ruleId}`, {
    method: "DELETE",
  });

  return readJson(response, "删除页面规则失败");
}

export async function removeCustomCertificate(zoneId, certificateId) {
  const response = await apiFetch(`/api/zones/${zoneId}/certificates/${certificateId}`, {
    method: "DELETE",
  });

  return readJson(response, "删除证书失败");
}

export async function uploadCustomCertificate(zoneId, request) {
  const response = await apiFetch(`/api/zones/${zoneId}/certificates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "上传自定义证书失败");

  return payload.certificate;
}

export async function createOriginCertificate(zoneId, request) {
  const response = await apiFetch(`/api/zones/${zoneId}/origin-certificates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "创建 Origin CA 证书失败");

  return payload.certificate;
}

export async function removeOriginCertificate(zoneId, certificateId) {
  const response = await apiFetch(`/api/zones/${zoneId}/origin-certificates/${encodeURIComponent(certificateId)}`, {
    method: "DELETE",
  });

  return readJson(response, "删除 Origin CA 证书失败");
}

export async function fetchSpeedAcceleratedDomains(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/speed-deploy`);
  const payload = await readJson(response, "读取已加速域名失败");

  return payload.speed;
}

export async function deploySpeedAcceleration(zoneId, request) {
  const response = await apiFetch(`/api/zones/${zoneId}/speed-deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "部署一键加速失败");

  return payload.deployment;
}

export async function removeSpeedAcceleratedDomain(zoneId, accessDomain) {
  const response = await apiFetch(
    `/api/zones/${zoneId}/speed-deploy/${encodeURIComponent(accessDomain)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除加速域名失败");
}

function accountQuery(accountId) {
  return accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
}

export async function fetchWorkers(accountId = "") {
  const response = await apiFetch(`/api/workers${accountQuery(accountId)}`);
  const payload = await readJson(response, "读取 Workers 失败");

  return payload.workers;
}

export async function fetchWorker(scriptName, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}${accountQuery(accountId)}`
  );
  const payload = await readJson(response, "读取 Worker 详情失败");

  return payload.worker;
}

export async function createWorker(request) {
  const response = await apiFetch("/api/workers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "创建 Worker 失败");

  return payload.worker;
}

export async function saveWorkerScript(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "保存 Worker 失败");

  return payload.worker;
}

export async function removeWorker(scriptName, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}${accountQuery(accountId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 Worker 失败");
}

export async function saveWorkerSubdomain(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/subdomain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  return readJson(response, "保存 workers.dev 子域设置失败");
}

export async function fetchWorkerRoutes(scriptName, zoneId) {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/routes?zoneId=${encodeURIComponent(zoneId)}`
  );
  const payload = await readJson(response, "读取 Worker 路由失败");

  return payload.routes;
}

export async function createWorkerRoute(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "添加 Worker 路由失败");

  return payload.route;
}

export async function createWorkerPreferredRoute(scriptName, request) {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/preferred-route`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "添加 Worker 优选失败");

  return payload.deployment;
}

export async function removeWorkerRoute(scriptName, routeId, zoneId) {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/routes/${encodeURIComponent(
      routeId
    )}?zoneId=${encodeURIComponent(zoneId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 Worker 路由失败");
}

export async function createWorkerDomain(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/domains`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "添加 Worker 自定义域失败");

  return payload.domain;
}

export async function removeWorkerDomain(scriptName, domainId, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/domains/${encodeURIComponent(
      domainId
    )}${accountQuery(accountId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 Worker 自定义域失败");
}

export async function saveWorkerSettings(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  return readJson(response, "保存 Worker 设置失败");
}

export async function saveWorkerSecret(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/secrets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "保存 Worker Secret 失败");

  return payload.secret;
}

export async function removeWorkerSecret(scriptName, secretName, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(secretName)}${accountQuery(accountId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 Worker Secret 失败");
}

export async function saveWorkerSchedules(scriptName, request) {
  const response = await apiFetch(`/api/workers/${encodeURIComponent(scriptName)}/schedules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  return readJson(response, "保存 Cron Triggers 失败");
}

export async function fetchWorkerDeployments(scriptName, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/deployments${accountQuery(accountId)}`
  );
  const payload = await readJson(response, "读取 Worker 部署记录失败");

  return payload.deployments;
}

export async function createWorkerTail(scriptName, accountId = "") {
  const response = await apiFetch(
    `/api/workers/${encodeURIComponent(scriptName)}/tail${accountQuery(accountId)}`,
    { method: "POST" }
  );

  return readJson(response, "创建 Worker 日志 Tail 失败");
}

export async function fetchWorkerQueues(accountId = "") {
  const response = await apiFetch(`/api/workers/queues${accountQuery(accountId)}`);
  const payload = await readJson(response, "读取 Queues 失败");

  return payload.queues;
}

export async function fetchDeveloperResources(type, accountId = "") {
  const response = await apiFetch(
    `/api/developer-resources/${encodeURIComponent(type)}${accountQuery(accountId)}`
  );
  const payload = await readJson(response, "读取资源列表失败");

  return payload.resources;
}

export async function createDeveloperResource(type, request) {
  const response = await apiFetch(`/api/developer-resources/${encodeURIComponent(type)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await readJson(response, "创建资源失败");

  return payload.resource;
}

export async function removeDeveloperResource(type, resourceId, accountId = "") {
  const response = await apiFetch(
    `/api/developer-resources/${encodeURIComponent(type)}/${encodeURIComponent(
      resourceId
    )}${accountQuery(accountId)}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除资源失败");
}

export async function fetchDeveloperResourceDetail(type, resourceId, accountId = "") {
  const response = await apiFetch(
    `/api/developer-resources/${encodeURIComponent(type)}/${encodeURIComponent(resourceId)}/detail${accountQuery(accountId)}`
  );
  const payload = await readJson(response, "读取资源详情失败");

  return payload.resource;
}

export async function savePagesBuildConfig(resourceId, request) {
  const response = await apiFetch(
    `/api/developer-resources/pages/${encodeURIComponent(resourceId)}/build-config`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "保存 Pages 构建配置失败");

  return payload.resource;
}

export async function queryD1Database(resourceId, request) {
  const response = await apiFetch(
    `/api/developer-resources/d1/${encodeURIComponent(resourceId)}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "执行 D1 查询失败");

  return payload.result;
}

export async function putR2Object(resourceId, request) {
  const response = await apiFetch(
    `/api/developer-resources/r2/${encodeURIComponent(resourceId)}/objects`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "上传 R2 对象失败");

  return payload.result;
}

export async function removeR2Object(resourceId, key, accountId = "") {
  const params = new URLSearchParams(accountId ? { accountId } : {});
  params.set("key", key);
  const response = await apiFetch(
    `/api/developer-resources/r2/${encodeURIComponent(resourceId)}/objects?${params.toString()}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 R2 对象失败");
}

export async function fetchKvValue(resourceId, key, accountId = "") {
  const params = new URLSearchParams(accountId ? { accountId } : {});
  params.set("key", key);
  const response = await apiFetch(
    `/api/developer-resources/kv/${encodeURIComponent(resourceId)}/values?${params.toString()}`
  );
  const payload = await readJson(response, "读取 KV Value 失败");

  return payload.value;
}

export async function putKvValue(resourceId, request) {
  const response = await apiFetch(
    `/api/developer-resources/kv/${encodeURIComponent(resourceId)}/values`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "保存 KV Value 失败");

  return payload.result;
}

export async function removeKvValue(resourceId, key, accountId = "") {
  const params = new URLSearchParams(accountId ? { accountId } : {});
  params.set("key", key);
  const response = await apiFetch(
    `/api/developer-resources/kv/${encodeURIComponent(resourceId)}/values?${params.toString()}`,
    { method: "DELETE" }
  );

  return readJson(response, "删除 KV Value 失败");
}

export async function saveTunnelConfiguration(resourceId, request) {
  const response = await apiFetch(
    `/api/developer-resources/tunnels/${encodeURIComponent(resourceId)}/configuration`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  const payload = await readJson(response, "保存 Tunnel 配置失败");

  return payload.result;
}

export async function fetchTunnelToken(resourceId, accountId = "") {
  const response = await apiFetch(
    `/api/developer-resources/tunnels/${encodeURIComponent(resourceId)}/token${accountQuery(accountId)}`
  );
  const payload = await readJson(response, "读取 Tunnel Token 失败");

  return payload.token;
}

export async function fetchAutomationState(zoneId) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation`);
  const payload = await readJson(response, "读取自动优化设置失败");

  return payload.automation;
}

export async function saveAutomationSettings(zoneId, settings) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const payload = await readJson(response, "保存自动优化设置失败");

  return payload.automation;
}

export async function applyAutomationPreset(zoneId, preset) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset }),
  });
  const payload = await readJson(response, "应用自动优化预设失败");

  return payload.automation;
}

export async function saveAutomationDnsProxy(zoneId, enabled) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation/dns-proxy`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const payload = await readJson(response, "保存 DNS 代理状态失败");

  return payload.automation;
}

export async function saveAutomationFirewallRule(zoneId, ruleKey, enabled) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation/firewall/${ruleKey}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const payload = await readJson(response, "保存自动优化防火墙规则失败");

  return payload.automation;
}

export async function saveAutomationPageRule(zoneId, ruleKey, enabled) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation/page-rules/${ruleKey}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const payload = await readJson(response, "保存自动优化页面规则失败");

  return payload.automation;
}

export async function saveAutomationTieredCaching(zoneId, enabled) {
  const response = await apiFetch(`/api/zones/${zoneId}/automation/tiered-caching`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const payload = await readJson(response, "保存分层缓存失败");

  return payload.automation;
}

export async function fetchOperationHistory(options = {}) {
  const params = new URLSearchParams();

  if (options.module) {
    params.set("module", options.module);
  }

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiFetch(`/api/operation-history${suffix}`);
  const payload = await readJson(response, "读取操作历史失败");

  return payload.history;
}

export async function clearOperationHistory() {
  const response = await apiFetch("/api/operation-history", { method: "DELETE" });
  const payload = await readJson(response, "清空操作历史失败");

  return payload.history;
}
