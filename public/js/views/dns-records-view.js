import { icon } from "../icons.js";
import { state } from "../state.js";
import { escapeHtml, ttlLabel } from "../utils.js";

export function renderDnsRecords(records = state.dnsRecords) {
  if (state.loadingDns) {
    return `
      <div class="empty-state dns-empty">
        <div class="spinner"></div>
        <strong>正在读取 DNS 记录</strong>
        <span>正在从 Cloudflare 拉取此域名的解析记录。</span>
      </div>
    `;
  }

  if (state.dnsError) {
    return `
      <div class="empty-state error-state dns-empty">
        <strong>DNS 记录加载失败</strong>
        <span>${escapeHtml(state.dnsError)}</span>
      </div>
    `;
  }

  if (state.dnsRecords.length === 0) {
    return `
      <div class="empty-state dns-empty">
        <strong>暂无 DNS 记录</strong>
        <span>可以先在上方创建第一条解析记录。</span>
      </div>
    `;
  }

  if (records.length === 0) {
    return `
      <div class="empty-state dns-empty">
        <strong>未找到匹配的 DNS 记录</strong>
        <span>可以搜索记录类型、域名、目标地址或 IP。</span>
      </div>
    `;
  }

  const visibleRecordIds = records.map((record) => record.id);
  const allVisibleSelected = visibleRecordIds.every((id) =>
    state.selectedDnsRecordIds.includes(id)
  );

  return `
    <div class="dns-table">
      <div class="dns-header">
        <span>
          <input
            id="dns-select-all"
            type="checkbox"
            aria-label="选择全部 DNS 记录"
            ${allVisibleSelected ? "checked" : ""}
          />
        </span>
        <span>类型</span>
        <span>名称</span>
        <span>内容</span>
        <span>代理状态</span>
        <span></span>
      </div>
      ${records
        .map(
          (record) => `
            <div class="dns-row">
              <input
                class="dns-select-record"
                type="checkbox"
                aria-label="选择 DNS 记录"
                data-record-id="${escapeHtml(record.id)}"
                ${state.selectedDnsRecordIds.includes(record.id) ? "checked" : ""}
              />
              <span><span class="type-pill">${escapeHtml(record.type)}</span></span>
              <span class="dns-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</span>
              <span class="dns-content" title="${escapeHtml(record.content)}">
                ${escapeHtml(record.content)}
                <button class="icon-button copy-button" type="button" title="复制记录内容" aria-label="复制记录内容" data-copy="${escapeHtml(record.content)}">${icon("copy")}</button>
              </span>
              <span>
                <span class="proxy-dot ${record.proxied ? "on" : "off"}" title="${record.proxied ? "已代理" : "仅 DNS"}"></span>
                <span class="visually-hidden">
                  ${escapeHtml(record.proxied ? "已代理" : "仅 DNS")}，TTL ${escapeHtml(ttlLabel(record.ttl))}
                </span>
              </span>
              <span class="row-actions">
                <button class="icon-button edit-dns-button" type="button" title="编辑 DNS 记录" aria-label="编辑 DNS 记录" data-record-id="${escapeHtml(record.id)}">${icon("edit")}</button>
                <button class="icon-button delete-dns-button" type="button" title="删除 DNS 记录" aria-label="删除 DNS 记录" data-record-id="${escapeHtml(record.id)}">${icon("trash")}</button>
              </span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
