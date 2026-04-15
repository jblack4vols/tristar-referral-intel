"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtCurrency } from "@/lib/export";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const ORANGE = "#FF8200";

function Inner({ name }: { name: string }) {
  const decoded = decodeURIComponent(name);
  const [overview, setOverview] = useState<any>(null);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [byPhys, setByPhys] = useState<any[]>([]);
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.rpc("rpc_therapist_overview", { p_name: decoded, range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_therapist_monthly", { p_name: decoded }),
      supabase.rpc("rpc_therapist_by_physician", { p_name: decoded, range_start: rangeStart, range_end: rangeEnd }),
    ]).then(([o, m, p]) => {
      setOverview(o.data?.[0] ?? null);
      setMonthly(m.data ?? []);
      setByPhys(p.data ?? []);
      setLoading(false);
    });
  }, [decoded, rangeStart, rangeEnd]);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3">
          <Link href="/therapists" className="text-sm hover:underline mr-3" style={{ color: ORANGE }}>← All therapists</Link>
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>Dashboard</Link>
        </div>
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">{decoded}</h1>
          <div className="text-gray-300 text-sm">Therapist performance detail</div>
        </header>
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
        </div>
        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}
        {!loading && overview && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Cases (in range)" value={overview.cases_in_range} />
              <Stat label="Visits (in range)" value={Number(overview.visits_in_range).toLocaleString()} />
              <Stat label="Revenue (in range)" value={fmtCurrency(Number(overview.revenue_in_range))} color="#16A34A" />
              <Stat label="RPV (in range)" value={fmtCurrency(Number(overview.rpv_in_range), 2)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Cases all-time" value={overview.cases_total} />
              <Stat label="Visits all-time" value={Number(overview.visits_total).toLocaleString()} />
              <Stat label="Avg V/case" value={overview.avg_ve ?? "—"} />
              <Stat label="Zero-visit %" value={`${overview.zero_visit_pct ?? "—"}%`} color={overview.zero_visit_pct > 15 ? "#CC0000" : "#16A34A"} />
            </div>

            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Monthly trend (all time)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="cases" stroke={ORANGE} strokeWidth={2} name="Cases" />
                  <Line type="monotone" dataKey="visits" stroke="#000" strokeWidth={2} name="Visits" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Patients referred by physician (in range)</h3>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Physician</th>
                      <th className="px-2 py-2 text-left">NPI</th>
                      <th className="px-2 py-2 text-right">Cases</th>
                      <th className="px-2 py-2 text-right">Visits</th>
                      <th className="px-2 py-2 text-right">Avg V/case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPhys.map((r: any, i: number) => (
                      <tr key={r.npi + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-2 py-1">
                          <Link href={`/physician/${r.npi}`} className="hover:underline" style={{ color: ORANGE }}>
                            {r.physician ?? r.npi}
                          </Link>
                        </td>
                        <td className="px-2 py-1 font-mono text-xs">{r.npi}</td>
                        <td className="px-2 py-1 text-right">{r.cases}</td>
                        <td className="px-2 py-1 text-right">{r.visits}</td>
                        <td className="px-2 py-1 text-right">{r.avg_ve}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default function Page({ params }: { params: { name: string } }) {
  return <Suspense fallback={null}><Inner name={params.name}/></Suspense>;
}
function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
