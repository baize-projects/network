import { once } from "node:events";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { createConfig } from "../src/config/env.js";
import { startServer } from "../src/server.js";
import {
  allocatePanelPort,
  preparePanelTestEnvironment,
} from "./helpers/panel-test-environment.js";

function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  return once(server, "listening").then(() => {
    const address = server.address();
    return `http://127.0.0.1:${address.port}`;
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startPanel(env) {
  const prepared = preparePanelTestEnvironment(env);
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...prepared.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  return {
    child,
    output,
    async stop() {
      child.kill();
      await once(child, "exit").catch(() => {});
      prepared.cleanup();
    },
  };
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (const char of String(input).toUpperCase().replace(/[\s=-]/g, "")) {
    const index = alphabet.indexOf(char);

    if (index === -1) {
      throw new Error("Invalid base32 character");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function makeTotp(secret, now = Date.now()) {
  const counter = Math.floor(now / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

function makeZone(overrides = {}) {
  return {
    id: "a".repeat(32),
    name: "alpha.example",
    status: "active",
    paused: false,
    type: "full",
    plan: { id: "free", name: "Free Website", legacy_id: "free" },
    ...overrides,
  };
}

function makeRecord(overrides = {}) {
  return {
    id: "b".repeat(32),
    type: "A",
    name: "www.alpha.example",
    content: "192.0.2.10",
    ttl: 1,
    proxied: true,
    proxiable: true,
    comment: "",
    tags: [],
    created_on: "2026-01-01T00:00:00Z",
    modified_on: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeFirewallRule(overrides = {}) {
  return {
    id: "d".repeat(32),
    action: "block",
    description: "Block test traffic",
    filter: {
      id: "e".repeat(32),
      description: "Block test traffic",
      expression: "ip.src eq 192.0.2.10",
      paused: false,
    },
    paused: false,
    priority: 50,
    products: ["waf"],
    ref: "panel-test",
    ...overrides,
  };
}

function makePageRule(overrides = {}) {
  return {
    id: "f".repeat(32),
    targets: [
      {
        target: "url",
        constraint: {
          operator: "matches",
          value: "*.alpha.example/images/*",
        },
      },
    ],
    actions: [
      { id: "cache_level", value: "cache_everything" },
      { id: "browser_cache_ttl", value: 14400 },
    ],
    priority: 1,
    status: "active",
    created_on: "2026-01-01T00:00:00Z",
    modified_on: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCustomCertificate(overrides = {}) {
  return {
    id: "c".repeat(32),
    hosts: ["alpha.example", "*.alpha.example"],
    issuer: "Let's Encrypt",
    signature: "SHA256WithRSA",
    status: "active",
    expires_on: "2026-12-31T00:00:00Z",
    uploaded_on: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("lists all Cloudflare zones through paginated API responses", async () => {
  const requests = [];
  const cloudflareMock = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({
      path: url.pathname,
      page: url.searchParams.get("page"),
      perPage: url.searchParams.get("per_page"),
      email: request.headers["x-auth-email"],
      key: request.headers["x-auth-key"],
    });

    const page = Number(url.searchParams.get("page"));
    const result =
      page === 1
        ? [
            {
              ...makeZone({ id: "zone-one" }),
            },
          ]
        : [
            {
              ...makeZone({
                id: "zone-two",
                name: "beta.example",
                status: "pending",
                paused: true,
                type: "partial",
                plan: { id: "pro", name: "Pro Website", legacy_id: "pro" },
              }),
            },
          ];

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result,
        result_info: {
          page,
          per_page: 50,
          total_pages: 2,
          total_count: 2,
        },
      })
    );
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3210;
  const panel = startPanel({
    AUTH: "JBSWY3DPEHPK3PXP",
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);
    const response = await fetch(`http://127.0.0.1:${panelPort}/api/zones`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.zones.map((zone) => [zone.id, zone.name, zone.status, zone.plan.name]),
      [
        ["zone-one", "alpha.example", "active", "Free Website"],
        ["zone-two", "beta.example", "pending", "Pro Website"],
      ]
    );
    assert.deepEqual(
      requests.map((request) => [request.path, request.page, request.perPage]),
      [
        ["/zones", "1", "50"],
        ["/zones", "2", "50"],
      ]
    );
    assert.equal(requests[0].email, "admin@example.com");
    assert.equal(requests[0].key, "global-key");
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("requires first-run setup before Cloudflare APIs are available", async () => {
  const panelPort = 3211;
  const panel = startPanel({
    NODE_ENV: "production",
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "",
    CLOUDFLARE_GLOBAL_API_KEY: "",
    SETUP_TOKEN: "manual-setup-token",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);
    const response = await fetch(`http://127.0.0.1:${panelPort}/api/zones`, {
      headers: { "x-panel-test-skip-auth": "true" },
    });
    const payload = await response.json();

    assert.equal(response.status, 412);
    assert.match(payload.error, /首次初始化/);
  } finally {
    await panel.stop();
  }
});

test("generated first-run setup token is stored in a local file and not printed in full", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cf-panel-setup-token-"));
  const messages = [];
  const server = startServer({
    config: createConfig({
      DATA_DIR: dir,
      PORT: "0",
      SQLITE_PATH: join(dir, "panel.sqlite"),
    }),
    logger: {
      log(message) {
        messages.push(String(message));
      },
    },
  });

  try {
    await once(server, "listening");
    const token = (await readFile(join(dir, "setup-token.txt"), "utf8")).trim();
    const output = messages.join("\n");

    assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(output.includes(token), false);
    assert.match(output, /not printed in full/);
    assert.match(output, new RegExp(`${token.slice(0, 4)}\\.\\.\\.${token.slice(-4)}`));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { force: true, recursive: true });
  }
});

test("requires the one-time setup token before exposing TOTP setup secret", async () => {
  const panelPort = await allocatePanelPort();
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "",
    CLOUDFLARE_GLOBAL_API_KEY: "",
    SETUP_TOKEN: "protected-setup-token",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const missingTokenResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "wrong-token" }),
    });
    const missingTokenPayload = await missingTokenResponse.json();
    const validTokenResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "protected-setup-token" }),
    });
    const validTokenPayload = await validTokenResponse.json();

    assert.equal(missingTokenResponse.status, 401);
    assert.match(missingTokenPayload.error, /初始化口令/);
    assert.equal(Object.hasOwn(missingTokenPayload, "secret"), false);
    assert.equal(validTokenResponse.status, 200);
    assert.match(validTokenPayload.secret, /^[A-Z2-7 ]+$/);
  } finally {
    await panel.stop();
  }
});

test("rate limits setup secret requests before exposing the TOTP seed", async () => {
  const panelPort = await allocatePanelPort();
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "",
    CLOUDFLARE_GLOBAL_API_KEY: "",
    RATE_LIMIT_ATTEMPTS: "2",
    SETUP_TOKEN: "rate-limited-setup-token",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const firstResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "wrong-token" }),
    });
    const secondResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "wrong-token" }),
    });
    const blockedResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "rate-limited-setup-token" }),
    });
    const blockedPayload = await blockedResponse.json();

    assert.equal(firstResponse.status, 401);
    assert.equal(secondResponse.status, 401);
    assert.equal(blockedResponse.status, 429);
    assert.match(blockedPayload.error, /请求过于频繁/);
  } finally {
    await panel.stop();
  }
});

test("initializes admin first and then saves multiple Cloudflare accounts", async () => {
  const panelPort = await allocatePanelPort();
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "",
    CLOUDFLARE_GLOBAL_API_KEY: "",
    SETUP_TOKEN: "manual-setup-token",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const secretResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "manual-setup-token" }),
    });
    const secretPayload = await secretResponse.json();

    assert.equal(secretResponse.status, 200);
    assert.match(secretPayload.secret, /^[A-Z2-7 ]+$/);

    const adminResponse = await fetch(`http://127.0.0.1:${panelPort}/api/setup/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "strong-password",
        setupToken: "manual-setup-token",
        totpCode: makeTotp(secretPayload.secret),
        totpSecret: secretPayload.secret,
        username: "operator",
      }),
    });
    const adminPayload = await adminResponse.json();
    const sessionCookie = adminResponse.headers.get("set-cookie")?.split(";")[0] || "";
    const setupTokenAfterAdmin = await fetch(`http://127.0.0.1:${panelPort}/api/setup/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupToken: "manual-setup-token" }),
    });

    assert.equal(adminResponse.status, 201);
    assert.equal(setupTokenAfterAdmin.status, 409);
    assert.equal(adminPayload.authenticated, true);
    assert.equal(adminPayload.setupRequired, true);
    assert.equal(adminPayload.setupState.panelUserRequired, false);
    assert.equal(adminPayload.setupState.cloudflareAccountRequired, true);
    assert.match(sessionCookie, /cf_panel_session=/);
    assert.doesNotMatch(adminResponse.headers.get("set-cookie") || "", /;\s*Secure\b/i);

    const missingCookieAccountsResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/setup/cloudflare-accounts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: [
            {
              cfApiKey: "first-secret-key",
              cfEmail: "first@example.com",
              cloudflareName: "主账号",
            },
          ],
        }),
      }
    );
    const missingCookieAccountsPayload = await missingCookieAccountsResponse.json();

    assert.equal(missingCookieAccountsResponse.status, 401);
    assert.match(missingCookieAccountsPayload.error, /请先创建管理员账户并登录/);

    const recoveryResponse = await fetch(`http://127.0.0.1:${panelPort}/api/session/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: makeTotp(secretPayload.secret),
        password: "strong-password",
        user: "operator",
      }),
    });
    const recoveryPayload = await recoveryResponse.json();
    const recoveryCookie = recoveryResponse.headers.get("set-cookie")?.split(";")[0] || "";

    assert.equal(recoveryResponse.status, 200);
    assert.equal(recoveryPayload.authenticated, true);
    assert.equal(recoveryPayload.setupRequired, true);
    assert.equal(recoveryPayload.hasCredentials, false);
    assert.equal(recoveryPayload.setupState.panelUserRequired, false);
    assert.equal(recoveryPayload.setupState.cloudflareAccountRequired, true);
    assert.match(recoveryCookie, /cf_panel_session=/);
    assert.doesNotMatch(recoveryResponse.headers.get("set-cookie") || "", /;\s*Secure\b/i);

    const accountsResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/setup/cloudflare-accounts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: recoveryCookie,
          "X-CSRF-Token": recoveryPayload.csrfToken,
        },
        body: JSON.stringify({
          accounts: [
            {
              cfApiKey: "first-secret-key",
              cfEmail: "first@example.com",
              cloudflareName: "主账号",
            },
            {
              cfApiKey: "second-secret-key",
              cfEmail: "second@example.com",
              cloudflareName: "备用账号",
            },
          ],
        }),
      }
    );
    const accountsPayload = await accountsResponse.json();
    const serializedAccountsPayload = JSON.stringify(accountsPayload);

    assert.equal(accountsResponse.status, 201);
    assert.equal(accountsPayload.authenticated, true);
    assert.equal(accountsPayload.setupRequired, false);
    assert.equal(accountsPayload.hasCredentials, true);
    assert.equal(accountsPayload.accounts.length, 2);
    assert.equal(accountsPayload.accounts[0].email, "fi***@example.com");
    assert.equal(accountsPayload.accounts[1].email, "se****@example.com");
    assert.equal(serializedAccountsPayload.includes("first-secret-key"), false);
    assert.equal(serializedAccountsPayload.includes("second-secret-key"), false);
  } finally {
    await panel.stop();
  }
});

test("rejects authenticated state-changing requests without CSRF token", async () => {
  const panelPort = await allocatePanelPort();
  const panel = startPanel({
    AUTH: "JBSWY3DPEHPK3PXP",
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);
    await fetch(`http://127.0.0.1:${panelPort}/api/session/status`, {
      headers: { "x-panel-test-prepare": "true" },
    });

    const loginResponse = await fetch(`http://127.0.0.1:${panelPort}/api/session/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth: makeTotp("JBSWY3DPEHPK3PXP"),
        password: "strong-password",
        user: "operator",
      }),
    });
    const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0] || "";
    const blockedResponse = await fetch(`http://127.0.0.1:${panelPort}/api/session/logout`, {
      method: "POST",
      headers: { Cookie: sessionCookie },
    });
    const blockedPayload = await blockedResponse.json();

    assert.equal(loginResponse.status, 200);
    assert.equal(blockedResponse.status, 403);
    assert.match(blockedPayload.error, /CSRF/);
  } finally {
    await panel.stop();
  }
});

test("creates a Cloudflare zone from the add-domain endpoint", async () => {
  const requests = [];
  const accountId = "account_owner_1";
  const zoneId = "a".repeat(32);
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    requests.push({
      body: bodyText ? JSON.parse(bodyText) : null,
      method: request.method,
      path: url.pathname,
    });

    if (request.method === "GET" && url.pathname === "/accounts") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [{ id: accountId, name: "Primary Account" }],
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/zones") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makeZone({
            id: zoneId,
            name: requests.at(-1).body.name,
            status: "pending",
          }),
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3250;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const createResponse = await fetch(`http://127.0.0.1:${panelPort}/api/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Example.COM", jumpStart: false }),
    });
    const createPayload = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.zone.id, zoneId);
    assert.equal(createPayload.zone.name, "example.com");
    assert.equal(createPayload.zone.status, "pending");
    assert.deepEqual(
      requests.map((request) => [request.method, request.path, request.body]),
      [
        ["GET", "/accounts", null],
        [
          "POST",
          "/zones",
          {
            account: { id: accountId },
            jump_start: false,
            name: "example.com",
            type: "full",
          },
        ],
      ]
    );
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("keeps SQLite account status hidden until panel login", async () => {
  const panelPort = 3215;
  const panel = startPanel({
    PORT: String(panelPort),
    EMAIL1: "admin@example.com",
    CF_API1: "global-key",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);
    await fetch(`http://127.0.0.1:${panelPort}/api/session/status`, {
      headers: { "x-panel-test-prepare": "true" },
    });

    const statusResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/status`
    );
    const statusPayload = await statusResponse.json();

    assert.equal(statusResponse.status, 200);
    assert.equal(statusPayload.authenticated, false);
    assert.equal(statusPayload.hasCredentials, false);
    assert.equal(statusPayload.email, "");
    assert.deepEqual(statusPayload.accounts, []);
    assert.equal(statusPayload.loginRequired, true);
    assert.equal(statusPayload.setupRequired, false);
    assert.equal(JSON.stringify(statusPayload).includes("global-key"), false);

    const connectResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: "admin",
          password: "password",
          auth: "123456",
        }),
      }
    );
    const connectPayload = await connectResponse.json();

    assert.equal(connectResponse.status, 401);
    assert.match(connectPayload.error, /用户名、密码或 2FA/);

    const partialConnectResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: "admin" }),
      }
    );
    const partialConnectPayload = await partialConnectResponse.json();

    assert.equal(partialConnectResponse.status, 400);
    assert.match(partialConnectPayload.error, /用户名、密码和 2FA/);
  } finally {
    await panel.stop();
  }
});

test("uses panel login cookies and switches between SQLite Cloudflare accounts", async () => {
  const requests = [];
  const cloudflareMock = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({
      email: request.headers["x-auth-email"],
      key: request.headers["x-auth-key"],
      path: url.pathname,
    });

    if (request.method === "GET" && url.pathname === "/zones") {
      const zoneId =
        request.headers["x-auth-key"] === "second-secret-key" ? "second-zone" : "first-zone";
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeZone({ id: zoneId })],
          result_info: { page: 1, per_page: 50, total_pages: 1, total_count: 1 },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3216;
  const authSecret = "JBSWY3DPEHPK3PXP";
  const panel = startPanel({
    PORT: String(panelPort),
    USER: "operator",
    PASSWORD: "strong-password",
    AUTH: authSecret,
    EMAIL1: "first@example.com",
    CF_API1: "first-secret-key",
    CF_NAME1: "主账号",
    EMAIL2: "second@example.com",
    CF_API2: "second-secret-key",
    CF_NAME2: "备用账号",
    CLOUDFLARE_API_BASE_URL: mockUrl,
    SESSION_TTL_DAYS: "30",
    SECURE_COOKIES: "false",
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);
    await fetch(`http://127.0.0.1:${panelPort}/api/session/status`, {
      headers: { "x-panel-test-prepare": "true" },
    });

    const initialStatusResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/status`
    );
    const initialStatusPayload = await initialStatusResponse.json();

    assert.equal(initialStatusResponse.status, 200);
    assert.equal(initialStatusPayload.hasCredentials, false);
    assert.equal(initialStatusPayload.authenticated, false);
    assert.equal(initialStatusPayload.loginRequired, true);
    assert.equal(initialStatusPayload.setupRequired, false);
    assert.deepEqual(initialStatusPayload.accounts, []);
    assert.equal(JSON.stringify(initialStatusPayload).includes("first@example.com"), false);
    assert.equal(JSON.stringify(initialStatusPayload).includes("first-secret-key"), false);

    const noCookieZonesResponse = await fetch(`http://127.0.0.1:${panelPort}/api/zones`, {
      headers: { "x-panel-test-skip-auth": "true" },
    });
    const noCookieZonesPayload = await noCookieZonesResponse.json();

    assert.equal(noCookieZonesResponse.status, 401);
    assert.match(noCookieZonesPayload.error, /请先登录面板/);

    const connectResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: "operator",
          password: "strong-password",
          auth: makeTotp(authSecret),
        }),
      }
    );
    const connectPayload = await connectResponse.json();
    const setCookie = connectResponse.headers.get("set-cookie") || "";
    const sessionCookie = setCookie.split(";")[0];

    assert.equal(connectResponse.status, 200);
    assert.equal(connectPayload.authenticated, true);
    assert.equal(connectPayload.hasCredentials, true);
    assert.equal(connectPayload.email, "fi***@example.com");
    assert.match(connectPayload.activeCloudflareAccount.id, /^cf_/);
    assert.equal(connectPayload.accounts.length, 2);
    assert.equal(connectPayload.accounts[0].email, "fi***@example.com");
    assert.equal(connectPayload.accounts[1].email, "se****@example.com");
    const firstAccountId = connectPayload.accounts[0].id;
    const secondAccountId = connectPayload.accounts[1].id;
    assert.equal(connectPayload.source, "cookie");
    assert.match(connectPayload.expiresAt, /T/);
    assert.match(setCookie, /cf_panel_session=/);
    assert.match(setCookie, /Max-Age=2592000/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.equal(setCookie.includes("first-secret-key"), false);
    assert.equal(setCookie.includes("first@example.com"), false);
    assert.equal(JSON.stringify(connectPayload).includes("first-secret-key"), false);
    assert.equal(JSON.stringify(connectPayload).includes("second-secret-key"), false);

    const cookieStatusResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/status`,
      {
        headers: { Cookie: sessionCookie },
      }
    );
    const cookieStatusPayload = await cookieStatusResponse.json();

    assert.equal(cookieStatusResponse.status, 200);
    assert.equal(cookieStatusPayload.authenticated, true);
    assert.equal(cookieStatusPayload.hasCredentials, true);
    assert.equal(cookieStatusPayload.email, "fi***@example.com");
    assert.equal(cookieStatusPayload.source, "cookie");
    assert.equal(cookieStatusPayload.activeCloudflareAccount.id, firstAccountId);
    assert.equal(JSON.stringify(cookieStatusPayload).includes("first-secret-key"), false);

    const zonesResponse = await fetch(`http://127.0.0.1:${panelPort}/api/zones`, {
      headers: { Cookie: sessionCookie },
    });
    const zonesPayload = await zonesResponse.json();

    assert.equal(zonesResponse.status, 200);
    assert.equal(zonesPayload.zones[0].id, "first-zone");

    const switchResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/cloudflare-accounts/${secondAccountId}/select`,
      {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          "X-CSRF-Token": connectPayload.csrfToken,
        },
      }
    );
    const switchPayload = await switchResponse.json();

    assert.equal(switchResponse.status, 200);
    assert.equal(switchPayload.activeCloudflareAccount.id, secondAccountId);
    assert.equal(switchPayload.email, "se****@example.com");
    assert.equal(JSON.stringify(switchPayload).includes("second-secret-key"), false);

    const switchedZonesResponse = await fetch(`http://127.0.0.1:${panelPort}/api/zones`, {
      headers: { Cookie: sessionCookie },
    });
    const switchedZonesPayload = await switchedZonesResponse.json();

    assert.equal(switchedZonesResponse.status, 200);
    assert.equal(switchedZonesPayload.zones[0].id, "second-zone");
    assert.deepEqual(
      requests.map((request) => [request.path, request.email, request.key]),
      [
        ["/zones", "first@example.com", "first-secret-key"],
        ["/zones", "second@example.com", "second-secret-key"],
      ]
    );

    const historyResponse = await fetch(`http://127.0.0.1:${panelPort}/api/operation-history`, {
      headers: { Cookie: sessionCookie },
    });
    const historyPayload = await historyResponse.json();
    const serializedHistory = JSON.stringify(historyPayload);

    assert.equal(historyResponse.status, 200);
    assert.equal(serializedHistory.includes("first-secret-key"), false);
    assert.equal(serializedHistory.includes("second-secret-key"), false);
    assert.equal(serializedHistory.includes("strong-password"), false);

    const logoutResponse = await fetch(`http://127.0.0.1:${panelPort}/api/session/logout`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        "X-CSRF-Token": connectPayload.csrfToken,
      },
    });
    const logoutPayload = await logoutResponse.json();
    const clearCookie = logoutResponse.headers.get("set-cookie") || "";

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutPayload.ok, true);
    assert.match(clearCookie, /cf_panel_session=/);
    assert.match(clearCookie, /Max-Age=0/);

    const revokedStatusResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/session/status`,
      {
        headers: { Cookie: sessionCookie },
      }
    );
    const revokedStatusPayload = await revokedStatusResponse.json();

    assert.equal(revokedStatusResponse.status, 200);
    assert.equal(revokedStatusPayload.hasCredentials, false);
    assert.equal(revokedStatusPayload.authenticated, false);
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("manages DNS records through Cloudflare DNS records API", async () => {
  const zoneId = "a".repeat(32);
  const recordId = "b".repeat(32);
  const firstBulkRecordId = "d".repeat(32);
  const secondBulkRecordId = "e".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    requests.push({
      method: request.method,
      path: url.pathname,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (request.method === "GET" && url.pathname === "/zones") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeZone({ id: zoneId })],
          result_info: { page: 1, per_page: 50, total_pages: 1, total_count: 1 },
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === `/zones/${zoneId}/dns_records`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeRecord({ id: recordId })],
          result_info: { page: 1, per_page: 100, total_pages: 1, total_count: 1 },
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === `/zones/${zoneId}/dns_records`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makeRecord({ id: "c".repeat(32), ...requests.at(-1).body }),
        })
      );
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname === `/zones/${zoneId}/dns_records/${recordId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makeRecord({ id: recordId, ...requests.at(-1).body }),
        })
      );
      return;
    }

    const deleteRecordMatch = url.pathname.match(
      new RegExp(`^/zones/${zoneId}/dns_records/(?<recordId>[a-z0-9]{32})$`, "i")
    );

    if (request.method === "DELETE" && deleteRecordMatch) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: deleteRecordMatch.groups.recordId },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3212;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const listResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records`
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.records[0].name, "www.alpha.example");

    const createResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "A",
          name: "api.alpha.example",
          content: "192.0.2.20",
          ttl: 1,
          proxied: true,
        }),
      }
    );
    const createPayload = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.record.name, "api.alpha.example");

    const bulkCreateResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records/bulk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: [
            {
              type: "A",
              name: "bulk-one.alpha.example",
              content: "192.0.2.40",
              ttl: 1,
              proxied: true,
            },
            {
              type: "MX",
              name: "alpha.example",
              content: "mail.alpha.example",
              ttl: 300,
              priority: 20,
            },
          ],
        }),
      }
    );
    const bulkCreatePayload = await bulkCreateResponse.json();
    assert.equal(bulkCreateResponse.status, 201);
    assert.equal(bulkCreatePayload.records.length, 2);
    assert.equal(bulkCreatePayload.records[0].name, "bulk-one.alpha.example");
    assert.equal(bulkCreatePayload.records[1].priority, 20);

    const updateResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records/${recordId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "A",
          name: "www.alpha.example",
          content: "192.0.2.30",
          ttl: 120,
          proxied: false,
        }),
      }
    );
    const updatePayload = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.record.content, "192.0.2.30");
    assert.equal(updatePayload.record.proxied, false);

    const deleteResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records/${recordId}`,
      { method: "DELETE" }
    );
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.id, recordId);

    const bulkDeleteResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/dns-records/bulk-delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordIds: [firstBulkRecordId, secondBulkRecordId, firstBulkRecordId],
        }),
      }
    );
    const bulkDeletePayload = await bulkDeleteResponse.json();
    assert.equal(bulkDeleteResponse.status, 200);
    assert.deepEqual(
      bulkDeletePayload.deleted.map((item) => item.id),
      [firstBulkRecordId, secondBulkRecordId]
    );

    assert.deepEqual(
      requests
        .filter((request) => request.path.includes("/dns_records"))
        .map((request) => [request.method, request.path]),
      [
        ["GET", `/zones/${zoneId}/dns_records`],
        ["POST", `/zones/${zoneId}/dns_records`],
        ["POST", `/zones/${zoneId}/dns_records`],
        ["POST", `/zones/${zoneId}/dns_records`],
        ["PATCH", `/zones/${zoneId}/dns_records/${recordId}`],
        ["DELETE", `/zones/${zoneId}/dns_records/${recordId}`],
        ["DELETE", `/zones/${zoneId}/dns_records/${firstBulkRecordId}`],
        ["DELETE", `/zones/${zoneId}/dns_records/${secondBulkRecordId}`],
      ]
    );
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("manages cache settings and purge requests through Cloudflare cache APIs", async () => {
  const zoneId = "a".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    requests.push({
      method: request.method,
      path: url.pathname,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    const settingMatch = url.pathname.match(
      new RegExp(`^/zones/${zoneId}/settings/(?<settingId>[a-z0-9_]+)$`)
    );

    if (settingMatch && request.method === "GET") {
      const values = {
        cache_level: "aggressive",
        browser_cache_ttl: 14400,
        development_mode: "off",
        always_online: "on",
      };

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: settingMatch.groups.settingId,
            value: values[settingMatch.groups.settingId],
            editable: true,
            modified_on: "2026-01-01T00:00:00Z",
          },
        })
      );
      return;
    }

    if (settingMatch && request.method === "PATCH") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: {
            id: settingMatch.groups.settingId,
            value: requests.at(-1).body.value,
            editable: true,
          },
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === `/zones/${zoneId}/purge_cache`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: zoneId },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3213;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const listResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/cache-settings`
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.settings.cacheLevel.value, "aggressive");
    assert.equal(listPayload.settings.alwaysOnline.value, true);

    const updateResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/cache-settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheLevel: "basic",
          browserCacheTtl: 7200,
          developmentMode: true,
        }),
      }
    );
    assert.equal(updateResponse.status, 200);

    const purgeResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/purge-cache`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "url",
          url: "https://alpha.example/app.js",
        }),
      }
    );
    const purgePayload = await purgeResponse.json();
    assert.equal(purgeResponse.status, 200);
    assert.equal(purgePayload.mode, "url");

    assert.deepEqual(
      requests
        .filter((request) => request.method === "PATCH")
        .map((request) => [request.path, request.body.value]),
      [
        [`/zones/${zoneId}/settings/cache_level`, "basic"],
        [`/zones/${zoneId}/settings/browser_cache_ttl`, 7200],
        [`/zones/${zoneId}/settings/development_mode`, "on"],
      ]
    );
    assert.deepEqual(requests.at(-1).body, { files: ["https://alpha.example/app.js"] });
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("reads zone analytics through Cloudflare GraphQL API", async () => {
  const zoneId = "a".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: request.method,
      path: url.pathname,
      body,
    });

    if (
      request.method === "POST" &&
      url.pathname === "/graphql" &&
      body.query.includes("firewallEventsAdaptiveGroups")
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  firewallEventsAdaptiveGroups: [
                    {
                      count: 3,
                      dimensions: {
                        action: "block",
                        clientCountryName: "US",
                        clientIP: "192.0.2.1",
                        description: "Block scanner",
                        source: "waf",
                        userAgent: "bad-bot",
                      },
                    },
                  ],
                },
              ],
            },
          },
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/graphql") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  httpRequests1dGroups: [
                    {
                      dimensions: { date: body.variables.dateStart },
                      sum: {
                        bytes: 2048,
                        cachedBytes: 1024,
                        cachedRequests: 60,
                        encryptedBytes: 1800,
                        encryptedRequests: 90,
                        pageViews: 40,
                        requests: 100,
                        threats: 2,
                        responseStatusMap: [
                          { edgeResponseStatus: 200, requests: 80 },
                          { edgeResponseStatus: 404, requests: 20 },
                        ],
                        countryMap: [
                          { bytes: 1500, clientCountryName: "US", requests: 70, threats: 1 },
                          { bytes: 548, clientCountryName: "CN", requests: 30, threats: 1 },
                        ],
                        contentTypeMap: [
                          { bytes: 1200, edgeResponseContentTypeName: "html", requests: 60 },
                          { bytes: 848, edgeResponseContentTypeName: "js", requests: 40 },
                        ],
                      },
                      uniq: { uniques: 25 },
                    },
                    {
                      dimensions: { date: body.variables.dateEnd },
                      sum: {
                        bytes: 1024,
                        cachedBytes: 256,
                        cachedRequests: 20,
                        encryptedBytes: 1024,
                        encryptedRequests: 50,
                        pageViews: 15,
                        requests: 50,
                        threats: 0,
                        responseStatusMap: [{ edgeResponseStatus: 200, requests: 50 }],
                        countryMap: [
                          { bytes: 1024, clientCountryName: "US", requests: 50, threats: 0 },
                        ],
                        contentTypeMap: [
                          { bytes: 1024, edgeResponseContentTypeName: "html", requests: 50 },
                        ],
                      },
                      uniq: { uniques: 10 },
                    },
                  ],
                },
              ],
            },
          },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3216;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const response = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/analytics?days=3`
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.analytics.range.days, 3);
    assert.equal(payload.analytics.totals.requests, 150);
    assert.equal(payload.analytics.totals.cachedRequests, 80);
    assert.equal(payload.analytics.totals.cacheHitRate, 53.33);
    assert.equal(payload.analytics.totals.encryptedRate, 93.33);
    assert.equal(payload.analytics.trend.length, 3);
    assert.deepEqual(
      payload.analytics.topCountries.map((item) => [item.id, item.requests, item.threats]),
      [
        ["US", 120, 1],
        ["CN", 30, 1],
      ]
    );
    assert.deepEqual(
      payload.analytics.topStatuses.map((item) => [item.id, item.requests]),
      [
        ["200", 130],
        ["404", 20],
      ]
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[0].path, "/graphql");
    assert.equal(requests[0].body.variables.zoneTag, zoneId);
    assert.match(requests[0].body.query, /httpRequests1dGroups/);
    assert.match(requests[1].body.query, /firewallEventsAdaptiveGroups/);
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("manages firewall rules through Cloudflare firewall rules API", async () => {
  const zoneId = "a".repeat(32);
  const ruleId = "d".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    requests.push({
      method: request.method,
      path: url.pathname,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (request.method === "GET" && url.pathname === `/zones/${zoneId}/firewall/rules`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeFirewallRule({ id: ruleId })],
          result_info: { page: 1, per_page: 50, total_count: 1 },
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === `/zones/${zoneId}/firewall/rules`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeFirewallRule({ id: "f".repeat(32), ...requests.at(-1).body })],
          result_info: { page: 1, per_page: 50, total_count: 1 },
        })
      );
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname === `/zones/${zoneId}/firewall/rules/${ruleId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makeFirewallRule({ id: ruleId, ...requests.at(-1).body }),
        })
      );
      return;
    }

    if (
      request.method === "DELETE" &&
      url.pathname === `/zones/${zoneId}/firewall/rules/${ruleId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makeFirewallRule({ id: ruleId }),
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3214;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const listResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/firewall-rules`
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.rules[0].expression, "ip.src eq 192.0.2.10");

    const createResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/firewall-rules`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ip",
          target: "192.0.2.10",
          action: "block",
        }),
      }
    );
    const createPayload = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.rule.expression, "ip.src eq 192.0.2.10");

    const updateResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/firewall-rules/${ruleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "custom",
          target: '(http.user_agent contains "sqlmap")',
          action: "js_challenge",
          description: "Block scanners",
          filterId: "e".repeat(32),
          paused: true,
        }),
      }
    );
    const updatePayload = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.rule.action, "js_challenge");
    assert.equal(updatePayload.rule.expression, '(http.user_agent contains "sqlmap")');
    assert.equal(updatePayload.rule.paused, true);

    const deleteResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/firewall-rules/${ruleId}`,
      { method: "DELETE" }
    );
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.id, ruleId);

    const postRequest = requests.find((request) => request.method === "POST");
    assert.deepEqual(postRequest.body, {
      action: "block",
      description: "面板规则: ip 192.0.2.10",
      filter: {
        description: "面板规则: ip 192.0.2.10",
        expression: "ip.src eq 192.0.2.10",
        paused: false,
      },
      paused: false,
    });

    const patchRequest = requests.find((request) => request.method === "PATCH");
    assert.deepEqual(patchRequest.body, {
      action: "js_challenge",
      description: "Block scanners",
      filter: {
        id: "e".repeat(32),
        description: "Block scanners",
        expression: '(http.user_agent contains "sqlmap")',
        paused: true,
      },
      paused: true,
    });
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("manages page rules through Cloudflare page rules API", async () => {
  const zoneId = "a".repeat(32);
  const ruleId = "f".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const bodyChunks = [];

    for await (const chunk of request) {
      bodyChunks.push(chunk);
    }

    const bodyText = Buffer.concat(bodyChunks).toString("utf8");
    requests.push({
      method: request.method,
      path: url.pathname,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (request.method === "GET" && url.pathname === `/zones/${zoneId}/pagerules`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makePageRule({ id: ruleId })],
          result_info: { page: 1, per_page: 50, total_pages: 1, total_count: 1 },
        })
      );
      return;
    }

    if (request.method === "POST" && url.pathname === `/zones/${zoneId}/pagerules`) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makePageRule({ id: "g".repeat(32), ...requests.at(-1).body }),
        })
      );
      return;
    }

    if (
      request.method === "PATCH" &&
      url.pathname === `/zones/${zoneId}/pagerules/${ruleId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: makePageRule({ id: ruleId, ...requests.at(-1).body }),
        })
      );
      return;
    }

    if (
      request.method === "DELETE" &&
      url.pathname === `/zones/${zoneId}/pagerules/${ruleId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: ruleId },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3217;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const listResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/page-rules`
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.rules[0].urlPattern, "*.alpha.example/images/*");
    assert.equal(listPayload.rules[0].cacheLevel, "cache_everything");
    assert.equal(listPayload.rules[0].browserCacheTtl, "14400");

    const createResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/page-rules`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urlPattern: "*.alpha.example/private/*",
          cacheLevel: "bypass",
          securityLevel: "high",
          status: "active",
        }),
      }
    );
    const createPayload = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.rule.urlPattern, "*.alpha.example/private/*");

    const updateResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/page-rules/${ruleId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urlPattern: "*.alpha.example/old/*",
          forwardingType: "301",
          forwardingUrl: "https://alpha.example/new",
          status: "disabled",
        }),
      }
    );
    const updatePayload = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updatePayload.rule.forwardingType, "301");
    assert.equal(updatePayload.rule.forwardingUrl, "https://alpha.example/new");

    const invalidResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/page-rules`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urlPattern: "*.alpha.example/mixed/*",
          cacheLevel: "basic",
          alwaysUseHttps: "on",
        }),
      }
    );
    const invalidPayload = await invalidResponse.json();
    assert.equal(invalidResponse.status, 400);
    assert.match(invalidPayload.error, /始终 HTTPS/);

    const deleteResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/page-rules/${ruleId}`,
      { method: "DELETE" }
    );
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.id, ruleId);

    const postRequest = requests.find((request) => request.method === "POST");
    assert.deepEqual(postRequest.body, {
      targets: [
        {
          target: "url",
          constraint: {
            operator: "matches",
            value: "*.alpha.example/private/*",
          },
        },
      ],
      actions: [
        { id: "cache_level", value: "bypass" },
        { id: "security_level", value: "high" },
      ],
      status: "active",
    });

    const patchRequest = requests.find((request) => request.method === "PATCH");
    assert.deepEqual(patchRequest.body.actions, [
      {
        id: "forwarding_url",
        value: {
          url: "https://alpha.example/new",
          status_code: 301,
        },
      },
    ]);
    assert.equal(patchRequest.body.status, "disabled");
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("reads and deletes custom certificates through Cloudflare certificate APIs", async () => {
  const zoneId = "a".repeat(32);
  const certificateId = "custom-cert_01";
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({ method: request.method, path: url.pathname });

    if (
      request.method === "GET" &&
      url.pathname === `/zones/${zoneId}/ssl/universal/settings`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: {
            enabled: true,
            value: "auto",
            certificate_authority: "lets_encrypt",
            editable: true,
          },
        })
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === `/zones/${zoneId}/custom_certificates`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [makeCustomCertificate({ id: certificateId })],
          result_info: { page: 1, per_page: 50, total_pages: 1, total_count: 1 },
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/certificates") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [],
          result_info: { page: 1, per_page: 50, total_pages: 1, total_count: 0 },
        })
      );
      return;
    }

    if (
      request.method === "DELETE" &&
      url.pathname === `/zones/${zoneId}/custom_certificates/${certificateId}`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { id: certificateId },
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3218;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const listResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/certificates`
    );
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.universalSsl.enabled, true);
    assert.equal(listPayload.certificates[0].id, certificateId);
    assert.deepEqual(listPayload.certificates[0].hosts, [
      "alpha.example",
      "*.alpha.example",
    ]);

    const deleteResponse = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/certificates/${certificateId}`,
      { method: "DELETE" }
    );
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.id, certificateId);

    assert.deepEqual(
      requests.map((request) => [request.method, request.path]),
      [
        ["GET", `/zones/${zoneId}/ssl/universal/settings`],
        ["GET", `/zones/${zoneId}/custom_certificates`],
        ["GET", "/certificates"],
        ["DELETE", `/zones/${zoneId}/custom_certificates/${certificateId}`],
      ]
    );
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("keeps certificate page usable when custom certificate listing is unavailable", async () => {
  const zoneId = "a".repeat(32);
  const requests = [];
  const cloudflareMock = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({ method: request.method, path: url.pathname });

    if (
      request.method === "GET" &&
      url.pathname === `/zones/${zoneId}/ssl/universal/settings`
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: {
            enabled: true,
            value: "auto",
            certificate_authority: "lets_encrypt",
            editable: true,
          },
        })
      );
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === `/zones/${zoneId}/custom_certificates`
    ) {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: false,
          errors: [{ message: "custom certificates require Enterprise" }],
          messages: [],
          result: null,
        })
      );
      return;
    }

    if (request.method === "GET" && url.pathname === "/certificates") {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          success: false,
          errors: [{ message: "Origin CA requires permission" }],
          messages: [],
          result: null,
        })
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
  });

  const mockUrl = await listen(cloudflareMock);
  const panelPort = 3219;
  const panel = startPanel({
    PORT: String(panelPort),
    CLOUDFLARE_EMAIL: "admin@example.com",
    CLOUDFLARE_GLOBAL_API_KEY: "global-key",
    CLOUDFLARE_API_BASE_URL: mockUrl,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${panelPort}/`);

    const response = await fetch(
      `http://127.0.0.1:${panelPort}/api/zones/${zoneId}/certificates`
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.universalSsl.enabled, true);
    assert.deepEqual(payload.certificates, []);
    assert.equal(payload.warnings.length, 2);
    assert.match(payload.warnings[0], /Enterprise/);
    assert.deepEqual(
      requests.map((request) => [request.method, request.path]),
      [
        ["GET", `/zones/${zoneId}/ssl/universal/settings`],
        ["GET", `/zones/${zoneId}/custom_certificates`],
        ["GET", "/certificates"],
      ]
    );
  } finally {
    await panel.stop();
    cloudflareMock.close();
  }
});

test("renders firewall settings view without frontend reference errors", async () => {
  const [{ resetFirewallForm, state }, { renderFirewallSettingsView }] = await Promise.all([
    import("../public/js/state.js"),
    import("../public/js/views/zone/firewall-view.js"),
  ]);

  resetFirewallForm();
  state.selectedZone = {
    id: "a".repeat(32),
    name: "alpha.example",
    status: "active",
    plan: { id: "free", name: "Free Website" },
  };
  state.firewallRules = [];
  state.loadingFirewallRules = false;
  state.firewallError = "";
  state.notice = "";

  const html = renderFirewallSettingsView();

  assert.match(html, /防火墙规则管理/);
  assert.match(html, /规则类型/);
  assert.match(html, /动作/);
  assert.match(html, /暂无防火墙规则/);
});
