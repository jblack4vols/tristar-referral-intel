"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";
const REASONS = ["no_show", "never_booked", "cancelled_before_visit", "insurance_issue", "patient_changed_mind", "scheduling_delay", "other"];

function ZeroVisitsInner() {
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rpv, setRpv] = useState(95);
  const [avgVE, setAvgVE] = useState(11.4);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("rpc_zero_visit_cases", { range_start: rangeStart, range_end: rangeEnd, clinic_filter: null, npi_filter: null });
    if (error) { setError(error.message); setLoading(false); return; }
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [rangeStart, rangeEnd]);

  const visible = rows.filter(r => {
    if (filter && !(
      (r.patient_name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (r.referring_doctor_name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (r.case_facility ?? "").toLowerCase().includes(filter.toLowerCase())
    )) return false;
    if (reasonFilter === "untagged" && r.zero_visit_reason) return false;
    if (reasonFilter !== "all" && reasonFilter !== "untagged" && r.zero_visit_reason !== reasonFilter) return false;
    return true;
  });

  const reasonCounts: Record<string, number> = {};
  for (const r of rows) {
    const k = r.zero_visit_reason || "(untagged)";
    reasonCounts[k] = (reasonCounts[k] ?? 0) + 1;
  }

  const lostRevenue = rows.length * avgVE * rpv;

  const tagReason = async (caseId: string, reason: string) => {
    const { error } = await supabase.from("cases").update({ zero_visit_reason: reason }).eq("id", caseId);
    if (error) { alert(error.message); return; }
    load();
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Zero-Visit Investigation</h1>
            <div className="text-gray-300 text-sm">Every referred case that never arrived for a visit. Tag root causes to fix the leak.</div>
          </div>
          <div className="text-right">
            <div className="text-white font-bold text-xl">{rows.length.toLocaleString()} cases</div>
            <div className="text-yellow-300 text-sm">≈ {fmtCurrency(lostRevenue)} potential revenue lost</div>
          </div>
        </header>

        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <input placeholder="Search patient, physician, clinic…" value={filter} onChange={e => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-xs flex-1 min-w-60" />
          <select value={reasonFilter} onChange={e => setReasonFilter(e.target.value)} className="border rounded px-2 py-1 text-xs">
            <option value="all">All reasons ({rows.length})</option>
            <option value="untagged">Untagged ({reasonCounts["(untagged)"] ?? 0})</option>
            {REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")} ({reasonCounts[r] ?? 0})</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">RPV $</span>
            <input type="number" value={rpv} onChange={e => setRpv(parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-xs w-16" />
            <span className="text-gray-500">× V/case</span>
            <input type="number" step="0.1" value={avgVE} onChange={e => setAvgVE(parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-xs w-16" />
          </div>
          <button onClick={() => downloadCsv(visible, `zero-visits-${rangeStart}-to-${rangeEnd}`)}
            className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
        </div>

        <div className="bg-white rounded-b-lg shadow-lg">
          {loading && <div className="p-12 text-center text-gray-500">Loading…</div>}
          {error && <div className="m-4 bg-red-50 border border-red-200 rounded p-4 text-red-800">Error: {error}</div>}

          {!loading && !error && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Created</th>
                    <th className="px-2 py-2 text-left">Patient</th>
                    <th className="px-2 py-2 text-left">Physician</th>
                    <th className="px-2 py-2 text-left">Clinic</th>
                    <th className="px-2 py-2 text-left">Therapist</th>
                    <th className="px-2 py-2 text-left">Payer</th>
                    <th className="px-2 py-2 text-right">Days old</th>
                    <th className="px-2 py-2 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 500).map((r, i) => (
                    <tr key={r.case_id} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                      <td className="px-2 py-2 text-xs">{r.created_date}</td>
                      <td className="px-2 py-2">{r.patient_name ?? r.patient_account_number}</td>
                      <td className="px-2 py-2 text-xs">
                        {r.referring_doctor_npi ? (
                          <Link href={`/physician/${r.referring_doctor_npi}`} className="hover:underline" style={{ color: ORANGE }}>
                            {r.referring_doctor_name ?? r.referring_doctor_npi}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs">{r.case_facility?.replace("Tristar PT - ", "")}</td>
                      <td className="px-2 py-2 text-xs">{r.case_therapist ?? "—"}</td>
                      <td className="px-2 py-2 text-xs">{r.primary_payer_type ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-xs">{r.days_since_creation}</td>
                      <td className="px-2 py-2">
                        <select value={r.zero_visit_reason ?? ""} onChange={e => tagReason(r.case_id, e.target.value)} className="border rounded px-1 py-0.5 text-xs">
                          <option value="">(untagged)</option>
                          {REASONS.map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length > 500 && (
                <div className="text-center text-xs text-gray-500 py-2">Showing first 500 of {visible.length}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ZeroVisitsPage() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}><ZeroVisitsInner /></Suspense>;
}
