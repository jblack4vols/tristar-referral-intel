"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

function subDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() - n); return r; }
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

function WeeklyInner() {
  const today = new Date();
  const weekAgo = subDays(today, 7);
  const thirtyAgo = subDays(today, 30);

  const [loading, setLoading] = useState(true);
  const [physicians, setPhysicians] = useState<any[]>([]);
  const [overdueOutcomes, setOverdueOutcomes] = useState<any[]>([]);
  const [churn, setChurn] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const params = {
        curr_start: fmtDate(thirtyAgo), curr_end: fmtDate(today),
        prior_start: fmtDate(subDays(thirtyAgo, 365)), prior_end: fmtDate(subDays(today, 365)),
        source_filter: ["Doctors Office"]
      };
      const [p, o, c] = await Promise.all([
        supabase.rpc("rpc_physician_stats_v3", { ...params, payer_filter: null, clinic_filter: null, specialty_filter: null, therapist_filter: null, npi_filter: null, dx_filter: null, status_filter: null }),
        supabase.rpc("rpc_outcome_overdue_list", { range_start: fmtDate(subDays(today, 30)), range_end: fmtDate(today) }),
        supabase.rpc("rpc_all_churn_scores"),
      ]);
      setPhysicians(p.data ?? []);
      setOverdueOutcomes(o.data ?? []);
      setChurn(c.data ?? []);
      setLoading(false);
    })();
  }, []);

  const goneDark = physicians.filter(p => p.decline_flag === "GONE_DARK" && !p.departed).sort((a, b) => b.evals_prior - a.evals_prior);
  const sharpDecline = physicians.filter(p => p.decline_flag === "SHARP_DECLINE").sort((a, b) => b.evals_prior - a.evals_prior);
  const risingStars = physicians.filter(p => p.growth_flag === "RISING_STAR").sort((a, b) => b.evals_curr - a.evals_curr).slice(0, 10);
  const newRel = physicians.filter(p => p.growth_flag === "NEW_RELATIONSHIP").sort((a, b) => b.evals_curr - a.evals_curr).slice(0, 10);
  const highChurn = churn.filter(c => c.risk_tier === "High").slice(0, 10);

  if (loading) return <div className="p-12 text-center text-gray-500">Building packet…</div>;

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto print:max-w-none print:p-4">
      <div className="mb-3 print:hidden flex items-center justify-between">
        <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        <button onClick={() => window.print()} className="px-3 py-1 rounded text-sm text-white font-semibold" style={{ backgroundColor: ORANGE }}>
          🖨 Print packet
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6 print:shadow-none">
        <header className="border-b-4 pb-3" style={{ borderColor: ORANGE }}>
          <h1 className="text-3xl font-bold" style={{ color: ORANGE }}>Weekly Marketer Packet</h1>
          <div className="text-gray-600 text-sm">Tristar Physical Therapy · Week of {fmtDate(weekAgo)} → {fmtDate(today)}</div>
        </header>

        {/* Critical — Gone Dark */}
        <section>
          <h2 className="font-bold text-lg border-b border-red-300 mb-2" style={{ color: "#CC0000" }}>🔴 CRITICAL — Gone Dark (visit this week)</h2>
          {goneDark.length === 0 ? <div className="text-sm text-gray-500">None this week 🎉</div> : (
            <table className="w-full text-sm">
              <thead className="bg-red-50"><tr>
                <th className="px-2 py-1 text-left">Physician</th>
                <th className="px-2 py-1 text-left">NPI</th>
                <th className="px-2 py-1 text-right">Prior refs</th>
                <th className="px-2 py-1 text-left">Action</th>
              </tr></thead>
              <tbody>
                {goneDark.map(p => (
                  <tr key={p.npi} className="border-b">
                    <td className="px-2 py-1 font-semibold">{p.physician}</td>
                    <td className="px-2 py-1 font-mono text-xs">{p.npi}</td>
                    <td className="px-2 py-1 text-right">{p.evals_prior}</td>
                    <td className="px-2 py-1 text-xs">Phone in 48 hrs · in-person visit within 2 weeks · bring outcomes data</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* High — Sharp Decline */}
        <section>
          <h2 className="font-bold text-lg border-b border-orange-300 mb-2" style={{ color: "#EA580C" }}>🟠 HIGH — Sharp Declines (&gt;50% drop)</h2>
          {sharpDecline.length === 0 ? <div className="text-sm text-gray-500">None this week</div> : (
            <ul className="text-sm space-y-1">
              {sharpDecline.map(p => (
                <li key={p.npi}>
                  <strong>{p.physician}</strong> (NPI {p.npi}) — {p.evals_prior} → {p.evals_curr} evals ({p.yoy_pct}%)
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Watch — Churn */}
        {highChurn.length > 0 && (
          <section>
            <h2 className="font-bold text-lg border-b border-orange-300 mb-2" style={{ color: "#D97706" }}>🔮 Predictive churn — High risk (top 10)</h2>
            <ul className="text-sm space-y-1">
              {highChurn.map(c => (
                <li key={c.npi}>
                  <strong>{c.physician}</strong> — score {c.churn_score} · {c.days_since_last_referral ?? "?"} days since last ref · {c.payer_a_pct}% Tier A payer
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Celebrate — Rising */}
        <section>
          <h2 className="font-bold text-lg border-b border-green-300 mb-2" style={{ color: "#16A34A" }}>🚀 Rising Stars (say thank you)</h2>
          {risingStars.length === 0 ? <div className="text-sm text-gray-500">—</div> : (
            <ul className="text-sm space-y-1">
              {risingStars.map(p => (
                <li key={p.npi}>
                  <strong>{p.physician}</strong> — {p.evals_prior} → {p.evals_curr} evals (+{p.yoy_pct}%)
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-bold text-lg border-b border-green-300 mb-2" style={{ color: "#16A34A" }}>🌱 New Relationships (onboard within 30 days)</h2>
          {newRel.length === 0 ? <div className="text-sm text-gray-500">—</div> : (
            <ul className="text-sm space-y-1">
              {newRel.map(p => (
                <li key={p.npi}>
                  <strong>{p.physician}</strong> — {p.evals_curr} referrals this period · {p.locations ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Outcome loop */}
        <section>
          <h2 className="font-bold text-lg border-b border-gray-300 mb-2">📬 Outcome reports overdue ({overdueOutcomes.length})</h2>
          {overdueOutcomes.length === 0 ? <div className="text-sm text-gray-500">Caught up ✓</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="px-2 py-1 text-left">Discharged</th>
                <th className="px-2 py-1 text-left">Patient</th>
                <th className="px-2 py-1 text-left">Physician</th>
                <th className="px-2 py-1 text-left">Clinic</th>
                <th className="px-2 py-1 text-right">Days</th>
              </tr></thead>
              <tbody>
                {overdueOutcomes.slice(0, 15).map(c => (
                  <tr key={c.case_id} className="border-b">
                    <td className="px-2 py-1 text-xs">{c.discharge_date}</td>
                    <td className="px-2 py-1">{c.patient_name ?? "—"}</td>
                    <td className="px-2 py-1 text-xs">{c.referring_doctor_name ?? "—"}</td>
                    <td className="px-2 py-1 text-xs">{c.case_facility?.replace("Tristar PT - ", "")}</td>
                    <td className="px-2 py-1 text-right font-bold text-red-700">{c.days_since_discharge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="text-xs text-gray-500 border-t pt-3 print:break-before-avoid">
          Generated from Tristar Referral Intel · Updated live from Prompt EMR · Filter Caldwell + Grimaldi auto-excluded
        </footer>
      </div>
    </div>
  );
}

export default function WeeklyPage() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}><WeeklyInner /></Suspense>;
}
