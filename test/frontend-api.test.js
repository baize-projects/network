import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDnsBulkText } from "../public/js/actions/dns-actions.js";
import { createSessionActions } from "../public/js/actions/session-actions.js";
import { renderConnectView } from "../public/js/views/connect-view.js";
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
