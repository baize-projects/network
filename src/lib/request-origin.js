function normalizeOrigin(value = "") {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.host) {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

function firstHeaderValue(value = "") {
  return String(value || "").split(",")[0].trim();
}

function normalizeHost(value = "") {
  const host = firstHeaderValue(value);

  if (!host) {
    return "";
  }

  try {
    const parsed = new URL(`http://${host}`);

    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return "";
    }

    return parsed.host;
  } catch {
    return "";
  }
}

function normalizeProto(value = "", fallback = "http") {
  const proto = firstHeaderValue(value).toLowerCase();

  return ["http", "https"].includes(proto) ? proto : fallback;
}

export function expectedRequestOrigin(request, { publicOrigin = "", trustProxyHeaders = false } = {}) {
  const configuredOrigin = normalizeOrigin(publicOrigin);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const directHost = normalizeHost(request?.headers?.host || "");
  const forwardedHost = trustProxyHeaders
    ? normalizeHost(request?.headers?.["x-forwarded-host"] || "")
    : "";
  const host = forwardedHost || directHost;

  if (!host) {
    return "";
  }

  const directProto = request?.socket?.encrypted ? "https" : "http";
  const proto = trustProxyHeaders
    ? normalizeProto(request?.headers?.["x-forwarded-proto"] || "", directProto)
    : directProto;

  return `${proto}://${host}`;
}

export function sameOriginRequest(
  request,
  { publicOrigin = "", trustProxyHeaders = false } = {}
) {
  const expectedOrigin = expectedRequestOrigin(request, { publicOrigin, trustProxyHeaders });
  const origin = String(request?.headers?.origin || "").trim();
  const referer = String(request?.headers?.referer || "").trim();

  if (!expectedOrigin) {
    return false;
  }

  if (origin) {
    return origin === expectedOrigin;
  }

  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return true;
}
