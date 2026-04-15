"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

function Inner({ npi }: { npi: string }) {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const rangeEnd = new Date().toISOString().slice(0, 10);
  const rangeStart = `${new Date().getFullYear()}-01-01`;

  useEffect(() => {
    Promise.all([
      supabase.rpc("rpc_physician_overview", { p_npi: npi }),
      supabase.rpc("rpc_physician_revenue", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_physician_revenue_by_payer", { p_npi: npi, range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_physician_churn_score", { p_npi: npi }),
      supabase.rpc("rpc_physician_stats_v3", { curr_start: rangeStart, curr_end: rangeEnd, prior_start: `${new Date().getFullYear()-1}-01-01`, prior_end: new Date(Date.now() - 365*86400000).toISOString().slice(0,10), npi_filter: [npi], source_filter: null, payer_filter: null, clinic_filter: null, specialty_filter: null, therapist_filter: null, dx_filter: null, status_filter: null }),
      supabase.from("physician_notes").select("*").eq("physician_npi", npi).order("created_at", { ascending: false }).limit(5),
      supabase.from("marketer_activities").select("*").eq("physician_npi", npi).order("activity_date", { ascending: false }).limit(1),
    ]).then(([ov, rev, revPay, ch, stats, notes, acts]) => {
      setData({
        overview: ov.data?.[0],
        revenue: rev.data?.[0],
        byPayer: revPay.data ?? [],
        churn: ch.data?.[0],
        stat: stats.data?.[0],
        notes: notes.data ?? [],
        lastActivity: acts.data?.[0],
      });
      setLoading(false);
    });
  }, [npi]);

  if (loading) return <div className="p-12 text-center text-gray-500">Loading scorecard…</div>;
  const o = data.overview, r = data.revenue, ch = data.churn, s = data.stat;

  return (
    <div className="min-h-screen p-4 print:p-2 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="print:hidden mb-3 flex justify-between items-center">
          <Link href={`/physician/${npi}`} className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to full page</Link>
          <button onClick={() => window.print()} className="px-3 py-1 rounded text-sm text-white font-semibold" style={{ backgroundColor: ORANGE }}>🖨 Print</button>
        </div>
        <div className="border-4 p-6 print:border-2" style={{ borderColor: ORANGE }}>
          <header className="border-b-4 pb-3 mb-4" style={{ borderColor: ORANGE }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase">Physician Scorecard</div>
                <h1 className="text-3xl font-bold" style={{ color: ORANGE }}>{o?.name ?? "Unknown"}</h1>
                <div className="text-sm text-gray-600">NPI {npi} · {o?.specialty ?? "—"} · {o?.credential ?? ""} · {o?.city ?? ""}{o?.city ? ", " : ""}{o?.state ?? ""}</div>
                {o?.phone && <div className="text-sm text-gray-600">Phone: {o.phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Generated</div>
                <div className="text-sm">{new Date().toLocaleDateString()}</div>
                {o?.departed && <div className="text-sm text-red-600 font-bold mt-1">❌ DEPARTED — do not contact</div>}
              </div>
            </div>
          </header>

          <section className="mb-4">
            <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">YTD Performance</h2>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-gray-500">Evals YTD</div><div className="text-xl font-bold">{s?.evals_curr ?? 0}</div></div>
              <div><div className="text-xs text-gray-500">Evals prior year</div><div className="text-xl font-bold">{s?.evals_prior ?? 0}</div></div>
              <div><div className="text-xs text-gray-500">YoY change</div><div className="text-xl font-bold" style={{ color: s?.yoy_pct >= 0 ? "#16A34A" : "#CC0000" }}>{s?.yoy_pct >= 999 ? "NEW" : `${s?.yoy_pct >= 0 ? "+" : ""}${s?.yoy_pct}%`}</div></div>
              <div><div className="text-xs text-gray-500">Clinics used</div><div className="text-xl font-bold">{o?.locations_used ?? 0}</div></div>
            </div>
          </section>

          {r && r.total_visits > 0 && (
            <section className="mb-4 bg-green-50 border border-green-300 rounded p-3">
              <h2 className="font-bold text-sm uppercase text-green-800 mb-2">Actual Revenue (YTD)</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs text-gray-500">Visits</div><div className="text-lg font-bold">{Number(r.total_visits).toLocaleString()}</div></div>
                <div><div className="text-xs text-gray-500">Total paid</div><div className="text-lg font-bold">{fmtCurrency(Number(r.total_paid))}</div></div>
                <div><div className="text-xs text-gray-500">RPV</div><div className="text-lg font-bold">{fmtCurrency(Number(r.rpv), 2)}</div></div>
              </div>
            </section>
          )}

          {data.byPayer.length > 0 && (
            <section className="mb-4">
              <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Top Payers</h2>
              <table className="w-full text-xs">
                <thead className="bg-gray-100"><tr>
                  <th className="px-2 py-1 text-left">Payer</th>
                  <th className="px-2 py-1 text-right">Visits</th>
                  <th className="px-2 py-1 text-right">Paid</th>
                  <th className="px-2 py-1 text-right">RPV</th>
                </tr></thead>
                <tbody>
                  {data.byPayer.slice(0, 5).map((p: any) => (
                    <tr key={p.primary_insurance_type}>
                      <td className="px-2 py-1">{p.primary_insurance_type}</td>
                      <td className="px-2 py-1 text-right">{Number(p.visits).toLocaleString()}</td>
                      <td className="px-2 py-1 text-right">{fmtCurrency(Number(p.paid))}</td>
                      <td className="px-2 py-1 text-right">{fmtCurrency(Number(p.rpv), 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {ch && (
            <section className="mb-4">
              <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Risk Assessment</h2>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><div className="text-xs text-gray-500">Churn score</div><div className="text-lg font-bold" style={{ color: ch.risk_tier === "High" ? "#CC0000" : ch.risk_tier === "Elevated" ? "#EA580C" : ch.risk_tier === "Watch" ? "#D97706" : "#16A34A" }}>{Number(ch.churn_score).toFixed(0)} · {ch.risk_tier}</div></div>
                <div><div className="text-xs text-gray-500">Days since last ref</div><div className="text-lg font-bold">{ch.days_since_last_referral ?? "—"}</div></div>
                <div><div className="text-xs text-gray-500">Last 30 refs</div><div className="text-lg font-bold">{ch.last_30_refs}</div></div>
                <div><div className="text-xs text-gray-500">Payer Tier A %</div><div className="text-lg font-bold">{ch.payer_a_pct}%</div></div>
              </div>
            </section>
          )}

          <section className="mb-4">
            <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Flags</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {s?.decline_flag && <span className="px-2 py-1 rounded bg-red-100 text-red-800 font-semibold">{s.decline_flag.replace(/_/g, " ")}</span>}
              {s?.growth_flag && <span className="px-2 py-1 rounded bg-green-100 text-green-800 font-semibold">{s.growth_flag.replace(/_/g, " ")}</span>}
              {!s?.decline_flag && !s?.growth_flag && <span className="text-gray-500">No flags</span>}
            </div>
          </section>

          {data.lastActivity && (
            <section className="mb-4">
              <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Last Marketer Touch</h2>
              <div className="text-sm">
                {data.lastActivity.activity_date} · {data.lastActivity.activity_type?.replace(/_/g, " ")}
                {data.lastActivity.marketer_name && ` by ${data.lastActivity.marketer_name}`}
              </div>
              {data.lastActivity.outcome && <div className="text-sm text-gray-600 italic">"{data.lastActivity.outcome}"</div>}
            </section>
          )}

          {data.notes.length > 0 && (
            <section className="mb-4">
              <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Recent Notes</h2>
              <ul className="text-sm space-y-1">
                {data.notes.slice(0, 3).map((n: any) => (
                  <li key={n.id} className="border-l-2 border-orange-300 pl-2">
                    {n.note} <span className="text-xs text-gray-500">— {n.author ?? "?"} · {new Date(n.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t pt-3">
            <h2 className="font-bold text-sm uppercase text-gray-500 mb-2">Suggested Next Step</h2>
            <div className="text-sm">
              {s?.decline_flag === "GONE_DARK" && "⚠ Marketer visit this week. Bring outcomes data + address scheduling concerns."}
              {s?.decline_flag === "SHARP_DECLINE" && "Visit within 2 weeks. Learn what changed. Bring progress reports on recent patients."}
              {s?.growth_flag === "RISING_STAR" && "Thank you drop-in within 30 days. Learn what's working to replicate elsewhere."}
              {s?.growth_flag === "NEW_RELATIONSHIP" && "Onboard to monthly touch cadence. Confirm communication preferences."}
              {!s?.decline_flag && !s?.growth_flag && "Quarterly maintenance visit. Send outcome reports promptly."}
            </div>
          </section>

          <footer className="mt-6 pt-3 border-t text-xs text-gray-500 text-center">
            Tristar PT · tristar-referral-intel.vercel.app
          </footer>
        </div>
      </div>
    </div>
  );
}
export default function Page({ params }: { params: { npi: string } }) {
  return <Suspense fallback={null}><Inner npi={params.npi}/></Suspense>;
}
