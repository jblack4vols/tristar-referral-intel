"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const ORANGE = "#FF8200";
const BLACK = "#000000";

// slug → full facility name
function slugToFacility(slug: string) {
  const map: Record<string, string> = {
    "morristown": "Tristar PT - Morristown",
    "maryville": "Tristar PT - Maryville",
    "bean-station": "Tristar PT - Bean Station",
    "newport": "Tristar PT - Newport",
    "jefferson-city": "Tristar PT - Jefferson City",
    "rogersville": "Tristar PT - Rogersville",
    "new-tazewell": "Tristar PT - New Tazewell",
    "johnson-city": "Tristar PT - Johnson City",
  };
  return map[slug] ?? slug;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const minusOneYear = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());

export default function LocationDetailPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const facility = slugToFacility(slug);
  const [overview, setOverview] = useState<any>(null);
  const [topMDs, setTopMDs] = useState<any[]>([]);
  const [byTherapist, setByTherapist] = useState<any[]>([]);
  const [byPayer, setByPayer] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [discharge, setDischarge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range — YTD vs prior year
  const [rangeStart, setRangeStart] = useState(fmtDate(startOfYear(today())));
  const [rangeEnd, setRangeEnd] = useState(fmtDate(today()));
  const [priorStart, setPriorStart] = useState(fmtDate(minusOneYear(startOfYear(today()))));
  const [priorEnd, setPriorEnd] = useState(fmtDate(minusOneYear(today())));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [o, top, bt, bp, tr, dr] = await Promise.all([
          supabase.rpc("rpc_location_overview", { p_facility: facility, range_start: rangeStart, range_end: rangeEnd, prior_start: priorStart, prior_end: priorEnd }),
          supabase.rpc("rpc_location_top_referrers", { p_facility: facility, range_start: rangeStart, range_end: rangeEnd, prior_start: priorStart, prior_end: priorEnd, row_limit: 25 }),
          supabase.rpc("rpc_location_by_therapist", { p_facility: facility, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_location_by_payer", { p_facility: facility, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_location_monthly_trend", { p_facility: facility }),
          supabase.rpc("rpc_location_discharge_reasons", { p_facility: facility }),
        ]);
        if (cancelled) return;
        const firstErr = o.error || top.error || bt.error || bp.error || tr.error || dr.error;
        if (firstErr) { setError(firstErr.message); setLoading(false); return; }
        setOverview(o.data?.[0] ?? null);
        setTopMDs(top.data ?? []);
        setByTherapist(bt.data ?? []);
        setByPayer(bp.data ?? []);
        setTrend(tr.data ?? []);
        setDischarge(dr.data ?? []);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [facility, rangeStart, rangeEnd, priorStart, priorEnd]);

  const yoyBadge = (curr: number, prior: number) => {
    if (!prior) return curr > 0 ? "NEW" : "—";
    const pct = ((curr - prior) / prior * 100);
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">{facility.replace("Tristar PT - ", "")}</h1>
          <div className="text-gray-300 text-sm">
            Current: {rangeStart} → {rangeEnd} · Prior: {priorStart} → {priorEnd}
          </div>
        </header>

        {/* Date controls */}
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-700 mr-2">Range:</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Curr:</span>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400">→</span>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          </div>
          <div className="flex items-center gap-1 ml-3">
            <span className="text-xs text-gray-500">Prior:</span>
            <input type="date" value={priorStart} onChange={e => setPriorStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400">→</span>
            <input type="date" value={priorEnd} onChange={e => setPriorEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          </div>
        </div>

        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded p-4 m-4 text-red-800">Error: {error}</div>}

        {!loading && !error && overview && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total cases" value={overview.cases_curr} sub={`vs ${overview.cases_prior} · ${yoyBadge(overview.cases_curr, overview.cases_prior)}`} />
              <Stat label="Physician cases" value={overview.doc_cases_curr} sub={`vs ${overview.doc_cases_prior} · ${yoyBadge(overview.doc_cases_curr, overview.doc_cases_prior)}`} />
              <Stat label="Unique MDs" value={overview.unique_mds_curr} sub={`vs ${overview.unique_mds_prior}`} />
              <Stat label="Total visits" value={overview.total_visits_curr} sub={`vs ${overview.total_visits_prior}`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Avg visits / case" value={overview.avg_ve_curr ?? "—"} sub={`Prior: ${overview.avg_ve_prior ?? "—"}`} />
              <Stat label="Zero-visit %" value={(overview.zero_visit_pct_curr ?? "—") + "%"} sub={`Prior: ${overview.zero_visit_pct_prior ?? "—"}%`} color="#CC0000" />
            </div>

            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Monthly case volume (all time)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cases" stroke={ORANGE} strokeWidth={3} dot={{ fill: ORANGE }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Top referring physicians (current range)</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">Physician</th>
                      <th className="px-2 py-1 text-left">NPI</th>
                      <th className="px-2 py-1 text-left">Specialty</th>
                      <th className="px-2 py-1 text-right">Curr</th>
                      <th className="px-2 py-1 text-right">Prior</th>
                      <th className="px-2 py-1 text-right">YoY</th>
                      <th className="px-2 py-1 text-right">Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMDs.map((r, i) => (
                      <tr key={r.npi + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"} style={r.departed ? { opacity: 0.5 } : {}}>
                        <td className="px-2 py-1">{i + 1}</td>
                        <td className="px-2 py-1 font-semibold">
                          <Link href={`/physician/${r.npi}`} className="hover:underline" style={{ color: ORANGE }}>
                            {r.physician ?? r.npi}
                          </Link>
                          {r.departed && <span className="ml-2 text-red-600 text-xs">❌</span>}
                        </td>
                        <td className="px-2 py-1 font-mono text-xs">{r.npi}</td>
                        <td className="px-2 py-1 text-xs">{r.specialty ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{r.evals_curr}</td>
                        <td className="px-2 py-1 text-right">{r.evals_prior}</td>
                        <td className="px-2 py-1 text-right" style={{ color: r.yoy_pct >= 999 ? "#16A34A" : r.yoy_pct >= 0 ? "#16A34A" : "#CC0000" }}>
                          {r.yoy_pct >= 999 ? "NEW" : `${r.yoy_pct >= 0 ? "+" : ""}${r.yoy_pct}%`}
                        </td>
                        <td className="px-2 py-1 text-right">{r.visits_curr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Breakdown title="By therapist" rows={byTherapist} cols={[
                ["Therapist", r => r.case_therapist],
                ["Cases", r => r.cases],
                ["Visits", r => r.visits],
                ["Avg V/E", r => r.avg_ve],
              ]} />
              <Breakdown title="By payer" rows={byPayer} cols={[
                ["Payer", r => r.primary_payer_type],
                ["Tier", r => r.tier],
                ["Cases", r => r.cases],
                ["Avg V/E", r => r.avg_ve],
              ]} />
            </div>

            {discharge.length > 0 && (
              <Breakdown title="Discharge reasons (all time)" rows={discharge} cols={[
                ["Reason", r => r.discharge_reason],
                ["Cases", r => r.cases],
                ["% of total", r => r.pct + "%"],
              ]} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Breakdown({ title, rows, cols }: { title: string; rows: any[]; cols: [string, (r: any) => any][] }) {
  return (
    <div className="border rounded p-3">
      <h3 className="font-bold mb-2" style={{ color: ORANGE }}>{title}</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>{cols.map(([h]) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                {cols.map(([h, fn]) => <td key={h} className="px-2 py-1">{fn(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
