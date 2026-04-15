"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/lib/export";

const ORANGE = "#FF8200";
const KINDS = [
  { v: "npi", l: "Missing NPI (physician referrals)", key: "cases_missing_npi", pct: "pct_missing_npi" },
  { v: "payer", l: "Missing payer", key: "cases_missing_payer", pct: "pct_missing_payer" },
  { v: "dx", l: "Missing diagnosis category", key: "cases_missing_dx", pct: "pct_missing_dx" },
  { v: "therapist", l: "Missing therapist", key: "cases_missing_therapist", pct: "pct_missing_therapist" },
  { v: "discharge_reason", l: "Discharged but no reason", key: "discharged_missing_reason", pct: "pct_discharged_missing_reason" },
];

function Inner() {
  const [summary, setSummary] = useState<any>(null);
  const [examples, setExamples] = useState<Record<string, any[]>>({});
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("rpc_data_quality_summary").then(({ data }) => setSummary(data?.[0] ?? null));
  }, []);

  const loadExamples = async (kind: string) => {
    if (examples[kind]) { setActive(kind); return; }
    const { data } = await supabase.rpc("rpc_data_quality_examples", { p_kind: kind, row_limit: 50 });
    setExamples({ ...examples, [kind]: data ?? [] });
    setActive(kind);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3"><Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link></div>
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Data Quality</h1>
          <div className="text-gray-300 text-sm">Fix these upstream in Prompt EMR — every blank costs analytical precision.</div>
        </header>
        <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-4">
          {summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {KINDS.map(k => {
                  const count = Number(summary[k.key] || 0);
                  const pct = Number(summary[k.pct] || 0);
                  return (
                    <button key={k.v} onClick={() => loadExamples(k.v)}
                      className="text-left border-l-4 bg-white rounded p-3 hover:shadow"
                      style={{ borderColor: pct > 20 ? "#CC0000" : pct > 5 ? ORANGE : "#16A34A" }}>
                      <div className="text-xs uppercase text-gray-500">{k.l}</div>
                      <div className="text-2xl font-bold">{count.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">{pct}% of relevant cases</div>
                    </button>
                  );
                })}
                <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: Number(summary.pct_visits_unlinked) > 5 ? "#CC0000" : "#16A34A" }}>
                  <div className="text-xs uppercase text-gray-500">Visits without physician link</div>
                  <div className="text-2xl font-bold">{Number(summary.visits_unlinked_to_physician).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{summary.pct_visits_unlinked}% of visits</div>
                </div>
              </div>

              {active && examples[active] && (
                <div className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold" style={{ color: ORANGE }}>Examples — {KINDS.find(k => k.v === active)?.l} (first 50)</h3>
                    <button onClick={() => downloadCsv(examples[active], `dq-${active}`)}
                      className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">📥 CSV</button>
                  </div>
                  <div className="overflow-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0"><tr>
                        <th className="px-2 py-1 text-left">Account #</th>
                        <th className="px-2 py-1 text-left">Patient</th>
                        <th className="px-2 py-1 text-left">Clinic</th>
                        <th className="px-2 py-1 text-left">Created</th>
                        <th className="px-2 py-1 text-left">Missing</th>
                      </tr></thead>
                      <tbody>
                        {examples[active].map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                            <td className="px-2 py-1 font-mono text-xs">{r.patient_account_number}</td>
                            <td className="px-2 py-1">{r.patient_name ?? "—"}</td>
                            <td className="px-2 py-1 text-xs">{r.case_facility?.replace("Tristar PT - ", "")}</td>
                            <td className="px-2 py-1 text-xs">{r.created_date}</td>
                            <td className="px-2 py-1 text-xs">{r.missing}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={null}><Inner/></Suspense>; }
