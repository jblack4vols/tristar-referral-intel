"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";
const RED = "#CC0000";

function Inner() {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [byPayer, setByPayer] = useState<any[]>([]);
  const [topClaims, setTopClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.rpc("rpc_ar_aging_buckets"),
      supabase.rpc("rpc_ar_aging_by_payer"),
      supabase.rpc("rpc_top_hanging_claims", { row_limit: 100 }),
    ]).then(([b, p, c]) => {
      setBuckets(b.data ?? []);
      setByPayer(p.data ?? []);
      setTopClaims(c.data ?? []);
      setLoading(false);
    });
  }, []);

  const totalAtRisk = buckets.reduce((s, b) => s + Number(b.total_at_risk || 0), 0);
  const over90 = buckets.filter(b => ["91-120", "120+"].includes(b.bucket)).reduce((s, b) => s + Number(b.total_at_risk || 0), 0);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3"><Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link></div>
        <header className="bg-black rounded-t-lg px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-white text-2xl font-bold">AR Aging & Hanging Claims</h1>
            <div className="text-gray-300 text-sm">Dollars outstanding — what's billed but not yet collected.</div>
          </div>
          <div className="text-right text-white">
            <div className="text-2xl font-bold">{fmtCurrency(totalAtRisk)}</div>
            <div className="text-sm text-yellow-300">Total at risk · {fmtCurrency(over90)} over 90 days</div>
          </div>
        </header>

        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}
        {!loading && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-6">
            <div>
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Aging buckets</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {buckets.map((b: any) => (
                  <div key={b.bucket} className="border-l-4 bg-white rounded p-3" style={{ borderColor: ["91-120", "120+"].includes(b.bucket) ? RED : ORANGE }}>
                    <div className="text-xs uppercase text-gray-500">{b.bucket} days</div>
                    <div className="text-xl font-bold">{fmtCurrency(Number(b.total_at_risk))}</div>
                    <div className="text-xs text-gray-500">{Number(b.claims).toLocaleString()} claims</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold" style={{ color: ORANGE }}>By payer</h3>
                <button onClick={() => downloadCsv(byPayer, "ar-aging-by-payer")}
                  className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
              </div>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Payer</th>
                      <th className="px-3 py-2 text-right">Claims</th>
                      <th className="px-3 py-2 text-right">Hanging</th>
                      <th className="px-3 py-2 text-right">Not Posted</th>
                      <th className="px-3 py-2 text-right">Total at risk</th>
                      <th className="px-3 py-2 text-right">Avg days out</th>
                      <th className="px-3 py-2 text-right">% over 90</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPayer.map((r: any, i: number) => (
                      <tr key={r.payer} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1">{r.payer}</td>
                        <td className="px-3 py-1 text-right">{Number(r.claims).toLocaleString()}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(r.hanging))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(r.insurance_not_posted))}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCurrency(Number(r.total_at_risk))}</td>
                        <td className="px-3 py-1 text-right">{r.avg_days_out}</td>
                        <td className="px-3 py-1 text-right" style={r.pct_over_90 > 25 ? { color: RED, fontWeight: "bold" } : {}}>{r.pct_over_90}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold" style={{ color: ORANGE }}>Top hanging claims (largest outstanding)</h3>
                <button onClick={() => downloadCsv(topClaims, "top-hanging-claims")}
                  className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
              </div>
              <div className="overflow-auto border rounded max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">Claim #</th>
                      <th className="px-2 py-2 text-left">Patient</th>
                      <th className="px-2 py-2 text-left">DOS</th>
                      <th className="px-2 py-2 text-right">Days out</th>
                      <th className="px-2 py-2 text-left">Payer</th>
                      <th className="px-2 py-2 text-right">Billed</th>
                      <th className="px-2 py-2 text-right">Hanging</th>
                      <th className="px-2 py-2 text-right">Not posted</th>
                      <th className="px-2 py-2 text-left">Last action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClaims.map((c: any, i: number) => (
                      <tr key={c.prompt_claim_number} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-2 py-1 font-mono text-xs">{c.prompt_claim_number}</td>
                        <td className="px-2 py-1 text-xs">{c.patient_name}</td>
                        <td className="px-2 py-1 text-xs">{c.dos}</td>
                        <td className="px-2 py-1 text-right" style={c.days_out > 90 ? { color: RED, fontWeight: "bold" } : {}}>{c.days_out}</td>
                        <td className="px-2 py-1 text-xs">{c.primary_insurance_type}</td>
                        <td className="px-2 py-1 text-right">{fmtCurrency(Number(c.last_billed))}</td>
                        <td className="px-2 py-1 text-right font-semibold">{fmtCurrency(Number(c.hanging))}</td>
                        <td className="px-2 py-1 text-right">{fmtCurrency(Number(c.insurance_not_posted))}</td>
                        <td className="px-2 py-1 text-xs">{c.last_action ?? "—"}</td>
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
