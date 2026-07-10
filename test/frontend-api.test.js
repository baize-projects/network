import { test } from "node:test";
import assert from "node:assert/strict";

import { createDnsActions, parseDnsBulkText } from "../public/js/actions/dns-actions.js";
import { createSessionActions } from "../public/js/actions/session-actions.js";
import { filterDnsRecords } from "../public/js/dns-record-filter.js";
import { renderConnectView } from "../public/js/views/connect-view.js";
import { renderDnsView } from "../public/js/views/dns-view.js";
import { renderShell } from "../public/js/views/shell-view.js";
import {
  ApiUnavailableError,
  fetchSessionStatus,
} from "../public/js/api.js";
import { state } from "../public/js/state.js";

function htmlResponse() {
  return new Response("<!doctype html><html><body>Static HTML fallback</body></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 200,
  });
}

test("front-end API reports non-JSON static HTML responses as backend unavailable", async () => {
  const previousFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    return htmlResponse();
  };

  try {
    await assert.rejects(
      fetchSessionStatus(),
      (error) =>
        error instanceof ApiUnavailableError &&
        error.code === "API_UNAVAILABLE" &&
        /Node\.js 后端/.test(error.message)
    );

    assert.deepEqual(requestedUrls, ["/api/session/status"]);
  } finally {
    global.fetch = previousFetch;
  }
});

test("DNS bulk text parser supports quoted TXT content and MX shorthand", () => {
  const records = parseDnsBulkText(`
    # comments are ignored
    A @ 192.0.2.10 1 true
    TXT @ "v=spf1 include:_spf.example.com ~all" 1
    MX @ mail.example.com 300 10
  `);

  assert.deepEqual(records, [
    {
      content: "192.0.2.10",
      name: "@",
      proxied: true,
      ttl: 1,
      type: "A",
    },
    {
      content: "v=spf1 include:_spf.example.com ~all",
      name: "@",
      ttl: 1,
      type: "TXT",
    },
    {
      content: "mail.example.com",
      name: "@",
      priority: "10",
      ttl: 300,
      type: "MX",
    },
  ]);

  assert.throws(
    () => parseDnsBulkText("TXT @ v=spf1 include:_spf.example.com ~all 1"),
    /TTL 必须/
  );

  assert.throws(
    () => parseDnsBulkText("TXT @ v=spf1 include:_spf.example.com ~all 1 extra"),
    /字段过多/
  );
});

test("DNS search matches type, IP, domain, and multiple fuzzy terms", () => {
  const records = [
    { id: "a", type: "A", name: "api.alpha.example", content: "192.0.2.10" },
    { id: "b", type: "AAAA", name: "www.alpha.example", content: "2001:db8::10" },
    { id: "c", type: "CNAME", name: "shop.alpha.example", content: "target.example.net" },
  ];

  assert.deepEqual(filterDnsRecords(records, "aaaa").map((record) => record.id), ["b"]);
  assert.deepEqual(filterDnsRecords(records, "192.0.2").map((record) => record.id), ["a"]);
  assert.deepEqual(filterDnsRecords(records, "TARGET.EXAMPLE").map((record) => record.id), ["c"]);
  assert.deepEqual(filterDnsRecords(records, "a 192.0").map((record) => record.id), ["a"]);
  assert.deepEqual(filterDnsRecords(records, "   "), records);
  assert.deepEqual(filterDnsRecords(null, "api"), []);
});

test("DNS search UI filters rows and bulk selection only targets visible records", () => {
  const previousDocument = global.document;
  const previousState = {
    dnsError: state.dnsError,
    dnsFormOpen: state.dnsFormOpen,
    dnsBulkFormOpen: state.dnsBulkFormOpen,
    dnsRecords: state.dnsRecords,
    dnsSearchQuery: state.dnsSearchQuery,
    deletingDnsBulk: state.deletingDnsBulk,
    loadingDns: state.loadingDns,
    notice: state.notice,
    selectedDnsRecordIds: state.selectedDnsRecordIds,
    selectedZone: state.selectedZone,
    savingDnsBulk: state.savingDnsBulk,
  };
  const records = [
    { id: "a", type: "A", name: "api.alpha.example", content: "192.0.2.10", ttl: 1 },
    { id: "b", type: "AAAA", name: "www.alpha.example", content: "2001:db8::10", ttl: 1 },
    { id: "c", type: "CNAME", name: "shop.alpha.example", content: "target.example.net", ttl: 1 },
  ];
  const searchInput = {
    focusCalled: 0,
    selection: [],
    focus() {
      this.focusCalled += 1;
    },
    setSelectionRange(start, end) {
      this.selection = [start, end];
    },
  };
  let renderCount = 0;

  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#dns-record-search");
      return searchInput;
    },
  };

  const actions = createDnsActions({
    renderApp() {
      renderCount += 1;
    },
  });

  try {
    state.selectedZone = {
      id: "1".repeat(32),
      name: "alpha.example",
      status: "active",
      plan: { name: "Free" },
    };
    state.dnsRecords = records;
    state.dnsSearchQuery = "2001";
    state.selectedDnsRecordIds = ["a", "b"];
    state.loadingDns = false;
    state.dnsError = "";
    state.notice = "";
    state.dnsFormOpen = false;
    state.dnsBulkFormOpen = false;
    state.savingDnsBulk = false;
    state.deletingDnsBulk = false;

    const html = renderDnsView();

    assert.match(html, /id="dns-record-search"/);
    assert.match(html, /显示 1 \/ 3/);
    assert.match(html, /2001:db8::10/);
    assert.doesNotMatch(html, /192\.0\.2\.10/);

    actions.searchDnsRecords({ currentTarget: { value: "target.example" } });
    assert.equal(state.dnsSearchQuery, "target.example");
    assert.deepEqual(state.selectedDnsRecordIds, []);
    assert.equal(searchInput.focusCalled, 1);
    assert.deepEqual(searchInput.selection, [14, 14]);

    actions.toggleAllDnsRecords({ target: { checked: true } });
    assert.deepEqual(state.selectedDnsRecordIds, ["c"]);
    actions.toggleAllDnsRecords({ target: { checked: false } });
    assert.deepEqual(state.selectedDnsRecordIds, []);
    assert.equal(renderCount, 3);
  } finally {
    Object.assign(state, previousState);
    global.document = previousDocument;
  }
});

test("session startup keeps the login screen clean when API is static HTML", async () => {
  const previousFetch = global.fetch;
  let loadZonesCalled = false;
  let renderCount = 0;
  global.fetch = async () => htmlResponse();

  state.connected = false;
  state.checkingSession = false;
  state.sessionError = "stale error";
  state.sessionAuthenticated = false;
  state.sessionHasServerCredentials = false;
  state.sessionEmail = "";
  state.sessionExpiresAt = "";
  state.sessionSource = "";

  const actions = createSessionActions({
    async loadZones() {
      loadZonesCalled = true;
    },
    renderApp() {
      renderCount += 1;
    },
  });

  try {
    await actions.checkSession();

    assert.equal(state.checkingSession, false);
    assert.equal(state.connected, false);
    assert.equal(state.sessionError, "");
    assert.equal(loadZonesCalled, false);
    assert.equal(renderCount, 2);
  } finally {
    global.fetch = previousFetch;
  }
});

test("manual login still tells static HTML users that the Node backend is missing", async () => {
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  const previousFormData = global.FormData;
  let renderCount = 0;
  global.fetch = async () => htmlResponse();
  global.FormData = class TestFormData {
    constructor(form) {
      this.form = form;
    }

    get(name) {
      return this.form.values[name];
    }
  };
  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#cloudflare-connect-form");
      return {
        values: {
          auth: "123456",
          password: "panel-password",
          user: "operator",
        },
      };
    },
  };

  const actions = createSessionActions({
    async loadZones() {
      throw new Error("loadZones should not run");
    },
    renderApp() {
      renderCount += 1;
    },
  });

  try {
    state.connected = false;
    state.connectingSession = false;
    state.sessionError = "";
    state.sessionAuthenticated = false;
    state.sessionHasServerCredentials = false;
    state.sessionEmail = "";
    state.sessionExpiresAt = "";
    state.sessionSource = "";

    await actions.connectSession({ preventDefault() {} });

    assert.equal(state.connected, false);
    assert.match(state.sessionError, /Node\.js 后端/);
    assert.equal(renderCount, 2);
  } finally {
    global.document = previousDocument;
    global.fetch = previousFetch;
    global.FormData = previousFormData;
  }
});

test("setup Cloudflare step renders admin session recovery before saving accounts", () => {
  const previousDocument = global.document;
  const app = { className: "", innerHTML: "" };
  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#app");
      return app;
    },
  };

  try {
    state.checkingSession = false;
    state.sessionAuthenticated = false;
    state.sessionError = "";
    state.setupCloudflareAccounts = [
      { cloudflareName: "主账号", cfEmail: "", cfApiKey: "" },
    ];
    state.setupLoginSubmitting = false;
    state.setupRequired = true;
    state.setupStep = "cloudflare";
    state.setupSubmitting = false;

    renderConnectView();

    assert.match(app.innerHTML, /恢复管理员会话/);
    assert.match(app.innerHTML, /请先恢复管理员会话/);

    state.sessionAuthenticated = true;
    renderConnectView();

    assert.doesNotMatch(app.innerHTML, /恢复管理员会话/);
    assert.match(app.innerHTML, /保存 Cloudflare 账号并进入面板/);
  } finally {
    global.document = previousDocument;
  }
});

test("shell renders compact Cloudflare account add dialog", () => {
  const previousDocument = global.document;
  const app = { className: "", innerHTML: "" };
  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#app");
      return app;
    },
  };

  try {
    state.cloudflareAccounts = [
      { active: true, email: "fi***@example.com", id: "cf1", name: "主账号" },
    ];
    state.cloudflareAccountDialogOpen = true;
    state.cloudflareAccountError = "该 Cloudflare 登录邮箱已存在。";
    state.cloudflareAccountSaving = false;
    state.activeCloudflareAccount = {
      email: "fi***@example.com",
      id: "cf1",
      name: "主账号",
    };
    state.activeCloudflareAccountId = "cf1";
    state.connected = true;
    state.mainSection = "domain";
    state.view = "domains";

    renderShell("<section>content</section>");

    assert.match(app.innerHTML, /id="cloudflare-account-open"/);
    assert.match(app.innerHTML, /添加 Cloudflare 账号/);
    assert.match(app.innerHTML, /id="cloudflare-account-create-form"/);
    assert.match(app.innerHTML, /该 Cloudflare 登录邮箱已存在。/);
    assert.doesNotMatch(app.innerHTML, /secret-key/);
  } finally {
    global.document = previousDocument;
  }
});

test("refreshing setup secret keeps admin setup form values after rerender", async () => {
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  const previousFormData = global.FormData;
  const fields = {
    confirmPassword: { value: "strong-password" },
    password: { value: "strong-password" },
    setupToken: { value: "setup-token" },
    username: { value: "operator" },
  };
  const form = {
    querySelector(selector) {
      const match = String(selector).match(/^\[name="(?<name>[^"]+)"\]$/);

      return match ? fields[match.groups.name] || null : null;
    },
  };
  let renderCount = 0;

  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#panel-setup-form");
      return form;
    },
  };
  global.FormData = class TestFormData {
    get(name) {
      return fields[name]?.value || "";
    }
  };
  global.fetch = async (url, options = {}) => {
    assert.equal(String(url), "/api/setup/secret");
    assert.equal(options.method, "POST");

    return new Response(
      JSON.stringify({
        otpauthUrl: "otpauth://totp/test",
        secret: "ABCD EFGH IJKL MNOP",
      }),
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      }
    );
  };

  const actions = createSessionActions({
    async loadZones() {
      throw new Error("loadZones should not run");
    },
    renderApp() {
      renderCount += 1;

      for (const field of Object.values(fields)) {
        field.value = "";
      }
    },
  });

  try {
    state.setupRequired = true;
    state.setupStep = "admin";
    state.setupSecret = "";
    state.setupToken = "";

    await actions.refreshSetupSecret();

    assert.equal(fields.setupToken.value, "setup-token");
    assert.equal(fields.username.value, "operator");
    assert.equal(fields.password.value, "strong-password");
    assert.equal(fields.confirmPassword.value, "strong-password");
    assert.equal(state.setupSecret, "ABCD EFGH IJKL MNOP");
    assert.equal(renderCount, 2);
  } finally {
    global.document = previousDocument;
    global.fetch = previousFetch;
    global.FormData = previousFormData;
  }
});

test("logged-in users can add a Cloudflare account from the topbar dialog", async () => {
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  const previousFormData = global.FormData;
  const previousHistory = global.history;
  const requested = [];
  const fields = {
    cfApiKey: { value: "new-secret-key" },
    cfEmail: { value: "new@example.com" },
    cloudflareName: { value: "新增账号" },
  };
  const form = {
    querySelector(selector) {
      const match = String(selector).match(/^\[name="(?<name>[^"]+)"\]$/);

      return match ? fields[match.groups.name] || null : null;
    },
  };
  let loadZonesCalled = 0;
  let renderCount = 0;

  global.document = {
    querySelector(selector) {
      assert.equal(selector, "#cloudflare-account-create-form");
      return form;
    },
  };
  global.FormData = class TestFormData {
    get(name) {
      return fields[name]?.value || "";
    }
  };
  global.fetch = async (url, options = {}) => {
    requested.push([String(url), options.method || "GET", options.body || ""]);

    return new Response(
      JSON.stringify({
        accounts: [
          { active: false, email: "fi***@example.com", id: "cf1", name: "主账号" },
          { active: true, email: "ne*@example.com", id: "cf2", name: "新增账号" },
        ],
        activeCloudflareAccount: {
          email: "ne*@example.com",
          id: "cf2",
          name: "新增账号",
        },
        authenticated: true,
        email: "ne*@example.com",
        expiresAt: "2026-06-07T00:00:00.000Z",
        hasCredentials: true,
        loginRequired: true,
        source: "cookie",
      }),
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 201,
      }
    );
  };
  global.history = {
    replaceState() {},
  };

  const actions = createSessionActions({
    async loadZones() {
      loadZonesCalled += 1;
      state.zones = [{ id: "new-zone" }];
    },
    renderApp() {
      renderCount += 1;
    },
  });

  try {
    state.cloudflareAccountDialogOpen = true;
    state.cloudflareAccountError = "";
    state.cloudflareAccountSaving = false;
    state.connected = true;
    state.mainSection = "workers";
    state.zones = [{ id: "old-zone" }];
    state.dnsRecords = [{ id: "old-record" }];

    await actions.submitCloudflareAccount({ preventDefault() {} });

    assert.deepEqual(requested, [
      [
        "/api/session/cloudflare-accounts",
        "POST",
        JSON.stringify({
          cfApiKey: "new-secret-key",
          cfEmail: "new@example.com",
          cloudflareName: "新增账号",
        }),
      ],
    ]);
    assert.equal(loadZonesCalled, 1);
    assert.equal(state.cloudflareAccountDialogOpen, false);
    assert.equal(state.cloudflareAccountSaving, false);
    assert.equal(state.activeCloudflareAccountId, "cf2");
    assert.equal(state.sessionEmail, "ne*@example.com");
    assert.deepEqual(state.dnsRecords, []);
    assert.deepEqual(state.zones, [{ id: "new-zone" }]);
    assert.equal(state.mainSection, "domain");
    assert.equal(renderCount >= 2, true);
  } finally {
    global.document = previousDocument;
    global.fetch = previousFetch;
    global.FormData = previousFormData;
    global.history = previousHistory;
  }
});

test("switching Cloudflare accounts resets account-scoped front-end data and reloads zones", async () => {
  const previousFetch = global.fetch;
  const previousHistory = global.history;
  const requested = [];
  let loadZonesCalled = 0;
  let renderCount = 0;

  global.fetch = async (url, options = {}) => {
    requested.push([String(url), options.method || "GET"]);

    return new Response(
      JSON.stringify({
        accounts: [
          { active: false, email: "fi***@example.com", id: "cf1", name: "主账号" },
          { active: true, email: "se****@example.com", id: "cf2", name: "备用账号" },
        ],
        activeCloudflareAccount: {
          email: "se****@example.com",
          id: "cf2",
          name: "备用账号",
        },
        authenticated: true,
        email: "se****@example.com",
        expiresAt: "2026-06-06T00:00:00.000Z",
        hasCredentials: true,
        loginRequired: true,
        source: "cookie",
      }),
      {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
      }
    );
  };
  global.history = {
    replaceState() {},
  };

  state.connected = true;
  state.activeCloudflareAccountId = "cf1";
  state.cloudflareAccounts = [
    { active: true, email: "fi***@example.com", id: "cf1", name: "主账号" },
    { active: false, email: "se****@example.com", id: "cf2", name: "备用账号" },
  ];
  state.zones = [{ id: "old-zone" }];
  state.dnsRecords = [{ id: "old-record" }];
  state.workersList = [{ name: "old-worker" }];
  state.operationHistory = [{ id: "old-history" }];
  state.mainSection = "workers";

  const actions = createSessionActions({
    async loadZones() {
      loadZonesCalled += 1;
      state.zones = [{ id: "new-zone" }];
    },
    renderApp() {
      renderCount += 1;
    },
  });

  try {
    await actions.changeCloudflareAccount({ target: { value: "cf2" } });

    assert.deepEqual(requested, [["/api/session/cloudflare-accounts/cf2/select", "POST"]]);
    assert.equal(loadZonesCalled, 1);
    assert.equal(state.activeCloudflareAccountId, "cf2");
    assert.equal(state.sessionEmail, "se****@example.com");
    assert.deepEqual(state.zones, [{ id: "new-zone" }]);
    assert.deepEqual(state.dnsRecords, []);
    assert.deepEqual(state.workersList, []);
    assert.deepEqual(state.operationHistory, []);
    assert.equal(state.mainSection, "domain");
    assert.equal(state.selectingCloudflareAccount, false);
    assert.equal(renderCount >= 2, true);
  } finally {
    global.fetch = previousFetch;
    global.history = previousHistory;
  }
});
