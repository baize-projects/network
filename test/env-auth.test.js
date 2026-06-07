import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { createConfig } from "../src/config/env.js";
import { CredentialSessionService } from "../src/services/credential-session-service.js";
import { PanelAuthService, generateTotpSecret } from "../src/services/panel-auth-service.js";
import { PersistentSecretService } from "../src/services/persistent-secret-service.js";
import { SetupGuardService } from "../src/services/setup-guard-service.js";
import { SqliteStore } from "../src/services/sqlite-store.js";
import { makeTotp } from "./helpers/panel-test-environment.js";

async function withStore(callback) {
  const dir = await mkdtemp(join(tmpdir(), "cf-panel-auth-"));
  const store = new SqliteStore({ databasePath: join(dir, "panel.sqlite") });

  try {
    return await callback(store);
  } finally {
    store.close();
    await rm(dir, { force: true, recursive: true });
  }
}

test("createConfig keeps sensitive account material out of environment parsing", () => {
  const config = createConfig({
    AUTH: "JBSWY3DPEHPK3PXP",
    CF_API1: "first-key",
    DATA_DIR: "/var/lib/network",
    EMAIL1: "first@example.com",
    PASSWORD: "panel-password",
    PORT: "3100",
    USER: "panel-user",
  });

  assert.equal(config.server.port, 3100);
  assert.equal(config.database.path, "/var/lib/network/panel.sqlite");
  assert.equal(config.database.secretPath, "/var/lib/network/secret.key");
  assert.equal(config.security.setupTokenPath, "/var/lib/network/setup-token.txt");
  assert.equal(Object.hasOwn(config, "auth"), false);
  assert.equal(Object.hasOwn(config.cloudflare, "accounts"), false);
  assert.equal(Object.hasOwn(config.cloudflare, "email"), false);
  assert.equal(Object.hasOwn(config.cloudflare, "globalApiKey"), false);
});

test("createConfig exposes explicit production hardening switches", () => {
  const config = createConfig({
    DATA_DIR: "/var/lib/network",
    ENABLE_D1_SQL_CONSOLE: "true",
    ENABLE_D1_SQL_MUTATIONS: "true",
    PANEL_SECRET_KEY: "x".repeat(32),
    PANEL_SECRET_KEY_FILE: "/run/secrets/cf-panel-key",
    PUBLIC_ORIGIN: "https://panel.example.com",
    SECURE_COOKIES: "true",
    TRUST_PROXY_HEADERS: "true",
  });

  assert.equal(config.database.secretKey, "x".repeat(32));
  assert.equal(config.database.secretKeyFile, "/run/secrets/cf-panel-key");
  assert.equal(config.features.d1SqlConsoleAllowMutations, true);
  assert.equal(config.features.d1SqlConsoleEnabled, true);
  assert.equal(config.server.publicOrigin, "https://panel.example.com");
  assert.equal(config.server.secureCookies, true);
  assert.equal(config.server.trustProxyHeaders, true);
});

test("createConfig does not force Secure cookies for Docker HTTP access", () => {
  assert.equal(
    createConfig({
      NODE_ENV: "production",
      SECURE_COOKIES: "false",
    }).server.secureCookies,
    false
  );
  assert.equal(
    createConfig({
      NODE_ENV: "production",
      SECURE_COOKIES: "true",
    }).server.secureCookies,
    true
  );
});

test("CredentialSessionService only marks cookies Secure for HTTPS-capable access", () => {
  const request = { headers: { host: "127.0.0.1:3000" }, socket: {} };
  const httpService = new CredentialSessionService();
  const httpSession = httpService.create({ authenticated: true });

  assert.doesNotMatch(httpService.createCookie(request, httpSession), /;\s*Secure\b/i);

  const publicOriginService = new CredentialSessionService({
    publicOrigin: "https://panel.example.com",
  });
  const publicOriginSession = publicOriginService.create({ authenticated: true });

  assert.match(publicOriginService.createCookie(request, publicOriginSession), /;\s*Secure\b/i);

  const forwardedService = new CredentialSessionService({ trustProxyHeaders: true });
  const forwardedSession = forwardedService.create({ authenticated: true });

  assert.match(
    forwardedService.createCookie(
      { headers: { "x-forwarded-proto": "https" }, socket: {} },
      forwardedSession
    ),
    /;\s*Secure\b/i
  );

  const forcedService = new CredentialSessionService({ secureCookies: true });
  const forcedSession = forcedService.create({ authenticated: true });

  assert.match(forcedService.createCookie(request, forcedSession), /;\s*Secure\b/i);
});

test("PersistentSecretService can read encryption material outside DATA_DIR", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cf-panel-secret-"));
  const externalSecretPath = join(dir, "panel-secret.key");
  const fallbackSecretPath = join(dir, "data", "secret.key");
  const externalSecret = "s".repeat(40);

  try {
    await writeFile(externalSecretPath, `${externalSecret}\n`, { mode: 0o600 });
    const service = new PersistentSecretService({
      externalSecretPath,
      secretPath: fallbackSecretPath,
    });

    assert.equal(service.readOrCreate(), externalSecret);
    await assert.rejects(readFile(fallbackSecretPath, "utf8"), /ENOENT/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("SetupGuardService persists generated setup token and removes it after setup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cf-panel-setup-guard-"));
  const tokenPath = join(dir, "setup-token.txt");
  const service = new SetupGuardService({ tokenPath });

  try {
    assert.equal(service.persistForInitialSetup(), true);
    assert.equal((await readFile(tokenPath, "utf8")).trim(), service.token);
    assert.equal((await stat(tokenPath)).mode & 0o777, 0o600);
    assert.equal(service.cleanupInitialSetupToken(), true);
    await assert.rejects(readFile(tokenPath, "utf8"), /ENOENT/);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("PanelAuthService creates SQLite setup and verifies TOTP login", async () => {
  await withStore((store) => {
    const secret = generateTotpSecret();
    const service = new PanelAuthService({ store });
    const result = service.createSetup({
      cfApiKey: "global-key-for-sqlite-storage",
      cfEmail: "first@example.com",
      cloudflareName: "主账号",
      password: "panel-password",
      totpCode: makeTotp(secret),
      totpSecret: secret,
      username: "operator",
    });

    assert.equal(result.statusCode, 201);
    const rawPanelUser = store.database.prepare("SELECT totp_secret FROM panel_user WHERE id = 1").get();
    const rawAccount = store.database.prepare("SELECT global_api_key FROM cloudflare_accounts LIMIT 1").get();

    assert.match(rawPanelUser.totp_secret, /^enc:v1:/);
    assert.match(rawAccount.global_api_key, /^enc:v1:/);
    assert.notEqual(rawPanelUser.totp_secret, secret.replace(/\s+/g, ""));
    assert.notEqual(rawAccount.global_api_key, "global-key-for-sqlite-storage");
    assert.equal(service.isConfigured(), true);
    assert.equal(store.hasCloudflareAccounts(), true);
    assert.equal(store.getCloudflareAccount().email, "first@example.com");
    assert.equal(store.getCloudflareAccount().globalApiKey, "global-key-for-sqlite-storage");
    assert.equal(
      service.verify({
        auth: makeTotp(secret),
        password: "panel-password",
        user: "operator",
      }),
      true
    );
    assert.equal(
      service.verify({
        auth: makeTotp(secret),
        password: "wrong-password",
        user: "operator",
      }),
      false
    );
  });
});

test("PanelAuthService ignores empty preset Cloudflare account rows during setup", async () => {
  await withStore((store) => {
    const secret = generateTotpSecret();
    const service = new PanelAuthService({ store });
    const userResult = service.createPanelUserSetup({
      password: "panel-password",
      totpCode: makeTotp(secret),
      totpSecret: secret,
      username: "operator",
    });
    const accountResult = service.createCloudflareAccountsSetup({
      accounts: [
        {
          cfApiKey: "global-key-for-sqlite-storage",
          cfEmail: "first@example.com",
          cloudflareName: "主账号",
        },
        {
          cfApiKey: "",
          cfEmail: "",
          cloudflareName: "备用账号",
        },
      ],
    });

    assert.equal(userResult.statusCode, 201);
    assert.equal(accountResult.statusCode, 201);
    assert.equal(accountResult.accounts.length, 1);
    assert.equal(store.listCloudflareAccounts().length, 1);
    assert.equal(store.getCloudflareAccount().email, "first@example.com");
  });
});

test("PanelAuthService rejects setup without mandatory 2FA confirmation", async () => {
  await withStore((store) => {
    const service = new PanelAuthService({ store });
    const result = service.createSetup({
      cfApiKey: "global-key-for-sqlite-storage",
      cfEmail: "first@example.com",
      password: "panel-password",
      totpCode: "123456",
      totpSecret: "JBSWY3DPEHPK3PXP",
      username: "operator",
    });

    assert.equal(result.statusCode, 400);
    assert.match(result.error, /2FA/);
    assert.equal(store.hasPanelUser(), false);
    assert.equal(store.hasCloudflareAccounts(), false);
  });
});
