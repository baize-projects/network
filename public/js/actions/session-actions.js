import {
  ApiUnavailableError,
  createSetupAdmin,
  createSetupCloudflareAccounts,
  fetchSetupSecret,
  fetchSessionStatus,
  loginPanel,
  logoutCloudflareAccount,
  setCsrfToken,
  switchCloudflareAccount,
} from "../api.js";
import { resetCloudflareAccountData, resetSessionState, state } from "../state.js";

function readConnectForm() {
  const form = document.querySelector("#cloudflare-connect-form");

  if (!form) {
    return { auth: "", password: "", user: "" };
  }

  const formData = new FormData(form);

  return {
    auth: String(formData.get("auth") || "").trim(),
    cloudflareAccountId: String(formData.get("cloudflareAccountId") || "").trim(),
    password: String(formData.get("password") || ""),
    user: String(formData.get("user") || "").trim(),
  };
}

function readSetupLoginForm() {
  const form = document.querySelector("#setup-session-login-form");

  if (!form) {
    return { auth: "", password: "", user: "" };
  }

  const formData = new FormData(form);

  return {
    auth: String(formData.get("auth") || "").trim(),
    password: String(formData.get("password") || ""),
    user: String(formData.get("user") || "").trim(),
  };
}

function readAdminSetupForm() {
  const form = document.querySelector("#panel-setup-form");

  if (!form) {
    return {
      cfApiKey: "",
      cfEmail: "",
      cloudflareName: "",
      confirmPassword: "",
      password: "",
      setupToken: state.setupToken,
      totpCode: "",
      totpSecret: state.setupSecret,
      username: "",
    };
  }

  const formData = new FormData(form);

  return {
    confirmPassword: String(formData.get("confirmPassword") || ""),
    password: String(formData.get("password") || ""),
    setupToken: String(formData.get("setupToken") || state.setupToken || "").trim(),
    totpCode: String(formData.get("totpCode") || "").trim(),
    totpSecret: String(formData.get("totpSecret") || state.setupSecret || "").trim(),
    username: String(formData.get("username") || "").trim(),
  };
}

function restoreAdminSetupForm(setup = {}) {
  const form = document.querySelector("#panel-setup-form");

  if (!form) {
    return;
  }

  const values = {
    confirmPassword: setup.confirmPassword || "",
    password: setup.password || "",
    setupToken: setup.setupToken || state.setupToken || "",
    username: setup.username || "",
  };

  for (const [name, value] of Object.entries(values)) {
    const field = form.querySelector(`[name="${name}"]`);

    if (field) {
      field.value = value;
    }
  }
}

function readCloudflareAccountsForm() {
  const rows = [...document.querySelectorAll("[data-cf-account-row]")];

  return rows
    .map((row) => ({
      cfApiKey: String(row.querySelector('[name="cfApiKey"]')?.value || "").trim(),
      cfEmail: String(row.querySelector('[name="cfEmail"]')?.value || "").trim(),
      cloudflareName: String(row.querySelector('[name="cloudflareName"]')?.value || "").trim(),
    }))
    .filter((account) => account.cfApiKey || account.cfEmail);
}

function readAllCloudflareAccountRows() {
  const rows = [...document.querySelectorAll("[data-cf-account-row]")];

  return rows.map((row) => ({
    cfApiKey: String(row.querySelector('[name="cfApiKey"]')?.value || "").trim(),
    cfEmail: String(row.querySelector('[name="cfEmail"]')?.value || "").trim(),
    cloudflareName: String(row.querySelector('[name="cloudflareName"]')?.value || "").trim(),
  }));
}

function applySession(session) {
  state.sessionAuthenticated = Boolean(session.authenticated);
  state.sessionHasServerCredentials = Boolean(session.hasCredentials);
  state.loginRequired = Boolean(session.loginRequired);
  state.setupRequired = Boolean(session.setupRequired);
  state.cloudflareAccounts = Array.isArray(session.accounts) ? session.accounts : [];
  state.activeCloudflareAccount = session.activeCloudflareAccount || null;
  state.activeCloudflareAccountId = session.activeCloudflareAccount?.id || "";
  state.sessionEmail = session.email || session.activeCloudflareAccount?.email || "";
  state.sessionExpiresAt = session.expiresAt || "";
  state.sessionSource = session.source || "";
  state.csrfToken = session.csrfToken || "";
  setCsrfToken(state.csrfToken);
  state.setupStep = session.setupState?.panelUserRequired ? "admin" : "cloudflare";
}

async function ensureSetupSecret({ force = false } = {}) {
  if (
    !state.setupRequired ||
    state.setupStep !== "admin" ||
    (state.setupSecret && !force) ||
    state.setupLoadingSecret ||
    !state.setupToken
  ) {
    return;
  }

  state.setupLoadingSecret = true;
  state.sessionError = "";
  renderAppRef?.();

  try {
    const secret = await fetchSetupSecret(state.setupToken);
    state.setupSecret = secret.secret || "";
    state.setupOtpAuthUrl = secret.otpauthUrl || "";
  } catch (error) {
    state.sessionError = error.message;
  } finally {
    state.setupLoadingSecret = false;
    renderAppRef?.();
  }
}

let renderAppRef = null;

export function createSessionActions({ loadZones, renderApp }) {
  renderAppRef = renderApp;

  async function checkSession() {
    state.checkingSession = true;
    state.sessionError = "";
    renderApp();

    try {
      const session = await fetchSessionStatus();
      applySession(session);

      if (session.setupRequired) {
        state.connected = false;
        state.setupStep = session.setupState?.panelUserRequired ? "admin" : "cloudflare";
        await ensureSetupSecret();
        return;
      }

      if (session.authenticated || (session.hasCredentials && !session.loginRequired)) {
        state.connected = true;
        await loadZones({ throwOnError: false });
      }
    } catch (error) {
      if (!(error instanceof ApiUnavailableError)) {
        state.sessionError = error.message;
      }
    } finally {
      state.checkingSession = false;
      renderApp();
    }
  }

  async function connectSession(event) {
    event?.preventDefault();

    const credentials = readConnectForm();

    if (!credentials.user || !credentials.password || !credentials.auth) {
      state.sessionError = "请输入用户名、密码和 2FA 验证码。";
      renderApp();
      return;
    }

    state.connectingSession = true;
    state.sessionError = "";
    renderApp();

    try {
      await loginPanel(credentials);
      const session = await fetchSessionStatus();

      if (!session.authenticated) {
        throw new Error("浏览器未能保存登录 Cookie，请允许本站 Cookie 后重新登录。");
      }

      state.connected = true;
      applySession(session);
      state.mainSection = "domain";
      await loadZones({ throwOnError: true });
    } catch (error) {
      state.connected = false;
      state.zoneError = "";
      state.sessionError = error.message;
    } finally {
      state.connectingSession = false;
      renderApp();
    }
  }

  async function refreshSetupSecret() {
    const setup = readAdminSetupForm();
    state.setupToken = setup.setupToken;

    if (!state.setupToken) {
      state.sessionError = "请输入容器启动日志中的初始化口令后再生成 2FA 登录密钥。";
      renderApp();
      return;
    }

    state.setupSecret = "";
    state.setupOtpAuthUrl = "";
    await ensureSetupSecret({ force: true });
    restoreAdminSetupForm(setup);
  }

  async function completeSetup(event) {
    event?.preventDefault();

    const setup = readAdminSetupForm();
    state.setupToken = setup.setupToken;

    if (!setup.setupToken) {
      state.sessionError = "请输入容器启动日志中的初始化口令。";
      renderApp();
      return;
    }

    if (!setup.username || !setup.password || !setup.confirmPassword) {
      state.sessionError = "请输入管理员用户名和两次密码。";
      renderApp();
      return;
    }

    if (setup.password !== setup.confirmPassword) {
      state.sessionError = "两次输入的管理员密码不一致。";
      renderApp();
      return;
    }

    if (!setup.totpSecret || !/^\d{6}$/.test(setup.totpCode)) {
      state.sessionError = "请先创建 2FA 登录密钥，并输入当前 6 位验证码。";
      renderApp();
      return;
    }

    state.setupSubmitting = true;
    state.sessionError = "";
    renderApp();

    try {
      await createSetupAdmin({
        password: setup.password,
        setupToken: setup.setupToken,
        totpCode: setup.totpCode,
        totpSecret: setup.totpSecret,
        username: setup.username,
      });

      const persistedSession = await fetchSessionStatus();

      applySession(persistedSession);
      if (!persistedSession.authenticated) {
        state.setupRequired = true;
        state.setupStep = "cloudflare";
        state.setupSecret = "";
        state.setupOtpAuthUrl = "";
        throw new Error("管理员已创建，但浏览器未能保存登录 Cookie，请在第二步恢复管理员会话。");
      }

      state.setupRequired = true;
      state.setupStep = "cloudflare";
      state.setupSecret = "";
      state.setupOtpAuthUrl = "";
      state.connected = false;
    } catch (error) {
      state.connected = false;
      state.zoneError = "";
      state.sessionError = error.message;
    } finally {
      state.setupSubmitting = false;
      renderApp();
    }
  }

  async function completeCloudflareSetup(event) {
    event?.preventDefault();

    const accounts = readCloudflareAccountsForm();

    if (!accounts.length) {
      state.sessionError = "请至少添加一个 Cloudflare 账号。";
      renderApp();
      return;
    }

    const hasIncompleteAccount = accounts.some(
      (account) => !account.cfEmail || !account.cfApiKey
    );

    if (hasIncompleteAccount) {
      state.sessionError = "已填写的 Cloudflare 账号需要同时包含邮箱和 Global API Key。";
      renderApp();
      return;
    }

    if (!state.sessionAuthenticated) {
      state.sessionError = "请先恢复管理员会话后再保存 Cloudflare 账号。";
      renderApp();
      return;
    }

    state.setupSubmitting = true;
    state.sessionError = "";
    renderApp();

    try {
      const session = await createSetupCloudflareAccounts({ accounts });

      applySession(session);
      state.setupRequired = false;
      state.setupStep = "done";
      state.connected = true;
      state.mainSection = "domain";
      await loadZones({ throwOnError: true });
    } catch (error) {
      state.connected = false;
      state.zoneError = "";
      state.sessionError = error.message;
    } finally {
      state.setupSubmitting = false;
      renderApp();
    }
  }

  async function recoverSetupSession(event) {
    event?.preventDefault();

    const credentials = readSetupLoginForm();

    if (!credentials.user || !credentials.password || !credentials.auth) {
      state.sessionError = "请输入管理员用户名、密码和 2FA 验证码。";
      renderApp();
      return;
    }

    state.setupLoginSubmitting = true;
    state.sessionError = "";
    renderApp();

    try {
      await loginPanel(credentials);
      const session = await fetchSessionStatus();

      if (!session.authenticated) {
        throw new Error("浏览器未能保存登录 Cookie，请确认使用当前访问地址并允许本站 Cookie。");
      }

      applySession(session);
      state.connected = false;
      state.setupRequired = true;
      state.setupStep = "cloudflare";
    } catch (error) {
      state.connected = false;
      state.zoneError = "";
      state.sessionError = error.message;
    } finally {
      state.setupLoginSubmitting = false;
      renderApp();
    }
  }

  function addSetupCloudflareAccount() {
    if (state.setupCloudflareAccounts.length >= 10) {
      state.sessionError = "首次初始化最多一次添加 10 个 Cloudflare 账号。";
      renderApp();
      return;
    }

    const currentRows = readAllCloudflareAccountRows();
    state.setupCloudflareAccounts = [
      ...(currentRows.length ? currentRows : state.setupCloudflareAccounts),
      {
        cfApiKey: "",
        cfEmail: "",
        cloudflareName: `账号 ${(currentRows.length || state.setupCloudflareAccounts.length) + 1}`,
      },
    ];
    state.sessionError = "";
    renderApp();
  }

  function removeSetupCloudflareAccount(index) {
    if (state.setupCloudflareAccounts.length <= 1) {
      return;
    }

    const currentRows = readAllCloudflareAccountRows();
    state.setupCloudflareAccounts = (currentRows.length ? currentRows : state.setupCloudflareAccounts).filter(
      (_, itemIndex) => itemIndex !== index
    );
    renderApp();
  }

  async function changeCloudflareAccount(event) {
    const accountId = String(event?.target?.value || "").trim();

    if (!accountId || accountId === state.activeCloudflareAccountId) {
      return;
    }

    state.selectingCloudflareAccount = true;
    state.sessionError = "";
    renderApp();

    try {
      const session = await switchCloudflareAccount(accountId);
      applySession(session);
      resetCloudflareAccountData();
      state.connected = true;
      await loadZones({ throwOnError: true });
    } catch (error) {
      state.sessionError = error.message;
    } finally {
      state.selectingCloudflareAccount = false;
      renderApp();
    }
  }

  async function logoutSession() {
    try {
      await logoutCloudflareAccount();
    } catch {
      // Local state should still be cleared if the network request fails.
    }

    resetSessionState();
    history.replaceState(null, "", location.pathname);
    renderApp();
  }

  return {
    changeCloudflareAccount,
    checkSession,
    addSetupCloudflareAccount,
    completeCloudflareSetup,
    completeSetup,
    connectSession,
    logoutSession,
    removeSetupCloudflareAccount,
    recoverSetupSession,
    refreshSetupSecret,
  };
}
