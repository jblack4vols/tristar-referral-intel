// Client-side CSV export. Converts any array of objects to a downloadable CSV.

export function downloadCsv(rows: any[], filename: string) {
  if (!rows || rows.length === 0) {
    alert("No rows to export.");
    return;
  }
  // Collect all keys across all rows (handles sparse data)
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // Wrap in quotes if contains comma, quote, or newline
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(",");
  const body = rows.map(r => keys.map(k => escape(r[k])).join(",")).join("\n");
  const csv = header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9._-]/g, "_").endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Format currency ($1,234)
export function fmtCurrency(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n as number)) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;
}

// Format currency compact ($1.3M, $340K)
export function fmtCurrencyCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export const TRISTAR_CONSTANTS = {
  RPV: 95,
  CPV: 92,
  AVG_VISITS_PER_EVAL: 11.4,
  LOST_REV_PER_CASE: 1084.50,
};
