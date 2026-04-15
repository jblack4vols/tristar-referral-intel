"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtCurrency } from "@/lib/export";

const ORANGE = "#FF8200";

const METRICS = [
  { v: "total_cases", l: "Total cases created" },
  { v: "doc_referrals", l: "Physician referrals (with NPI)" },
  { v: "unique_physicians", l: "Unique referring physicians" },
  { v: "visits", l: "Arrived visits" },
  { v: "revenue", l: "Revenue (paid dollars)" },
  { v: "arrival_rate", l: "Arrival rate (%)" },
  { v: "zero_visit_pct", l: "Zero-visit rate (% — lower is better)" },
];
const PERIODS = [{ v: "month", l: "This month" }, { v: "quarter", l: "This quarter" }, { v: "year", l: "This year" }];

function Inner() {
  const [goals, setGoals] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ name: "", metric: "doc_referrals", target: 0, period: "month", location_filter: "" });

  const load = async () => {
    const { data: g } = await supabase.from("kpi_goals").select("*").eq("active", true).order("created_at", { ascending: false });
    setGoals(g ?? []);
    if (g) {
      const pr: Record<string, any> = {};
      for (const goal of g) {
        const { data } = await supabase.rpc("rpc_goal_progress", { p_goal_id: goal.id });
        if (data?.[0]) pr[goal.id] = data[0];
      }
      setProgress(pr);
    }
  };

  useEffect(() => {
    load();
    supabase.from("locations").select("full_name, short_name").then(({ data }) => setLocations(data ?? []));
  }, []);

  const save = async () => {
    if (!form.name || !form.target) { alert("Name + target required"); return; }
    const payload = {
      name: form.name, metric: form.metric, target: Number(form.target),
      period: form.period, location_filter: form.location_filter || null,
    };
    const { error } = await supabase.from("kpi_goals").insert(payload);
    if (error) { alert(error.message); return; }
    setForm({ name: "", metric: "doc_referrals", target: 0, period: "month", location_filter: "" });
    setShowForm(false); load();
  };
  const remove = async (id: string) => {
    if (!confirm("Deactivate this goal?")) return;
    await supabase.from("kpi_goals").update({ active: false }).eq("id", id);
    load();
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3"><Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link></div>
        <header className="bg-black rounded-t-lg px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-white text-2xl font-bold">Goals & KPI Tracking</h1>
            <div className="text-gray-300 text-sm">Set monthly / quarterly / yearly targets. Track progress and pace in real time.</div>
          </div>
          <button onClick={() => setShowForm(s => !s)} className="px-3 py-2 text-sm font-semibold rounded text-white" style={{ backgroundColor: ORANGE }}>
            {showForm ? "Cancel" : "+ New goal"}
          </button>
        </header>

        <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-4">
          {showForm && (
            <div className="bg-orange-50 border border-orange-200 rounded p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600">Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Q2 physician referrals target" className="border rounded px-2 py-1 text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Metric</label>
                  <select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })} className="border rounded px-2 py-1 text-sm w-full">
                    {METRICS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Target</label>
                  <input type="number" step="any" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Period</label>
                  <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} className="border rounded px-2 py-1 text-sm w-full">
                    {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-600">Location filter (optional)</label>
                  <select value={form.location_filter} onChange={e => setForm({ ...form, location_filter: e.target.value })} className="border rounded px-2 py-1 text-sm w-full">
                    <option value="">— All locations —</option>
                    {locations.map((l: any) => <option key={l.full_name} value={l.full_name}>{l.short_name}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={save} className="px-4 py-2 text-sm text-white rounded font-semibold" style={{ backgroundColor: ORANGE }}>Create goal</button>
            </div>
          )}

          {goals.length === 0 && !showForm && (
            <div className="border-2 border-dashed rounded p-8 text-center text-gray-600">
              No goals set yet. Click <strong>+ New goal</strong> to start tracking a target.
            </div>
          )}

          {goals.map(g => {
            const p = progress[g.id];
            const pct = p?.progress_pct ? Math.min(150, Number(p.progress_pct)) : 0;
            const onPace = p?.on_pace;
            const isRate = g.metric.includes("pct") || g.metric.includes("rate");
            const isCurrency = g.metric === "revenue";
            const fmtVal = (v: any) => isCurrency ? fmtCurrency(Number(v || 0)) : isRate ? `${Number(v || 0).toFixed(1)}%` : Number(v || 0).toLocaleString();

            return (
              <div key={g.id} className="border rounded p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold">{g.name}</div>
                    <div className="text-xs text-gray-500">
                      {METRICS.find(m => m.v === g.metric)?.l} · {g.period} · {g.location_filter ? g.location_filter.replace("Tristar PT - ", "") : "All locations"}
                      {p && <> · {p.period_start} → {p.period_end}</>}
                    </div>
                  </div>
                  <button onClick={() => remove(g.id)} className="text-xs text-red-600">×</button>
                </div>
                {p ? (
                  <>
                    <div className="flex items-baseline gap-3 mb-1">
                      <div className="text-2xl font-bold">{fmtVal(p.actual)}</div>
                      <div className="text-sm text-gray-500">of {fmtVal(g.target)} target</div>
                      <div className="ml-auto text-sm font-semibold" style={{ color: onPace ? "#16A34A" : "#CC0000" }}>
                        {pct.toFixed(0)}% · {onPace ? "✓ on pace" : "⚠ behind pace"}
                      </div>
                    </div>
                    <div className="bg-gray-200 h-3 rounded overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: onPace ? "#16A34A" : ORANGE }} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{p.days_remaining} days remaining in period</div>
                  </>
                ) : <div className="text-sm text-gray-400">Computing…</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={null}><Inner/></Suspense>; }
