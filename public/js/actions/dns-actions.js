import {
  createDnsRecordsBulk,
  createDnsRecord,
  fetchDnsRecords,
  removeDnsRecordsBulk,
  removeDnsRecord,
  updateDnsRecord,
} from "../api.js";
import { proxiableTypes } from "../constants.js";
import { filterDnsRecords } from "../dns-record-filter.js";
import { collectDnsForm, fillDnsFormFromRecord } from "../forms/dns-form.js";
import { resetDnsBulkForm, resetDnsForm, state } from "../state.js";

const bulkBooleanValues = new Map([
  ["true", true],
  ["yes", true],
  ["y", true],
  ["1", true],
  ["on", true],
  ["proxy", true],
  ["proxied", true],
  ["orange", true],
  ["false", false],
  ["no", false],
  ["n", false],
  ["0", false],
  ["off", false],
  ["dns", false],
  ["gray", false],
]);

function splitBulkLine(line) {
  const tokens = [];
  let token = "";
  let quote = "";
  let escaped = false;

  for (const char of line) {
    if (escaped) {
      token += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        token += char;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }

      continue;
    }

    token += char;
  }

  if (quote) {
    throw new Error("引号未闭合");
  }

  if (escaped) {
    token += "\\";
  }

  if (token) {
    tokens.push(token);
  }

  return tokens;
}

function readBulkBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!bulkBooleanValues.has(normalized)) {
    throw new Error("代理状态只能填写 true/false、on/off 或 1/0");
  }

  return bulkBooleanValues.get(normalized);
}

function isBulkBoolean(value) {
  return bulkBooleanValues.has(String(value || "").trim().toLowerCase());
}

function parseBulkTtl(value, lineNumber) {
  if (value === undefined || value === "") {
    return 1;
  }

  const ttl = Number(value);

  if (!Number.isInteger(ttl) || (ttl !== 1 && (ttl < 60 || ttl > 86400))) {
    throw new Error(`第 ${lineNumber} 行 TTL 必须为 1 或 60 到 86400 的整数`);
  }

  return ttl;
}

export function parseDnsBulkText(text) {
  const records = [];

  String(text || "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        return;
      }

      const tokens = splitBulkLine(line);

      if (tokens.length < 3) {
        throw new Error(`第 ${index + 1} 行格式不完整，请填写：类型 名称 内容`);
      }

      if (tokens.length > 6) {
        throw new Error(`第 ${index + 1} 行字段过多，内容包含空格时请使用英文引号包裹`);
      }

      const [typeValue, name, content, ttlValue, proxiedValue, priorityValue] = tokens;
      const type = String(typeValue || "").trim().toUpperCase();
      const record = {
        content,
        name,
        ttl: parseBulkTtl(ttlValue, index + 1),
        type,
      };

      if (proxiedValue !== undefined && proxiedValue !== "" && isBulkBoolean(proxiedValue)) {
        record.proxied = readBulkBoolean(proxiedValue);
      } else if (type === "MX" && proxiedValue !== undefined && priorityValue === undefined) {
        record.priority = proxiedValue;
      } else if (proxiedValue !== undefined && proxiedValue !== "") {
        throw new Error(`第 ${index + 1} 行代理状态只能填写 true/false、on/off 或 1/0`);
      }

      if (priorityValue !== undefined && priorityValue !== "") {
        record.priority = priorityValue;
      }

      records.push(record);
    });

  if (records.length === 0) {
    throw new Error("请输入至少一条 DNS 记录");
  }

  if (records.length > 100) {
    throw new Error("单次最多批量添加 100 条 DNS 记录");
  }

  return records;
}

export function createDnsActions({ renderApp }) {
  async function loadDnsRecords() {
    if (!state.selectedZone?.id) {
      return;
    }

    if (state.dnsSearchZoneId !== state.selectedZone.id) {
      state.dnsSearchQuery = "";
      state.dnsSearchZoneId = state.selectedZone.id;
    }

    state.loadingDns = true;
    state.dnsError = "";
    state.selectedDnsRecordIds = [];
    renderApp();

    try {
      state.dnsRecords = await fetchDnsRecords(state.selectedZone.id);
    } catch (error) {
      state.dnsError = error.message;
    } finally {
      state.loadingDns = false;
      renderApp();
    }
  }

  function resetDnsFormAction() {
    const keepCreateFormOpen = state.dnsFormOpen && !state.dnsForm.id;
    resetDnsForm();
    state.dnsFormOpen = keepCreateFormOpen;
    state.notice = "";
    renderApp();
  }

  function openCreateDnsForm() {
    resetDnsForm();
    resetDnsBulkForm();
    state.dnsFormOpen = true;
    state.notice = "";
    renderApp();
    document.querySelector("#dns-record-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function openDnsBulkForm() {
    resetDnsForm();
    state.dnsBulkFormOpen = true;
    state.notice = "";
    renderApp();
    document.querySelector("#dns-bulk-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function closeDnsBulkForm() {
    resetDnsBulkForm();
    state.notice = "";
    renderApp();
  }

  async function submitDnsBulk(event) {
    event.preventDefault();

    if (!state.selectedZone?.id) {
      return;
    }

    const text = String(new FormData(event.currentTarget).get("records") || "");
    state.dnsBulkText = text;

    let records;

    try {
      records = parseDnsBulkText(text);
    } catch (error) {
      state.notice = error.message;
      renderApp();
      return;
    }

    state.savingDnsBulk = true;
    state.notice = "";
    renderApp();

    try {
      const createdRecords = await createDnsRecordsBulk(state.selectedZone.id, records);
      resetDnsBulkForm();
      state.notice = `已批量添加 ${createdRecords.length} 条 DNS 记录`;
      await loadDnsRecords();
    } catch (error) {
      state.notice = error.message;
    } finally {
      state.savingDnsBulk = false;
      renderApp();
    }
  }

  function syncDnsFormType(event) {
    state.dnsForm = collectDnsForm();
    state.dnsForm.type = event.target.value;

    if (!proxiableTypes.has(state.dnsForm.type)) {
      state.dnsForm.proxied = false;
    }

    renderApp();
  }

  async function saveDnsRecord(event) {
    event.preventDefault();

    if (!state.selectedZone?.id) {
      return;
    }

    const record = collectDnsForm();
    const isEdit = Boolean(record.id);
    state.dnsForm = { ...record, ttl: String(record.ttl) };
    state.savingDns = true;
    state.notice = "";
    renderApp();

    try {
      if (isEdit) {
        await updateDnsRecord(state.selectedZone.id, record.id, record);
      } else {
        await createDnsRecord(state.selectedZone.id, record);
      }

      resetDnsForm();
      state.notice = isEdit ? "DNS 记录已更新" : "DNS 记录已添加";
      await loadDnsRecords();
    } catch (error) {
      state.notice = error.message;
    } finally {
      state.savingDns = false;
      renderApp();
    }
  }

  function editDnsRecord(recordId) {
    const record = state.dnsRecords.find((item) => item.id === recordId);

    if (!record) {
      return;
    }

    fillDnsFormFromRecord(record);
    state.dnsFormOpen = true;
    state.notice = "";
    renderApp();
    document.querySelector("#dns-record-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function deleteDnsRecord(recordId) {
    const record = state.dnsRecords.find((item) => item.id === recordId);

    if (!record || !state.selectedZone?.id) {
      return;
    }

    const confirmed = window.confirm(`确定删除 ${record.type} ${record.name} 吗？`);

    if (!confirmed) {
      return;
    }

    try {
      await removeDnsRecord(state.selectedZone.id, record.id);
      state.notice = "DNS 记录已删除";
      await loadDnsRecords();
    } catch (error) {
      state.notice = error.message;
      renderApp();
    }
  }

  function toggleDnsRecordSelection(recordId, checked) {
    const normalizedRecordId = String(recordId || "");

    if (!normalizedRecordId) {
      return;
    }

    const selectedIds = new Set(state.selectedDnsRecordIds);

    if (checked) {
      selectedIds.add(normalizedRecordId);
    } else {
      selectedIds.delete(normalizedRecordId);
    }

    state.selectedDnsRecordIds = [...selectedIds].filter((id) =>
      state.dnsRecords.some((record) => record.id === id)
    );
    renderApp();
  }

  function toggleAllDnsRecords(event) {
    const visibleRecordIds = new Set(
      filterDnsRecords(state.dnsRecords, state.dnsSearchQuery).map((record) => record.id)
    );
    const selectedIds = new Set(state.selectedDnsRecordIds);

    for (const recordId of visibleRecordIds) {
      if (event.target.checked) {
        selectedIds.add(recordId);
      } else {
        selectedIds.delete(recordId);
      }
    }

    state.selectedDnsRecordIds = [...selectedIds].filter((id) =>
      state.dnsRecords.some((record) => record.id === id)
    );
    renderApp();
  }

  function searchDnsRecords(event) {
    const query = String(event?.currentTarget?.value || "");
    const visibleRecordIds = new Set(
      filterDnsRecords(state.dnsRecords, query).map((record) => record.id)
    );

    state.dnsSearchQuery = query;
    state.selectedDnsRecordIds = state.selectedDnsRecordIds.filter((id) =>
      visibleRecordIds.has(id)
    );
    renderApp();

    const input = document.querySelector("#dns-record-search");
    input?.focus();
    input?.setSelectionRange(query.length, query.length);
  }

  async function deleteSelectedDnsRecords() {
    if (!state.selectedZone?.id || state.selectedDnsRecordIds.length === 0) {
      return;
    }

    const recordIds = [...new Set(state.selectedDnsRecordIds)];
    const confirmed = window.confirm(`确定删除选中的 ${recordIds.length} 条 DNS 记录吗？`);

    if (!confirmed) {
      return;
    }

    state.deletingDnsBulk = true;
    state.notice = "";
    renderApp();

    try {
      await removeDnsRecordsBulk(state.selectedZone.id, recordIds);
      state.selectedDnsRecordIds = [];
      state.notice = `已批量删除 ${recordIds.length} 条 DNS 记录`;
      await loadDnsRecords();
    } catch (error) {
      state.notice = error.message;
    } finally {
      state.deletingDnsBulk = false;
      renderApp();
    }
  }

  return {
    closeDnsBulkForm,
    deleteDnsRecord,
    deleteSelectedDnsRecords,
    editDnsRecord,
    loadDnsRecords,
    openCreateDnsForm,
    openDnsBulkForm,
    resetDnsForm: resetDnsFormAction,
    saveDnsRecord,
    searchDnsRecords,
    syncDnsFormType,
    submitDnsBulk,
    toggleAllDnsRecords,
    toggleDnsRecordSelection,
  };
}
