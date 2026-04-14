"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const ORANGE = "#FF8200";

export default function PhysicianDetailPage({ params }: { params: Promise<{ npi: string }> }) {
  const { npi } = use(params);
  const [overview, setOverview] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [byClinic, setByClinic] = useState<any[]>([]);
  const [byTherapist, setByTherapist] = useState<any[]>([]);
  const [byPayer, setByPayer] = useState<any[]>([]);
  const [byDx, setByDx] = useState<any[]>([]);
  const [discharge, setDischarge] = useState<any[]>([]);
  const [recentCases, setRecentCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simple date range state — default all-time
  const rangeEnd = new Date().toISOString().slice(0, 10);
  const rangeStart = "2024-01-01";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [o, t, bc, bt, bp, bd, dr, rc] = await Promise.all([
          supabase.rpc("rpc_physician_overview", { p_npi: npi }),
          supabase.rpc("rpc_physician_monthly_trend", { p_npi: npi }),
          supabase.rpc("rpc_physician_by_clinic", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_physician_by_therapist", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_physician_by_payer", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_physician_by_dx", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
          supabase.rpc("rpc_physician_discharge_reasons", { p_npi: npi }),
          supabase.rpc("rpc_physician_recent_cases", { p_npi: npi, row_limit: 50 }),
        ]);
        if (cancelled) return;
        const firstErr = o.error || t.error || bc.error || bt.error || bp.error || bd.error || dr.error || rc.error;
        if (firstErr) { setError(firstErr.message); setLoading(false); return; }
        setOverview(o.data?.[0] ?? null);
        setTrend(t.data ?? []);
        setByClinic(bc.data ?? []);
        setByTherapist(bt.data ?? []);
        setByPayer(bp.data ?? []);
        setByDx(bd.data ?? []);
        setDischarge(dr.data ?? []);
        setRecentCases(rc.data ?? []);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [npi]);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">
            {overview?.name ?? (loading ? "Loading…" : "Unknown physician")}
            {overview?.departed && <span className="ml-3 text-red-400 text-base font-normal">❌ Departed</span>}
          </h1>
          <div className="text-gray-300 text-sm font-mono">NPI {npi}</div>
          {overview && (
            <div className="text-gray-400 text-xs mt-1">
              {overview.specialty ?? "Specialty unknown"} · {overview.credential ?? ""} · {[overview.city, overview.state].filter(Boolean).join(", ")} {overview.phone ? `· ${overview.phone}` : ""}
            </div>
          )}
        </header>

        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded p-4 m-4 text-red-800">Error: {error}</div>}

        {!loading && !error && overview && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-6">
            {/* Headline stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Stat label="Total cases" value={overview.total_cases} />
              <Stat label="Total visits" value={overview.total_visits} />
              <Stat label="Avg visits / case" value={overview.total_cases > 0 ? (overview.total_visits / overview.total_cases).toFixed(1) : "0"} />
              <Stat label="Clinics used" value={overview.locations_used} />
              <Stat label="Outcome reports sent" value={overview.outcome_reports_sent} color={overview.outcome_reports_sent > 0 ? "#16A34A" : "#CC0000"} />
            </div>
            <div className="text-xs text-gray-500">
              First referral: {overview.first_case_date ?? "—"} · Last referral: {overview.last_case_date ?? "—"}
            </div>

            {/* Monthly trend */}
            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Monthly trend (all time)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cases" stroke={ORANGE} strokeWidth={2} name="Cases" />
                  <Line type="monotone" dataKey="visits" stroke="#000" strokeWidth={2} name="Visits" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Breakdown title="By clinic" rows={byClinic} cols={[
                ["Clinic", r => r.case_facility?.replace("Tristar PT - ", "")],
                ["Cases", r => r.cases],
                ["Visits", r => r.visits],
                ["Avg V/E", r => r.avg_ve ?? "—"],
                ["Zero-visit", r => r.zero_visit_pct != null ? r.zero_visit_pct + "%" : "—"],
              ]} />
              <Breakdown title="By therapist" rows={byTherapist} cols={[
                ["Therapist", r => r.case_therapist],
                ["Cases", r => r.cases],
                ["Visits", r => r.visits],
                ["Avg V/E", r => r.avg_ve],
              ]} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Breakdown title="By payer" rows={byPayer} cols={[
                ["Payer", r => r.primary_payer_type],
                ["Tier", r => r.tier],
                ["Cases", r => r.cases],
                ["Avg V/E", r => r.avg_ve],
              ]} />
              <Breakdown title="By diagnosis category" rows={byDx} cols={[
                ["Dx", r => r.patient_diagnosis_category],
                ["Cases", r => r.cases],
                ["Avg V/E", r => r.avg_ve],
              ]} />
            </div>

            {discharge.length > 0 && (
              <Breakdown title="Discharge reasons (matured cases)" rows={discharge} cols={[
                ["Reason", r => r.discharge_reason],
                ["Cases", r => r.cases],
                ["% of total", r => r.pct + "%"],
              ]} />
            )}

            <div className="border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Recent cases (last 50)</h3>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">Created</th>
                      <th className="px-2 py-1 text-left">Patient</th>
                      <th className="px-2 py-1 text-left">Clinic</th>
                      <th className="px-2 py-1 text-left">Therapist</th>
                      <th className="px-2 py-1 text-left">Dx</th>
                      <th className="px-2 py-1 text-left">Payer</th>
                      <th className="px-2 py-1 text-right">Visits</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Discharged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCases.map((r, i) => (
                      <tr key={r.patient_account_number + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-2 py-1">{r.created_date}</td>
                        <td className="px-2 py-1">{r.patient_name ?? "—"}</td>
                        <td className="px-2 py-1">{r.case_facility?.replace("Tristar PT - ", "")}</td>
                        <td className="px-2 py-1">{r.case_therapist ?? "—"}</td>
                        <td className="px-2 py-1">{r.patient_diagnosis_category ?? "—"}</td>
                        <td className="px-2 py-1">{r.primary_payer_type ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{r.arrived_visits}</td>
                        <td className="px-2 py-1">{r.case_status ?? "—"}</td>
                        <td className="px-2 py-1">{r.discharge_date ? `${r.discharge_date} · ${r.discharge_reason ?? ""}` : "—"}</td>
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

function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
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
