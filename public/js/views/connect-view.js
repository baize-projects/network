import { icon } from "../icons.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

function renderCloudflareAccountRows() {
  return state.setupCloudflareAccounts
    .map(
      (account, index) => `
        <section class="setup-account-row" data-cf-account-row>
          <div class="setup-account-row-title">
            <strong>Cloudflare 账号 ${index + 1}</strong>
            ${
              state.setupCloudflareAccounts.length > 1
                ? `<button class="ghost-button setup-account-remove" type="button" data-remove-cf-account="${index}" ${state.setupSubmitting ? "disabled" : ""}>移除</button>`
                : ""
            }
          </div>
          <div class="setup-grid">
            <label class="connect-field">
              <span>账号名称</span>
              <input name="cloudflareName" type="text" autocomplete="off" placeholder="${index === 0 ? "主账号" : `账号 ${index + 1}`}" value="${escapeHtml(account.cloudflareName || "")}" />
            </label>
            <label class="connect-field">
              <span>Cloudflare 登录邮箱</span>
              <input name="cfEmail" type="email" autocomplete="email" placeholder="name@example.com" value="${escapeHtml(account.cfEmail || "")}" />
            </label>
          </div>
          <label class="connect-field">
            <span>Cloudflare Global API Key</span>
            <input name="cfApiKey" type="password" autocomplete="off" placeholder="仅写入服务端 SQLite" value="${escapeHtml(account.cfApiKey || "")}" />
          </label>
        </section>
      `
    )
    .join("");
}

function renderAdminSetupBody() {
  return `
    <div class="connect-heading setup-heading">
      <span class="connect-kicker">首次打开面板</span>
      <h2>初始化蜘蛛网络</h2>
      <p>先创建管理员账号并强制启用 2FA，下一步再添加 Cloudflare 多账号。</p>
    </div>

    <form class="connect-card setup-card" id="panel-setup-form">
      <div class="connect-card-title">
        <span>${icon("shield")}</span>
        <div>
          <h3>安全初始化</h3>
          <p>管理员密码使用 scrypt 哈希保存；2FA 登录密钥只写入服务端 SQLite。</p>
        </div>
      </div>

      <div class="setup-grid">
        <section class="setup-group">
          <h4>管理员账户</h4>
          <label class="connect-field">
            <span>初始化口令</span>
            <input name="setupToken" type="password" autocomplete="off" placeholder="查看容器启动日志" value="${escapeHtml(state.setupToken || "")}" />
          </label>
          <label class="connect-field">
            <span>用户名</span>
            <input name="username" type="text" autocomplete="username" placeholder="admin" />
          </label>
          <label class="connect-field">
            <span>密码</span>
            <input name="password" type="password" autocomplete="new-password" placeholder="至少 10 位" />
          </label>
          <label class="connect-field">
            <span>确认密码</span>
            <input name="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入密码" />
          </label>
        </section>

        <section class="setup-group">
          <h4>2FA 登录密钥</h4>
          <div class="setup-secret-box">
            <span>${state.setupLoadingSecret ? "正在生成..." : escapeHtml(state.setupSecret || "输入初始化口令后生成密钥")}</span>
            <button class="ghost-button setup-secret-refresh" id="setup-secret-refresh" type="button" ${state.setupLoadingSecret || state.setupSubmitting ? "disabled" : ""}>
              ${state.setupSecret ? "重新生成" : "生成密钥"}
            </button>
          </div>
          <input name="totpSecret" type="hidden" value="${escapeHtml(state.setupSecret)}" />
          <p class="setup-note">把上方密钥添加到身份验证器后，输入当前 6 位验证码完成强制 2FA 绑定。</p>
          <label class="connect-field">
            <span>当前 2FA 验证码</span>
            <input name="totpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位动态验证码" />
          </label>
        </section>
      </div>

      <div class="connect-security">
        <strong>安全检查</strong>
        <span>浏览器只保存 HttpOnly 随机会话 Cookie，最长 30 天。</span>
        <span>管理员密码和 2FA 密钥不会进入 Cookie、localStorage 或操作历史。</span>
      </div>

      <button class="primary-button connect-submit" type="submit" ${state.setupSubmitting || state.setupLoadingSecret || !state.setupSecret ? "disabled" : ""}>
        ${state.setupSubmitting ? "创建中..." : "创建管理员并进入下一步"}
      </button>
      ${state.sessionError ? `<div class="notice error-notice">${escapeHtml(state.sessionError)}</div>` : ""}
    </form>
  `;
}

function renderSetupSessionRecovery() {
  if (state.sessionAuthenticated) {
    return "";
  }

  return `
    <form class="connect-card setup-card setup-session-card" id="setup-session-login-form">
      <div class="connect-card-title">
        <span>${icon("shield")}</span>
        <div>
          <h3>恢复管理员会话</h3>
          <p>管理员已创建，但当前浏览器没有有效会话。请先登录，再保存 Cloudflare 账号。</p>
        </div>
      </div>

      <div class="setup-grid">
        <label class="connect-field">
          <span>用户名</span>
          <input name="user" type="text" autocomplete="username" placeholder="admin" />
        </label>
        <label class="connect-field">
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" placeholder="面板密码" />
        </label>
      </div>
      <label class="connect-field">
        <span>2FA 验证码</span>
        <input name="auth" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位动态验证码" />
      </label>

      <div class="connect-warning">
        <strong>为什么需要这一步</strong>
        <span>如果第一次创建管理员时浏览器没有保存 Cookie，第二步保存 Cloudflare 账号会缺少管理员会话。</span>
      </div>

      <button class="primary-button connect-submit" type="submit" ${state.setupLoginSubmitting ? "disabled" : ""}>
        ${state.setupLoginSubmitting ? "登录中..." : "恢复会话并继续"}
      </button>
    </form>
  `;
}

function renderCloudflareSetupBody() {
  const canSubmitCloudflareAccounts = state.sessionAuthenticated && !state.setupSubmitting;

  return `
    <div class="connect-heading setup-heading">
      <span class="connect-kicker">第二步</span>
      <h2>添加 Cloudflare 账号</h2>
      <p>项目支持多账户管理，可一次添加多个 Cloudflare 账号，后续登录后在顶部切换。</p>
    </div>

    ${renderSetupSessionRecovery()}

    <form class="connect-card setup-card setup-cloudflare-card" id="cloudflare-accounts-setup-form">
      <div class="connect-card-title">
        <span>${icon("cloud")}</span>
        <div>
          <h3>Cloudflare 多账号</h3>
          <p>Global API Key 只写入容器内 SQLite，不进入 Cookie、localStorage 或操作历史。</p>
        </div>
      </div>

      <div class="setup-accounts-list">
        ${renderCloudflareAccountRows()}
      </div>

      <button class="ghost-button setup-account-add" id="setup-add-cf-account" type="button" ${state.setupSubmitting || state.setupCloudflareAccounts.length >= 10 ? "disabled" : ""}>
        添加更多账号
      </button>

      <div class="connect-security">
        <strong>安全检查</strong>
        <span>账号邮箱仅在前端脱敏展示；Global API Key 不会从接口返回。</span>
        <span>至少添加一个 Cloudflare 账号后，面板才能读取域名和管理资源。</span>
      </div>

      <button class="primary-button connect-submit" type="submit" ${canSubmitCloudflareAccounts ? "" : "disabled"}>
        ${
          state.setupSubmitting
            ? "保存中..."
            : state.sessionAuthenticated
              ? "保存 Cloudflare 账号并进入面板"
              : "请先恢复管理员会话"
        }
      </button>
      ${state.sessionError ? `<div class="notice error-notice">${escapeHtml(state.sessionError)}</div>` : ""}
    </form>
  `;
}

function renderConnectBody() {
  if (state.checkingSession) {
    return `
      <div class="connect-loading">
        <div class="spinner"></div>
        <strong>正在检查面板会话</strong>
      </div>
    `;
  }

  if (state.setupRequired) {
    return state.setupStep === "cloudflare" ? renderCloudflareSetupBody() : renderAdminSetupBody();
  }

  return `
    <div class="connect-heading">
      <h2>登录蜘蛛网络面板</h2>
      <p>登录后即可选择已保存的 Cloudflare 账号</p>
    </div>

    <form class="connect-card" id="cloudflare-connect-form">
      <div class="connect-card-title">
        <span>${icon("shield")}</span>
        <div>
          <h3>面板登录</h3>
          <p>输入管理员账号、密码和当前 2FA 验证码。</p>
        </div>
      </div>

      <label class="connect-field">
        <span>用户名</span>
        <input name="user" type="text" autocomplete="username" placeholder="admin" />
      </label>
      <label class="connect-field">
        <span>密码</span>
        <input name="password" type="password" autocomplete="current-password" placeholder="面板密码" />
      </label>
      <label class="connect-field">
        <span>2FA 验证码</span>
        <input name="auth" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位动态验证码" />
      </label>
      <p class="connect-help">如果是首次打开面板，会先进入初始化流程创建管理员账户和 Cloudflare 账号。</p>

      <div class="connect-security">
        <strong>安全保存方式</strong>
        <span>浏览器仅保存 HttpOnly 随机会话 Cookie，最长 30 天。</span>
        <span>Cookie、localStorage、接口响应和操作历史都不保存 Cloudflare API Key。</span>
      </div>

      <button class="primary-button connect-submit" type="submit" ${state.connectingSession ? "disabled" : ""}>
        ${state.connectingSession ? "登录中..." : "登录并进入管理后台"}
      </button>
      ${state.sessionError ? `<div class="notice error-notice">${escapeHtml(state.sessionError)}</div>` : ""}
    </form>

    <div class="connect-register">
      <span>还没有 Cloudflare 账号？</span>
      <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">立即注册</a>
      <p>注册后，您可以免费使用 Cloudflare 的 CDN、DNS 和其他强大功能</p>
    </div>
  `;
}

export function renderConnectView() {
  const app = document.querySelector("#app");
  app.className = "connect-root";
  const wrapClass =
    state.setupRequired && state.setupStep === "cloudflare"
      ? "connect-wrap setup-cloudflare-wrap"
      : "connect-wrap";

  app.innerHTML = `
    <main class="connect-page">
      <header class="connect-header">
        <div class="connect-brand">
          <img class="connect-brand-mark" src="assets/spider-icon.png" alt="Spider" />
          <div>
            <h1>蜘蛛网络</h1>
            <p>好用的Cloudflare管理工具</p>
          </div>
        </div>
      </header>
      <section class="connect-section">
        <div class="${wrapClass}">
          ${renderConnectBody()}
        </div>
      </section>
      <footer class="connect-footer">Power by Cloudflare 致敬赛博大善人</footer>
    </main>
  `;
}
