import { join } from "node:path";

import { projectRoot } from "./paths.js";

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function createConfig(env = process.env) {
  const dataDir = env.DATA_DIR || join(projectRoot, "data");

  return {
    database: {
      path: env.SQLITE_PATH || join(dataDir, "panel.sqlite"),
      secretKey: env.PANEL_SECRET_KEY || "",
      secretKeyFile: env.PANEL_SECRET_KEY_FILE || "",
      secretPath: env.SECRET_KEY_PATH || join(dataDir, "secret.key"),
    },
    server: {
      port: parsePort(env.PORT, 3000),
      publicOrigin: env.PUBLIC_ORIGIN || "",
      secureCookies: parseBoolean(env.SECURE_COOKIES, false),
      trustProxyHeaders: parseBoolean(env.TRUST_PROXY_HEADERS, false),
    },
    cloudflare: {
      apiBaseUrl: env.CLOUDFLARE_API_BASE_URL || "https://api.cloudflare.com/client/v4",
      requestTimeoutMs: parsePositiveNumber(env.CLOUDFLARE_REQUEST_TIMEOUT_MS, 15_000),
      zonesPerPage: 50,
    },
    features: {
      d1SqlConsoleAllowMutations: env.ENABLE_D1_SQL_MUTATIONS === "true",
      d1SqlConsoleEnabled: env.ENABLE_D1_SQL_CONSOLE === "true",
    },
    security: {
      rateLimitAttempts: parsePositiveNumber(env.RATE_LIMIT_ATTEMPTS, 8),
      rateLimitWindowMs: parsePositiveNumber(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      setupToken: env.SETUP_TOKEN || "",
      setupTokenPath: env.SETUP_TOKEN_PATH || join(dataDir, "setup-token.txt"),
    },
    session: {
      ttlDays: parsePositiveNumber(env.SESSION_TTL_DAYS, 30),
    },
  };
}
