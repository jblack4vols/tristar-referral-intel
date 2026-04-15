"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

function Inner() {
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear() - 1}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [waterfall, setWaterfall] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.rpc("rpc_payer_contract_scorecard", { range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_revenue_waterfall_by_payer", { range_start: rangeStart, range_end: rangeEnd }),
    ]).then(([s, w]) => {
      setRows(s.data ?? []);
      setWaterfall(w.data ?? []);
      setLoading(false);
    });
  }, [rangeStart, rangeEnd]);

  const flagColor = (f: string) => {
    if (f?.includes("⭐")) return "#16A34A";
    if (f?.includes("⚠")) return "#CC0000";
    return "#666";
  };

  const totalBilled = waterfall.reduce((s, r) => s + Number(r.billed || 0), 0);
  const totalAdj = waterfall.reduce((s, r) => s + Number(r.contractual_adjustment || 0), 0);
  const totalPaid = waterfall.reduce((s, r) => s + Number(r.total_paid || 0), 0);
  const totalHanging = waterfall.reduce((s, r) => s + Number(r.hanging || 0), 0);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3"><Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link></div>
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Payer Contract Scorecard</h1>
          <div className="text-gray-300 text-sm">Real collection metrics per payer. Flags underperforming contracts and renegotiation candidates.</div>
        </header>

        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <button onClick={() => downloadCsv(rows, `payer-scorecard-${rangeStart}-${rangeEnd}`)}
            className="ml-auto px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
        </div>

        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}
        {!loading && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-6">

            {/* Waterfall: where the money goes */}
            <div>
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>💧 Revenue leakage waterfall</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <Stat label="Billed" value={fmtCurrency(totalBilled)} />
                <Stat label="Contractual adjustments" value={fmtCurrency(totalAdj)} color="#CC0000" />
                <Stat label="Total paid" value={fmtCurrency(totalPaid)} color="#16A34A" />
                <Stat label="Still hanging" value={fmtCurrency(totalHanging)} color="#EA580C" />
              </div>
              <div className="text-xs text-gray-600 italic mb-2">
                Practice-wide net-kept: <strong>{totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) : 0}%</strong> of billed.
                Contractual adjustments are what payers write down vs what you billed — your first leak.
              </div>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Payer</th>
                      <th className="px-3 py-2 text-right">Billed</th>
                      <th className="px-3 py-2 text-right">Adjusted down</th>
                      <th className="px-3 py-2 text-right">Ins paid</th>
                      <th className="px-3 py-2 text-right">Pt paid</th>
                      <th className="px-3 py-2 text-right">Total paid</th>
                      <th className="px-3 py-2 text-right">Hanging</th>
                      <th className="px-3 py-2 text-right">Net-kept %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waterfall.map((w: any, i: number) => (
                      <tr key={w.payer} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1">{w.payer}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(w.billed))}</td>
                        <td className="px-3 py-1 text-right text-red-700">−{fmtCurrency(Number(w.contractual_adjustment))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(w.insurance_paid))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(w.patient_paid))}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCurrency(Number(w.total_paid))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(w.hanging))}</td>
                        <td className="px-3 py-1 text-right">{w.net_kept_pct ?? "—"}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Contract scorecard */}
            <div>
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>🎯 Contract scorecard — per-payer health</h3>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Payer</th>
                      <th className="px-3 py-2 text-left">Tier</th>
                      <th className="px-3 py-2 text-right">Visits</th>
                      <th className="px-3 py-2 text-right">RPV</th>
                      <th className="px-3 py-2 text-right">Collections</th>
                      <th className="px-3 py-2 text-right">Avg days to pay</th>
                      <th className="px-3 py-2 text-right">Denial %</th>
                      <th className="px-3 py-2 text-right">Hanging %</th>
                      <th className="px-3 py-2 text-right">vs avg</th>
                      <th className="px-3 py-2 text-left">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any, i: number) => (
                      <tr key={r.payer} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1">{r.payer}</td>
                        <td className="px-3 py-1 text-xs">{r.tier}</td>
                        <td className="px-3 py-1 text-right">{Number(r.visits).toLocaleString()}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCurrency(Number(r.rpv), 2)}</td>
                        <td className="px-3 py-1 text-right">{(Number(r.collections_ratio) * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1 text-right">{r.avg_days_to_payment ?? "—"}</td>
                        <td className="px-3 py-1 text-right" style={Number(r.denial_rate) > 10 ? { color: "#CC0000" } : {}}>{r.denial_rate}%</td>
                        <td className="px-3 py-1 text-right">{r.hanging_pct}%</td>
                        <td className="px-3 py-1 text-right" style={{ color: Number(r.vs_practice_avg) < 0 ? "#CC0000" : "#16A34A", fontWeight: "bold" }}>
                          {Number(r.vs_practice_avg) >= 0 ? "+" : ""}{r.vs_practice_avg}%
                        </td>
                        <td className="px-3 py-1 text-xs font-semibold" style={{ color: flagColor(r.flag) }}>{r.flag}</td>
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
export default function Page() { return <Suspense fallback={null}><Inner/></Suspense>; }

function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
