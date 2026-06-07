import { githubIssueUrl, navItems, zoneNavItems } from "../constants.js";
import { icon } from "../icons.js";
import { state } from "../state.js";
import { escapeHtml, topbarTitle } from "../utils.js";

function renderNav() {
  return navItems
    .map(([id, iconName, label]) => {
      if (id === "needs") {
        return `
          <a class="nav-item" href="${githubIssueUrl}" target="_blank" rel="noreferrer">
            <span class="nav-icon">${icon(iconName)}</span>
            <span>${escapeHtml(label)}</span>
          </a>
        `;
      }

      return `
        <button class="nav-item ${id === state.mainSection ? "active" : ""}" type="button" data-main-section="${escapeHtml(id)}">
          <span class="nav-icon">${icon(iconName)}</span>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");
}

function renderZoneNav() {
  if (state.view !== "zone" || !state.selectedZone?.id) {
    return "";
  }

  return `
    <div class="zone-nav-block">
      <button class="zone-switcher" type="button" data-zone-section="dns">
        <span>${escapeHtml(state.selectedZone.name || "Loading")}</span>
        <span class="zone-switcher-icon">${icon("arrowLeft")}</span>
      </button>
      <nav class="zone-nav" aria-label="单域名管理">
        ${zoneNavItems
          .map(
            ([id, iconName, label]) => `
              <button class="zone-nav-item ${state.zoneSection === id ? "active" : ""}" type="button" data-zone-section="${escapeHtml(id)}">
                <span class="nav-icon">${icon(iconName)}</span>
                <span>${escapeHtml(label)}</span>
              </button>
            `
          )
          .join("")}
      </nav>
    </div>
  `;
}

function renderAccountSelector() {
  if (!state.cloudflareAccounts.length) {
    return "";
  }

  const activeId = state.activeCloudflareAccountId || state.activeCloudflareAccount?.id || "";
  const disabled = state.selectingCloudflareAccount || state.cloudflareAccounts.length <= 1;

  return `
    <label class="account-switcher" title="切换 Cloudflare 账号">
      <span>${icon("key")}</span>
      <select id="cloudflare-account-switch" ${disabled ? "disabled" : ""}>
        ${state.cloudflareAccounts
          .map(
            (account) => `
              <option value="${escapeHtml(account.id)}" ${account.id === activeId ? "selected" : ""}>
                ${escapeHtml(account.name || account.email || account.id)}
              </option>
            `
          )
          .join("")}
      </select>
    </label>
  `;
}

function renderCloudflareAccountDialog() {
  if (!state.cloudflareAccountDialogOpen) {
    return "";
  }

  return `
    <div class="account-dialog-backdrop" role="presentation">
      <section class="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <div class="account-dialog-head">
          <div>
            <h2 id="account-dialog-title">添加 Cloudflare 账号</h2>
            <p>新增账号会写入服务端 SQLite，保存成功后自动切换到该账号。</p>
          </div>
          <button class="icon-button cloudflare-account-dialog-close" type="button" title="关闭" aria-label="关闭" ${state.cloudflareAccountSaving ? "disabled" : ""}>
            ${icon("x")}
          </button>
        </div>

        <form class="account-dialog-form" id="cloudflare-account-create-form">
          <label class="account-dialog-field">
            <span>账号名称</span>
            <input name="cloudflareName" type="text" autocomplete="off" placeholder="备用账号" ${state.cloudflareAccountSaving ? "disabled" : ""} />
          </label>
          <label class="account-dialog-field">
            <span>Cloudflare 登录邮箱</span>
            <input name="cfEmail" type="email" autocomplete="email" placeholder="name@example.com" ${state.cloudflareAccountSaving ? "disabled" : ""} />
          </label>
          <label class="account-dialog-field">
            <span>Cloudflare Global API Key</span>
            <input name="cfApiKey" type="password" autocomplete="off" placeholder="仅写入服务端 SQLite" ${state.cloudflareAccountSaving ? "disabled" : ""} />
          </label>

          <div class="account-dialog-security">
            <strong>安全保存方式</strong>
            <span>接口响应、Cookie、localStorage 和操作历史都不会保存 Global API Key。</span>
          </div>

          ${state.cloudflareAccountError ? `<div class="notice error-notice">${escapeHtml(state.cloudflareAccountError)}</div>` : ""}

          <div class="account-dialog-actions">
            <button class="ghost-button cloudflare-account-dialog-close" type="button" ${state.cloudflareAccountSaving ? "disabled" : ""}>取消</button>
            <button class="primary-button" type="submit" ${state.cloudflareAccountSaving ? "disabled" : ""}>
              ${state.cloudflareAccountSaving ? "保存中..." : "保存并切换"}
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function renderShell(content) {
  const app = document.querySelector("#app");
  const accountLabel = state.activeCloudflareAccount?.email || state.sessionEmail || "Cloudflare Panel";
  app.className = "app-shell";
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" src="assets/spider-icon.png" alt="Spider" />
        <div>
          <strong>蜘蛛网络</strong>
          <span>
            ${escapeHtml(accountLabel)}
            <em>${icon("arrowLeft")}</em>
          </span>
        </div>
      </div>

      <div class="nav-label">全局功能</div>
      <nav class="nav">${renderNav()}</nav>
      ${renderZoneNav()}
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="title-wrap">
          <span class="topbar-icon">${icon("layout")}</span>
          <h1>${escapeHtml(topbarTitle(state.view, state.zoneSection, state.mainSection))}</h1>
        </div>
        <div class="topbar-actions">
          <div class="account-tools">
            ${renderAccountSelector()}
            <button class="account-add-button" id="cloudflare-account-open" type="button" title="添加 Cloudflare 账号" aria-label="添加 Cloudflare 账号">
              ${icon("plus")}
            </button>
          </div>
          <button class="logout" type="button" id="logout-session">退出</button>
        </div>
      </header>
      ${content}
      ${renderCloudflareAccountDialog()}
    </main>
  `;
}
