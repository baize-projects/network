function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function filterDnsRecords(records = [], query = "") {
  const terms = normalizeSearchValue(query).split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return Array.isArray(records) ? records : [];
  }

  return (Array.isArray(records) ? records : []).filter((record) => {
    const fields = [record?.type, record?.name, record?.content].map(normalizeSearchValue);

    return terms.every((term) => fields.some((field) => field.includes(term)));
  });
}
