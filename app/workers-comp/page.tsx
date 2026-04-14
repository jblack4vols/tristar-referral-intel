"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

function WorkersCompInner() {
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [rpv, setRpv] = useState(140); // WC pays ~120-150% of Medicare

  useEffect(() => {
    setLoading(true);
    supabase.rpc("rpc_workers_comp_overview", { range_start: rangeStart, range_end: rangeEnd })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [rangeStart, rangeEnd]);

  const visible = rows.filter(r => !filter ||
    (r.physician ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    r.npi.includes(filter) ||
    (r.specialty ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (r.practice_city ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const wcSenders = rows.filter(r => r.wc_cases > 0);
  const occMedSpecs = rows.filter(r =>
    (r.specialty ?? "").toLowerCase().includes("occupational") ||
    (r.specialty ?? "").toLowerCase().includes("preventive medicine")
  );
  const orthoNonSenders = rows.filter(r =>
    (r.specialty ?? "").toLowerCase().includes("orthop") && r.wc_cases === 0
  );
  const totalWcCases = wcSenders.reduce((s, r) => s + Number(r.wc_cases), 0);
  const totalWcVisits = wcSenders.reduce((s, r) => s + Number(r.wc_visits), 0);
  const wcRevenue = totalWcVisits * rpv;

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Workers Comp Channel</h1>
          <div className="text-gray-300 text-sm">WC pays ~120-150% of Medicare. This is Tristar's highest-value underdeveloped referral channel.</div>
        </header>

        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <input placeholder="Search physician, specialty, city…" value={filter} onChange={e => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-xs flex-1 min-w-60" />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">WC RPV $</span>
            <input type="number" value={rpv} onChange={e => setRpv(parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-xs w-20" />
          </div>
          <button onClick={() => downloadCsv(visible, `workers-comp-${rangeStart}-to-${rangeEnd}`)}
            className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
        </div>

        <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Current WC senders" value={wcSenders.length} />
            <Stat label="WC cases in window" value={totalWcCases} />
            <Stat label="WC visits in window" value={totalWcVisits} />
            <Stat label="WC revenue (est.)" value={fmtCurrency(wcRevenue)} color="#16A34A" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <div className="text-sm font-bold text-blue-800 mb-1">💡 Occ med prospects ({occMedSpecs.length})</div>
              <div className="text-xs text-gray-600">Physicians with "Occupational" or "Preventive Medicine" specialty who already refer to Tristar. These are your highest-probability WC channel builds.</div>
              {occMedSpecs.length > 0 && (
                <ul className="text-sm mt-2 space-y-1">
                  {occMedSpecs.slice(0, 5).map(r => (
                    <li key={r.npi}>
                      <Link href={`/physician/${r.npi}`} className="hover:underline" style={{ color: ORANGE }}>{r.physician}</Link>
                      {" "}— {r.specialty} · {r.practice_city ?? "—"} · WC: {r.wc_cases}/total {r.total_cases}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="text-sm font-bold text-yellow-800 mb-1">⚠ Ortho referrers who DON'T send WC ({orthoNonSenders.length})</div>
              <div className="text-xs text-gray-600">Orthopedic referrers already sending non-WC patients. Each one could plausibly add WC volume. Marketer ask: "Do you handle workplace injuries? We can take those too."</div>
              {orthoNonSenders.length > 0 && (
                <ul className="text-sm mt-2 space-y-1">
                  {orthoNonSenders.slice(0, 5).map(r => (
                    <li key={r.npi}>
                      <Link href={`/physician/${r.npi}`} className="hover:underline" style={{ color: ORANGE }}>{r.physician}</Link>
                      {" "}— {r.total_cases} non-WC cases · {r.practice_city ?? "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left">Physician</th>
                  <th className="px-2 py-2 text-left">Specialty</th>
                  <th className="px-2 py-2 text-left">City</th>
                  <th className="px-2 py-2 text-right">WC cases</th>
                  <th className="px-2 py-2 text-right">WC visits</th>
                  <th className="px-2 py-2 text-right">Total cases</th>
                  <th className="px-2 py-2 text-right">WC %</th>
                  <th className="px-2 py-2 text-right">Avg V/case</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 200).map((r, i) => (
                  <tr key={r.npi + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"} style={r.departed ? { opacity: 0.5 } : {}}>
                    <td className="px-2 py-2 font-semibold">
                      <Link href={`/physician/${r.npi}`} className="hover:underline" style={{ color: ORANGE }}>{r.physician}</Link>
                      {r.departed && <span className="ml-1 text-red-600 text-xs">❌</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">{r.specialty ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">{r.practice_city ?? "—"}</td>
                    <td className="px-2 py-2 text-right font-semibold" style={r.wc_cases > 0 ? { color: "#16A34A" } : {}}>{r.wc_cases}</td>
                    <td className="px-2 py-2 text-right">{r.wc_visits}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{r.total_cases}</td>
                    <td className="px-2 py-2 text-right">{r.wc_pct}%</td>
                    <td className="px-2 py-2 text-right">{r.avg_visits_per_case ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkersCompPage() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}><WorkersCompInner /></Suspense>;
}

function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
