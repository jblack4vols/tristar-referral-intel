"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

function TherapistsInner() {
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.rpc("rpc_all_therapists", { range_start: rangeStart, range_end: rangeEnd }).then(({ data }) => {
      setRows(data ?? []);
      setLoading(false);
    });
  }, [rangeStart, rangeEnd]);

  const visible = rows.filter(r => !filter || (r.therapist ?? "").toLowerCase().includes(filter.toLowerCase()) || (r.locations ?? "").toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3"><Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link></div>
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Therapist Performance</h1>
          <div className="text-gray-300 text-sm">Per-therapist productivity, retention, and revenue. Click a therapist to drill into their cases.</div>
        </header>
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <input placeholder="Search therapist, location…" value={filter} onChange={e => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-xs flex-1 min-w-60" />
          <button onClick={() => downloadCsv(visible, `therapists-${rangeStart}-${rangeEnd}`)}
            className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
        </div>
        <div className="bg-white rounded-b-lg shadow-lg">
          {loading && <div className="p-12 text-center text-gray-500">Loading…</div>}
          {!loading && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Therapist</th>
                    <th className="px-3 py-2 text-right">Cases</th>
                    <th className="px-3 py-2 text-right">Visits</th>
                    <th className="px-3 py-2 text-right">Patients</th>
                    <th className="px-3 py-2 text-right">Avg V/case</th>
                    <th className="px-3 py-2 text-right">Zero-visit %</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">RPV</th>
                    <th className="px-3 py-2 text-left">Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 300).map((r, i) => (
                    <tr key={r.therapist + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                      <td className="px-3 py-2 font-semibold">
                        <Link href={`/therapist/${encodeURIComponent(r.therapist)}`} className="hover:underline" style={{ color: ORANGE }}>{r.therapist}</Link>
                      </td>
                      <td className="px-3 py-2 text-right">{Number(r.cases).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Number(r.visits).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Number(r.unique_patients).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{r.avg_ve ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={r.zero_visit_pct > 15 ? { color: "#CC0000" } : r.zero_visit_pct < 5 ? { color: "#16A34A" } : {}}>
                        {r.zero_visit_pct ?? "—"}%
                      </td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(Number(r.revenue))}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(Number(r.rpv), 2)}</td>
                      <td className="px-3 py-2 text-xs">{r.locations?.replace(/Tristar PT - /g, "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={null}><TherapistsInner/></Suspense>; }
