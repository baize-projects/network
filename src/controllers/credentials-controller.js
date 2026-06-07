import { readJsonBody } from "../lib/request-body.js";
import { createOtpAuthUrl, generateTotpSecret } from "../services/panel-auth-service.js";

export class CredentialsController {
  constructor({
    authRateLimiter,
    cloudflareAccountService,
    cloudflareClient,
    credentialSessionService,
    panelAuthService,
    setupGuardService,
  }) {
    this.authRateLimiter = authRateLimiter;
    this.cloudflareAccountService = cloudflareAccountService;
    this.cloudflareClient = cloudflareClient;
    this.credentialSessionService = credentialSessionService;
    this.panelAuthService = panelAuthService;
    this.setupGuardService = setupGuardService;
  }

  status = async ({ request }) => {
    const sessionCredentials = this.credentialSessionService.getCredentials(request);
    const setupState = this.panelAuthService.getSetupState();
    const panelLoginConfigured = this.panelAuthService.isConfigured();
    const hasCloudflareAccounts = this.cloudflareAccountService.hasAccounts();
    const authenticated = setupState.panelUserRequired
      ? false
      : Boolean(sessionCredentials?.authenticated);
    const activeCloudflareAccountId = this.cloudflareAccountService.resolveSelectedAccountId(
      sessionCredentials?.activeCloudflareAccountId
    );
    const activeCloudflareAccount = authenticated
      ? this.cloudflareAccountService.getSafeAccount(activeCloudflareAccountId)
      : null;
    const accounts = authenticated
      ? this.cloudflareAccountService.listSafe(activeCloudflareAccountId)
      : [];

    return {
      statusCode: 200,
      body: {
        accounts,
        activeCloudflareAccount,
        authenticated,
        csrfToken: sessionCredentials?.csrfToken || "",
        email: authenticated ? activeCloudflareAccount?.email || "" : "",
        expiresAt: sessionCredentials?.expiresAt || "",
        hasCredentials: authenticated && hasCloudflareAccounts,
        loginRequired: panelLoginConfigured,
        setupRequired: setupState.setupRequired,
        setupState,
        source: authenticated ? "cookie" : "",
      },
    };
  };

  setupStatus = async () => ({
    statusCode: 200,
    body: {
      ...this.panelAuthService.getSetupState(),
      setupTokenRequired: this.panelAuthService.getSetupState().panelUserRequired,
    },
  });

  setupSecret = async ({ request }) => {
    const setupState = this.panelAuthService.getSetupState();
    const body = await readJsonBody(request);
    const rateLimit = this.checkRateLimit(request, "setup-secret");

    if (!setupState.setupRequired || !setupState.panelUserRequired) {
      return {
        statusCode: 409,
        body: { error: "面板管理员已经完成初始化。" },
      };
    }

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    if (!this.setupGuardService.verify(body.setupToken)) {
      return {
        statusCode: 401,
        body: { error: "初始化口令错误，请查看容器启动提示或 /data/setup-token.txt。" },
      };
    }

    this.resetRateLimit(request, "setup-secret");
    const secret = generateTotpSecret();

    return {
      statusCode: 200,
      body: {
        otpauthUrl: createOtpAuthUrl({
          issuer: "蜘蛛网络",
          label: "Cloudflare Panel",
          secret,
        }),
        secret,
      },
    };
  };

  completeSetup = async ({ request }) => {
    const body = await readJsonBody(request);
    const rateLimit = this.checkRateLimit(request, "setup");

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    if (!this.setupGuardService.verify(body.setupToken)) {
      return {
        statusCode: 401,
        body: { error: "初始化口令错误，请查看容器启动提示或 /data/setup-token.txt。" },
      };
    }

    const result = this.panelAuthService.createSetup({
      cfApiKey: body.cfApiKey || body.globalApiKey || "",
      cfEmail: body.cfEmail || body.email || "",
      cloudflareName: body.cloudflareName || body.cfName || "",
      password: body.password || "",
      totpCode: body.totpCode || body.auth || body.authCode || "",
      totpSecret: body.totpSecret || "",
      username: body.username || body.user || "",
    });

    if (result.error) {
      return {
        statusCode: result.statusCode || 400,
        body: { error: result.error },
      };
    }

    this.setupGuardService.cleanupInitialSetupToken();
    this.resetRateLimit(request, "setup");
    const selectedAccountId = result.cloudflareAccount?.id || "";
    const session = this.credentialSessionService.create({
      activeCloudflareAccountId: selectedAccountId,
      authenticated: true,
      source: "panel",
    });
    const activeCloudflareAccount = this.cloudflareAccountService.getSafeAccount(selectedAccountId);

    return {
      statusCode: 201,
      headers: {
        "Set-Cookie": this.credentialSessionService.createCookie(request, session),
      },
      body: {
        accounts: this.cloudflareAccountService.listSafe(selectedAccountId),
        activeCloudflareAccount,
        authenticated: true,
        csrfToken: session.csrfToken,
        email: activeCloudflareAccount?.email || "",
        expiresAt: session.expiresAt,
        hasCredentials: true,
        loginRequired: true,
        setupRequired: false,
        source: "cookie",
      },
    };
  };

  createSetupAdmin = async ({ request }) => {
    const body = await readJsonBody(request);
    const rateLimit = this.checkRateLimit(request, "setup");

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    if (!this.setupGuardService.verify(body.setupToken)) {
      return {
        statusCode: 401,
        body: { error: "初始化口令错误，请查看容器启动提示或 /data/setup-token.txt。" },
      };
    }

    const result = this.panelAuthService.createPanelUserSetup({
      password: body.password || "",
      totpCode: body.totpCode || body.auth || body.authCode || "",
      totpSecret: body.totpSecret || "",
      username: body.username || body.user || "",
    });

    if (result.error) {
      return {
        statusCode: result.statusCode || 400,
        body: { error: result.error },
      };
    }

    this.setupGuardService.cleanupInitialSetupToken();
    this.resetRateLimit(request, "setup");
    const session = this.credentialSessionService.create({
      authenticated: true,
      source: "panel",
    });

    return {
      statusCode: 201,
      headers: {
        "Set-Cookie": this.credentialSessionService.createCookie(request, session),
      },
      body: {
        accounts: [],
        activeCloudflareAccount: null,
        authenticated: true,
        csrfToken: session.csrfToken,
        email: "",
        expiresAt: session.expiresAt,
        hasCredentials: false,
        loginRequired: true,
        setupRequired: true,
        setupState: this.panelAuthService.getSetupState(),
        source: "cookie",
      },
    };
  };

  createSetupCloudflareAccounts = async ({ request }) => {
    const sessionCredentials = this.credentialSessionService.getCredentials(request);

    if (!sessionCredentials?.authenticated) {
      return {
        statusCode: 401,
        body: { error: "请先创建管理员账户并登录。" },
      };
    }

    const body = await readJsonBody(request);
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    const result = this.panelAuthService.createCloudflareAccountsSetup({ accounts });

    if (result.error) {
      return {
        statusCode: result.statusCode || 400,
        body: { error: result.error },
      };
    }

    const selectedAccountId = result.accounts?.[0]?.id || "";
    const session = this.credentialSessionService.update(request, {
      activeCloudflareAccountId: selectedAccountId,
      authenticated: true,
    });
    const activeCloudflareAccount = this.cloudflareAccountService.getSafeAccount(selectedAccountId);

    return {
      statusCode: 201,
      body: {
        accounts: this.cloudflareAccountService.listSafe(selectedAccountId),
        activeCloudflareAccount,
        authenticated: true,
        csrfToken: session?.csrfToken || sessionCredentials.csrfToken || "",
        email: activeCloudflareAccount?.email || "",
        expiresAt: session?.expiresAt || sessionCredentials.expiresAt || "",
        hasCredentials: true,
        loginRequired: true,
        setupRequired: false,
        setupState: this.panelAuthService.getSetupState(),
        source: "cookie",
      },
    };
  };

  connect = async ({ request }) => {
    const body = await readJsonBody(request);
    const user = String(body.user || body.username || "").trim();
    const password = String(body.password || "");
    const auth = String(body.auth || body.authCode || body.totp || "").trim();
    const activeCloudflareAccountId = String(body.cloudflareAccountId || "").trim();
    const setupState = this.panelAuthService.getSetupState();
    const cloudflareAccountSetupPending =
      setupState.setupRequired &&
      !setupState.panelUserRequired &&
      setupState.cloudflareAccountRequired;

    if (setupState.setupRequired && !cloudflareAccountSetupPending) {
      return {
        statusCode: 412,
        body: {
          error: "请先完成首次初始化。",
        },
      };
    }

    if (!user || !password || !auth) {
      return {
        statusCode: 400,
        body: {
          error: "请输入用户名、密码和 2FA 验证码。",
        },
      };
    }

    const rateLimit = this.checkRateLimit(request, `login:${user}`);

    if (!rateLimit.allowed) {
      return rateLimit.response;
    }

    if (!this.panelAuthService.verify({ auth, password, user })) {
      return {
        statusCode: 401,
        body: {
          error: "用户名、密码或 2FA 验证码错误。",
        },
      };
    }

    this.resetRateLimit(request, `login:${user}`);
    if (!this.cloudflareAccountService.hasAccounts()) {
      if (cloudflareAccountSetupPending) {
        const session = this.credentialSessionService.create({
          authenticated: true,
          source: "panel",
        });

        return {
          statusCode: 200,
          headers: {
            "Set-Cookie": this.credentialSessionService.createCookie(request, session),
          },
          body: {
            accounts: [],
            activeCloudflareAccount: null,
            authenticated: true,
            csrfToken: session.csrfToken,
            email: "",
            expiresAt: session.expiresAt,
            hasCredentials: false,
            loginRequired: true,
            setupRequired: true,
            setupState: this.panelAuthService.getSetupState(),
            source: "cookie",
          },
        };
      }

      return {
        statusCode: 412,
        body: {
          error: "请先完成首次初始化并添加 Cloudflare 账号。",
        },
      };
    }

    const selectedAccountId =
      this.cloudflareAccountService.resolveSelectedAccountId(activeCloudflareAccountId);
    const session = this.credentialSessionService.create({
      activeCloudflareAccountId: selectedAccountId,
      authenticated: true,
      source: "panel",
    });
    const activeCloudflareAccount = this.cloudflareAccountService.getSafeAccount(selectedAccountId);

    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": this.credentialSessionService.createCookie(request, session),
      },
      body: {
        accounts: this.cloudflareAccountService.listSafe(selectedAccountId),
        activeCloudflareAccount,
        authenticated: true,
        csrfToken: session.csrfToken,
        email: activeCloudflareAccount?.email || "",
        expiresAt: session.expiresAt,
        hasCredentials: true,
        loginRequired: true,
        setupRequired: false,
        source: "cookie",
      },
    };
  };

  switchCloudflareAccount = async ({ params, request }) => {
    const sessionCredentials = this.credentialSessionService.getCredentials(request);

    if (!sessionCredentials?.authenticated) {
      return {
        statusCode: 401,
        body: { error: "请先登录面板。" },
      };
    }

    const requestedAccountId = String(params.accountId || "").trim();
    const accountExists = this.cloudflareAccountService.hasAccount(requestedAccountId);
    const account = accountExists
      ? this.cloudflareAccountService.getSafeAccount(requestedAccountId)
      : null;

    if (!account) {
      return {
        statusCode: 404,
        body: { error: "Cloudflare 账号不存在。" },
      };
    }

    const session = this.credentialSessionService.update(request, {
      activeCloudflareAccountId: requestedAccountId,
    });

    return {
      statusCode: 200,
      body: {
        accounts: this.cloudflareAccountService.listSafe(requestedAccountId),
        activeCloudflareAccount: account,
        authenticated: true,
        csrfToken: session?.csrfToken || sessionCredentials.csrfToken || "",
        email: account.email,
        expiresAt: session?.expiresAt || sessionCredentials.expiresAt || "",
        hasCredentials: true,
        loginRequired: true,
        setupRequired: false,
        source: "cookie",
      },
    };
  };

  logout = async ({ request }) => {
    this.credentialSessionService.revoke(request);

    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": this.credentialSessionService.clearCookie(request),
      },
      body: {
        ok: true,
      },
    };
  };

  checkRateLimit(request, scope) {
    const key = `${scope}:${this.requestAddress(request)}`;
    const result = this.authRateLimiter.check(key);

    if (result.allowed) {
      return { allowed: true };
    }

    return {
      allowed: false,
      response: {
        statusCode: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
        },
        body: { error: `请求过于频繁，请 ${result.retryAfterSeconds} 秒后重试。` },
      },
    };
  }

  resetRateLimit(request, scope) {
    this.authRateLimiter.reset(`${scope}:${this.requestAddress(request)}`);
  }

  requestAddress(request) {
    return request?.socket?.remoteAddress || "unknown";
  }
}
