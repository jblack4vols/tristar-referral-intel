"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv, fmtCurrency, fmtCurrencyCompact } from "@/lib/export";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const ORANGE = "#FF8200";

function RevenueInner() {
  const [rangeStart, setRangeStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [byPayer, setByPayer] = useState<any[]>([]);
  const [byFacility, setByFacility] = useState<any[]>([]);
  const [byReferrer, setByReferrer] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [referrerFilter, setReferrerFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.rpc("rpc_payer_rpv", { range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_revenue_by_facility", { range_start: rangeStart, range_end: rangeEnd }),
      supabase.rpc("rpc_revenue_by_referring_provider", { range_start: rangeStart, range_end: rangeEnd }),
    ]).then(([p, f, r]) => {
      setByPayer(p.data ?? []);
      setByFacility(f.data ?? []);
      setByReferrer(r.data ?? []);
      setLoading(false);
    });
  }, [rangeStart, rangeEnd]);

  const totalPayer = byPayer.reduce((s, r) => ({
    visits: s.visits + Number(r.total_visits),
    paid: s.paid + Number(r.total_paid),
    billed: s.billed + Number(r.total_billed),
  }), { visits: 0, paid: 0, billed: 0 });
  const blendedRpv = totalPayer.visits ? totalPayer.paid / totalPayer.visits : 0;
  const blendedCollections = totalPayer.billed ? totalPayer.paid / totalPayer.billed : 0;

  const referrerVisible = byReferrer.filter(r => !referrerFilter || (r.referring_provider ?? "").toLowerCase().includes(referrerFilter.toLowerCase()));

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Revenue Analytics (from Revenue Reports)</h1>
          <div className="text-gray-300 text-sm">Real dollars paid per visit. Loaded from Prompt EMR's Revenue Report — no estimates.</div>
        </header>

        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-700">DOS range:</span>
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
        </div>

        {loading && <div className="bg-white rounded-b-lg p-12 text-center text-gray-500">Loading…</div>}

        {!loading && (
          <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total visits" value={totalPayer.visits.toLocaleString()} />
              <Stat label="Total paid" value={fmtCurrency(totalPayer.paid)} color="#16A34A" />
              <Stat label="Blended RPV" value={fmtCurrency(blendedRpv, 2)} color={ORANGE} />
              <Stat label="Collections ratio" value={`${(blendedCollections * 100).toFixed(1)}%`} />
            </div>

            {/* By payer */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold" style={{ color: ORANGE }}>Revenue per visit by payer</h3>
                <button onClick={() => downloadCsv(byPayer, `rpv-by-payer-${rangeStart}-${rangeEnd}`)}
                  className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
              </div>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Payer</th>
                      <th className="px-3 py-2 text-right">Visits</th>
                      <th className="px-3 py-2 text-right">Billed</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Revenue / Visit</th>
                      <th className="px-3 py-2 text-right">Collections %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPayer.map((p, i) => (
                      <tr key={p.primary_insurance_type} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1">{p.primary_insurance_type}</td>
                        <td className="px-3 py-1 text-right">{Number(p.total_visits).toLocaleString()}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(p.total_billed))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(p.total_paid))}</td>
                        <td className="px-3 py-1 text-right font-semibold" style={{ color: Number(p.rpv) > blendedRpv ? "#16A34A" : "#CC0000" }}>
                          {fmtCurrency(Number(p.rpv), 2)}
                        </td>
                        <td className="px-3 py-1 text-right">{(Number(p.collections_ratio) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border rounded p-3">
              <h3 className="font-bold mb-2" style={{ color: ORANGE }}>RPV by payer (visual)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={byPayer.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="primary_insurance_type" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(v: any) => [fmtCurrency(Number(v), 2), "RPV"]} />
                  <Bar dataKey="rpv" fill={ORANGE} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* By facility */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold" style={{ color: ORANGE }}>Revenue by location</h3>
                <button onClick={() => downloadCsv(byFacility, `revenue-by-location-${rangeStart}-${rangeEnd}`)}
                  className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
              </div>
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Location</th>
                      <th className="px-3 py-2 text-right">Visits</th>
                      <th className="px-3 py-2 text-right">Billed</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">RPV</th>
                      <th className="px-3 py-2 text-right">Collections %</th>
                      <th className="px-3 py-2 text-right">Avg days to pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byFacility.map((f, i) => (
                      <tr key={f.visit_facility} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1 font-semibold">{f.visit_facility?.replace("Tristar PT - ", "")}</td>
                        <td className="px-3 py-1 text-right">{Number(f.total_visits).toLocaleString()}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(f.total_billed))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(f.total_paid))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(f.rpv), 2)}</td>
                        <td className="px-3 py-1 text-right">{(Number(f.collections_ratio) * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1 text-right">{f.avg_days_to_payment ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By referring provider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold" style={{ color: ORANGE }}>Revenue by referring provider (from Revenue Report — last name match)</h3>
                <div className="flex items-center gap-2">
                  <input placeholder="Search referrer…" value={referrerFilter} onChange={e => setReferrerFilter(e.target.value)}
                    className="border rounded px-2 py-1 text-xs" />
                  <button onClick={() => downloadCsv(referrerVisible, `revenue-by-referrer-${rangeStart}-${rangeEnd}`)}
                    className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
                </div>
              </div>
              <div className="overflow-auto border rounded max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Provider</th>
                      <th className="px-3 py-2 text-right">Unique patients</th>
                      <th className="px-3 py-2 text-right">Visits</th>
                      <th className="px-3 py-2 text-right">Total paid</th>
                      <th className="px-3 py-2 text-right">RPV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrerVisible.slice(0, 200).map((r, i) => (
                      <tr key={r.referring_provider + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                        <td className="px-3 py-1">{r.referring_provider}</td>
                        <td className="px-3 py-1 text-right">{r.unique_patients}</td>
                        <td className="px-3 py-1 text-right">{Number(r.total_visits).toLocaleString()}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCurrency(Number(r.total_paid))}</td>
                        <td className="px-3 py-1 text-right">{fmtCurrency(Number(r.rpv), 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {referrerVisible.length > 200 && <div className="text-xs text-center text-gray-500 py-2">Showing first 200 of {referrerVisible.length}</div>}
              </div>
              <div className="text-xs text-gray-500 mt-2 italic">
                Revenue Report identifies referring provider by last name only — no NPI. Match to physician detail pages manually by name.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RevenuePage() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}><RevenueInner /></Suspense>;
}

function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
