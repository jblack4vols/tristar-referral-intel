"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtCurrency, fmtCurrencyCompact } from "@/lib/export";

const ORANGE = "#FF8200";

type Contract = {
  id: string;
  physician_npi: string;
  monthly_amount: number;
  locations_covered: string[];
  affiliated_npis: string[];
  contract_start: string | null;
  contract_end: string | null;
  notes: string | null;
  active: boolean;
};

type RoiResult = {
  physician_npi: string;
  director_name: string;
  monthly_amount: number;
  locations_covered: string[];
  affiliated_npis: string[];
  months_in_range: number;
  total_fee_in_range: number;
  total_cases: number;
  total_visits: number;
  gross_revenue: number;
  variable_cost: number;
  gross_margin: number;
  net_vs_fee: number;
  break_even_visits_per_month: number;
  break_even_visits_per_quarter: number;
  break_even_visits_per_year: number;
  actual_visits_per_month: number;
  visits_vs_breakeven: number;
  verdict: string;
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const startOfYearStr = () => `${new Date().getFullYear()}-01-01`;
const todayStr = () => fmtDate(new Date());
const addYears = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setFullYear(d.getFullYear() + n); return fmtDate(d); };
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return fmtDate(d); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);

type CompareMode = "yoy" | "sequential" | "none";

function MedicalDirectorPageInner() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analysis params
  const [rangeStart, setRangeStart] = useState(startOfYearStr());
  const [rangeEnd, setRangeEnd] = useState(todayStr());
  const [compareMode, setCompareMode] = useState<CompareMode>("yoy");
  const [rpv, setRpv] = useState(95);
  const [cpv, setCpv] = useState(92);
  const [roi, setRoi] = useState<RoiResult | null>(null);
  const [priorRoi, setPriorRoi] = useState<RoiResult | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Partial<Contract> & { id?: string } | null>(null);
  const [allLocations, setAllLocations] = useState<{ full_name: string; short_name: string }[]>([]);
  const [physSearch, setPhysSearch] = useState("");
  const [physResults, setPhysResults] = useState<any[]>([]);

  const loadContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("medical_director_contracts").select("*").eq("active", true).order("created_at", { ascending: false });
    if (error) { setError(error.message); setLoading(false); return; }
    setContracts(data ?? []);
    if (data && data.length > 0 && !activeId) setActiveId(data[0].id);
    setLoading(false);
  };

  useEffect(() => { loadContracts(); }, []);

  useEffect(() => {
    supabase.from("locations").select("full_name, short_name").then(({ data }) => {
      if (data) setAllLocations(data);
    });
  }, []);

  // Compute prior period from current + mode
  const getPriorRange = (): { start: string; end: string } | null => {
    if (compareMode === "none") return null;
    if (compareMode === "yoy") {
      return { start: addYears(rangeStart, -1), end: addYears(rangeEnd, -1) };
    }
    // sequential: same-length window immediately before
    const len = daysBetween(rangeStart, rangeEnd);
    const priorEnd = addDays(rangeStart, -1);
    const priorStart = addDays(priorEnd, -len);
    return { start: priorStart, end: priorEnd };
  };

  useEffect(() => {
    if (!activeId) { setRoi(null); setPriorRoi(null); return; }
    setRoiLoading(true);
    const prior = getPriorRange();
    const calls = [
      supabase.rpc("rpc_medical_director_roi", { p_contract_id: activeId, range_start: rangeStart, range_end: rangeEnd, rpv, cpv }),
    ];
    if (prior) {
      calls.push(
        supabase.rpc("rpc_medical_director_roi", { p_contract_id: activeId, range_start: prior.start, range_end: prior.end, rpv, cpv })
      );
    }
    Promise.all(calls).then(results => {
      const first = results[0];
      if (first.error) { setError(first.error.message); setRoiLoading(false); return; }
      setRoi(first.data?.[0] ?? null);
      if (prior && results[1]) {
        setPriorRoi(results[1].data?.[0] ?? null);
      } else {
        setPriorRoi(null);
      }
      setRoiLoading(false);
    });
  }, [activeId, rangeStart, rangeEnd, compareMode, rpv, cpv]);

  useEffect(() => {
    if (!physSearch || physSearch.length < 2) { setPhysResults([]); return; }
    const t = setTimeout(() => {
      supabase.from("physicians").select("npi, name, specialty, city, state")
        .or(`name.ilike.%${physSearch}%,npi.like.%${physSearch}%`)
        .limit(20).then(({ data }) => setPhysResults(data ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [physSearch]);

  const openEditor = (c?: Contract) => {
    setEditing(c ? { ...c } : { monthly_amount: 0, locations_covered: [], affiliated_npis: [], active: true });
    setShowEditor(true);
    setPhysSearch("");
    setPhysResults([]);
  };

  const saveContract = async () => {
    if (!editing?.physician_npi) { alert("Pick a physician"); return; }
    const payload: any = {
      physician_npi: editing.physician_npi,
      monthly_amount: editing.monthly_amount ?? 0,
      locations_covered: editing.locations_covered ?? [],
      affiliated_npis: editing.affiliated_npis ?? [],
      contract_start: editing.contract_start || null,
      contract_end: editing.contract_end || null,
      notes: editing.notes || null,
      active: true,
    };
    let err;
    if (editing.id) {
      const { error } = await supabase.from("medical_director_contracts").update(payload).eq("id", editing.id);
      err = error;
    } else {
      const { error, data } = await supabase.from("medical_director_contracts").insert(payload).select("id");
      err = error;
      if (data?.[0]) setActiveId(data[0].id);
    }
    if (err) { alert("Save failed: " + err.message); return; }
    setShowEditor(false); setEditing(null);
    loadContracts();
  };

  const deactivateContract = async (id: string) => {
    if (!confirm("Deactivate this contract?")) return;
    await supabase.from("medical_director_contracts").update({ active: false }).eq("id", id);
    loadContracts();
  };

  const toggleLocation = (loc: string) => {
    if (!editing) return;
    const cur = editing.locations_covered ?? [];
    const next = cur.includes(loc) ? cur.filter(l => l !== loc) : [...cur, loc];
    setEditing({ ...editing, locations_covered: next });
  };

  const addAffiliatedNpi = (npi: string, name: string) => {
    if (!editing) return;
    const cur = editing.affiliated_npis ?? [];
    if (cur.includes(npi)) return;
    setEditing({ ...editing, affiliated_npis: [...cur, npi] });
  };

  const removeAffiliatedNpi = (npi: string) => {
    if (!editing) return;
    setEditing({ ...editing, affiliated_npis: (editing.affiliated_npis ?? []).filter(n => n !== npi) });
  };

  const priorRange = getPriorRange();

  const deltaPct = (curr: number, prior: number) => {
    if (!prior || prior === 0) return curr > 0 ? "NEW" : "—";
    const p = ((curr - prior) / Math.abs(prior)) * 100;
    return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
  };
  const deltaColor = (curr: number, prior: number) => {
    if (!prior) return "#666";
    return curr >= prior ? "#16A34A" : "#CC0000";
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Medical Director ROI Calculator</h1>
            <div className="text-gray-300 text-sm">Is what you're paying returning its cost in referral-driven margin?</div>
          </div>
          <button onClick={() => openEditor()} className="px-3 py-2 text-sm font-semibold rounded text-white" style={{ backgroundColor: ORANGE }}>
            + New contract
          </button>
        </header>

        <div className="bg-white rounded-b-lg shadow-lg p-4 space-y-4">
          {loading && <div className="text-gray-500 text-center py-8">Loading…</div>}
          {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">Error: {error}</div>}

          {!loading && contracts.length === 0 && (
            <div className="border-2 border-dashed border-gray-300 rounded p-8 text-center">
              <div className="text-gray-700 mb-3">No medical director contracts configured yet.</div>
              <button onClick={() => openEditor()} className="px-4 py-2 text-sm font-semibold rounded text-white" style={{ backgroundColor: ORANGE }}>
                Set up your first contract
              </button>
            </div>
          )}

          {contracts.length > 0 && (
            <>
              {/* Contract picker */}
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <span className="font-semibold text-sm">Contract:</span>
                {contracts.map(c => (
                  <button key={c.id} onClick={() => setActiveId(c.id)}
                    className={"px-3 py-1 rounded text-xs " + (c.id === activeId ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
                    style={c.id === activeId ? { backgroundColor: ORANGE } : {}}>
                    {c.physician_npi}
                  </button>
                ))}
              </div>

              {/* Analysis parameters — date range, comparison mode, RPV, CPV */}
              <div className="bg-orange-50 border-2 border-orange-200 rounded p-4">
                <div className="text-sm font-bold mb-3 text-gray-700">⚙ Analysis inputs — edit any of these to see the ROI update live</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Current date range</label>
                    <div className="flex items-center gap-1">
                      <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                      <span className="text-gray-400">→</span>
                      <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Compare against</label>
                    <div className="flex gap-1">
                      <button onClick={() => setCompareMode("yoy")}
                        className={"px-3 py-1 rounded text-xs " + (compareMode === "yoy" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
                        style={compareMode === "yoy" ? { backgroundColor: ORANGE } : {}}>
                        Same window, prior year
                      </button>
                      <button onClick={() => setCompareMode("sequential")}
                        className={"px-3 py-1 rounded text-xs " + (compareMode === "sequential" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
                        style={compareMode === "sequential" ? { backgroundColor: ORANGE } : {}}>
                        Preceding window (seq.)
                      </button>
                      <button onClick={() => setCompareMode("none")}
                        className={"px-3 py-1 rounded text-xs " + (compareMode === "none" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
                        style={compareMode === "none" ? { backgroundColor: ORANGE } : {}}>
                        No comparison
                      </button>
                    </div>
                    {priorRange && (
                      <div className="text-xs text-gray-600 mt-1">Prior: {priorRange.start} → {priorRange.end}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Revenue per visit ($) — editable</label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={rpv} onChange={e => setRpv(parseFloat(e.target.value) || 0)}
                        className="border-2 border-orange-300 rounded px-3 py-1.5 text-lg font-bold w-32 focus:outline-none focus:border-orange-500" />
                      <span className="text-xs text-gray-500">default: $95 · blended avg across payers</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Cost per visit ($) — editable</label>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={cpv} onChange={e => setCpv(parseFloat(e.target.value) || 0)}
                        className="border-2 border-orange-300 rounded px-3 py-1.5 text-lg font-bold w-32 focus:outline-none focus:border-orange-500" />
                      <span className="text-xs text-gray-500">default: $92 · matches your labor-cost target</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-orange-200 text-sm">
                  Margin per visit = RPV − CPV = <strong>{fmtCurrency(rpv - cpv, 2)}</strong>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => { const c = contracts.find(x => x.id === activeId); if (c) openEditor(c); }}
                    className="px-3 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">Edit contract</button>
                  {activeId && (
                    <button onClick={() => deactivateContract(activeId)} className="px-3 py-1 text-xs rounded bg-red-100 hover:bg-red-200 text-red-800">Deactivate</button>
                  )}
                </div>
              </div>

              {roiLoading && <div className="text-center text-sm text-gray-500 py-4">Computing…</div>}

              {roi && !roiLoading && (
                <div className="space-y-4">
                  {/* Contract details */}
                  <div className="border rounded p-3 bg-gray-50">
                    <h3 className="font-bold" style={{ color: ORANGE }}>{roi.director_name} (NPI {roi.physician_npi})</h3>
                    <div className="text-sm grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                      <div><span className="text-gray-500">Monthly fee:</span> <strong>{fmtCurrency(roi.monthly_amount)}</strong></div>
                      <div><span className="text-gray-500">Locations covered:</span> <strong>{roi.locations_covered.length || "All"}</strong></div>
                      <div><span className="text-gray-500">Affiliated NPIs:</span> <strong>{roi.affiliated_npis.length}</strong></div>
                      <div><span className="text-gray-500">Window:</span> {rangeStart} → {rangeEnd} ({roi.months_in_range} mo)</div>
                      <div><span className="text-gray-500">Total fee in window:</span> <strong>{fmtCurrency(roi.total_fee_in_range)}</strong></div>
                    </div>
                  </div>

                  {/* Verdict banner */}
                  <div className="rounded p-4 text-center" style={{ backgroundColor: roi.net_vs_fee > 0 ? "#D1FAE5" : roi.net_vs_fee > (roi.total_fee_in_range * -0.25) ? "#FEF3C7" : "#FEE2E2" }}>
                    <div className="text-sm font-semibold text-gray-600">Verdict (current window)</div>
                    <div className="text-2xl font-bold mt-1" style={{ color: roi.net_vs_fee > 0 ? "#065F46" : roi.net_vs_fee > (roi.total_fee_in_range * -0.25) ? "#92400E" : "#991B1B" }}>
                      {roi.verdict}
                    </div>
                    <div className="text-sm mt-2">
                      Net vs fee: <strong>{fmtCurrency(roi.net_vs_fee)}</strong>
                      {" "}({roi.net_vs_fee >= 0 ? "you're ahead" : "you're underwater"})
                    </div>
                  </div>

                  {/* Period comparison */}
                  {priorRoi && compareMode !== "none" && (
                    <div>
                      <h3 className="font-bold mb-2" style={{ color: ORANGE }}>
                        📊 Period comparison ({compareMode === "yoy" ? "same window, prior year" : "preceding window"})
                      </h3>
                      <div className="overflow-auto">
                        <table className="w-full text-sm border">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left">Metric</th>
                              <th className="px-3 py-2 text-right">Current</th>
                              <th className="px-3 py-2 text-right">Prior</th>
                              <th className="px-3 py-2 text-right">Δ</th>
                              <th className="px-3 py-2 text-right">% change</th>
                            </tr>
                          </thead>
                          <tbody>
                            <CmpRow label="Cases referred" curr={roi.total_cases} prior={priorRoi.total_cases} />
                            <CmpRow label="Arrived visits" curr={roi.total_visits} prior={priorRoi.total_visits} />
                            <CmpRow label="Gross revenue" curr={roi.gross_revenue} prior={priorRoi.gross_revenue} currency />
                            <CmpRow label="Variable cost" curr={roi.variable_cost} prior={priorRoi.variable_cost} currency invert />
                            <CmpRow label="Gross margin" curr={roi.gross_margin} prior={priorRoi.gross_margin} currency />
                            <CmpRow label="Net vs fee" curr={roi.net_vs_fee} prior={priorRoi.net_vs_fee} currency />
                            <CmpRow label="Visits / month (actual)" curr={roi.actual_visits_per_month} prior={priorRoi.actual_visits_per_month} decimals={1} />
                            <tr className="bg-orange-50 border-t-2 border-orange-300">
                              <td className="px-3 py-2 font-bold">Verdict</td>
                              <td className="px-3 py-2 text-right font-semibold">{roi.verdict}</td>
                              <td className="px-3 py-2 text-right font-semibold">{priorRoi.verdict}</td>
                              <td className="px-3 py-2 text-right" colSpan={2}>
                                {roi.net_vs_fee > priorRoi.net_vs_fee ? "📈 Improved" :
                                 roi.net_vs_fee < priorRoi.net_vs_fee ? "📉 Declined" : "→ Flat"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        ROI in both windows computed using the same RPV (${rpv}) and CPV (${cpv}).
                      </div>
                    </div>
                  )}

                  {/* Actual performance */}
                  <div>
                    <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Actual performance (current window)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Stat label="Cases referred" value={roi.total_cases.toLocaleString()} />
                      <Stat label="Arrived visits" value={roi.total_visits.toLocaleString()} />
                      <Stat label="Gross revenue" value={fmtCurrency(roi.gross_revenue)} color="#16A34A" />
                      <Stat label="Gross margin" value={fmtCurrency(roi.gross_margin)} color={roi.gross_margin >= 0 ? "#16A34A" : "#CC0000"} />
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Visits × RPV ${rpv} = revenue · Visits × CPV ${cpv} = variable cost · Margin = Visits × ({fmtCurrency(rpv - cpv, 2)} per visit)
                    </div>
                  </div>

                  {/* Break-even */}
                  <div>
                    <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Break-even visits required</h3>
                    <div className="text-sm text-gray-600 mb-2">
                      Given a monthly fee of <strong>{fmtCurrency(roi.monthly_amount)}</strong> and margin of <strong>{fmtCurrency(rpv - cpv, 2)}</strong> per visit,
                      you need this many visits FROM the affiliated physicians to cover the fee:
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <BreakEvenBlock label="Per month" required={roi.break_even_visits_per_month} actual={roi.actual_visits_per_month} />
                      <BreakEvenBlock label="Per quarter" required={roi.break_even_visits_per_quarter} actual={roi.actual_visits_per_month * 3} />
                      <BreakEvenBlock label="Per year" required={roi.break_even_visits_per_year} actual={roi.actual_visits_per_month * 12} />
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Variance: <strong>{roi.visits_vs_breakeven != null ? (roi.visits_vs_breakeven >= 0 ? "+" : "") + roi.visits_vs_breakeven : "—"}</strong> visits/month vs. break-even
                      ({roi.visits_vs_breakeven != null && roi.visits_vs_breakeven >= 0 ? "clearing the bar" : "below the bar"}).
                    </div>
                  </div>

                  {/* Scenario */}
                  <div className="border rounded p-3 bg-blue-50">
                    <div className="text-sm font-bold mb-1">💡 What would it take?</div>
                    <div className="text-sm">
                      {roi.visits_vs_breakeven != null && roi.visits_vs_breakeven < 0 ? (
                        <>At current rates, the contract is <strong>short {Math.abs(roi.visits_vs_breakeven).toFixed(0)} visits/month</strong>.
                        That's roughly <strong>{((Math.abs(roi.visits_vs_breakeven) * 12) / (roi.actual_visits_per_month * 12 || 1) * 100).toFixed(0)}%</strong> more referral volume than they're currently producing.
                        Options: raise retention (fewer zero-visit cases = more visits per case), expand affiliated NPI list, renegotiate the fee, or add perceived value in the contract (compliance/oversight you're not currently counting).</>
                      ) : (
                        <>You're clearing break-even by <strong>{fmtCurrency(roi.net_vs_fee)}</strong> in this window —
                        that's <strong>{roi.total_fee_in_range > 0 ? ((roi.net_vs_fee / roi.total_fee_in_range) * 100).toFixed(0) : "0"}%</strong> over what you're paying.
                        This contract is paying for itself plus contribution.</>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 italic border-t pt-3">
                    This calc treats the contract as purely referral-driven. Real medical director value often includes compliance oversight, staff training,
                    peer-review coverage, and strategic input — none of which show up as visits. Treat this as the <strong>minimum</strong> referral-economics threshold,
                    not the whole case for or against the relationship.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20 p-4 overflow-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-auto">
            <div className="px-6 py-4 border-b" style={{ backgroundColor: ORANGE, color: "white" }}>
              <h2 className="font-bold">{editing.id ? "Edit" : "New"} Medical Director Contract</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Director (physician)</label>
                {editing.physician_npi ? (
                  <div className="flex items-center gap-2 text-sm border rounded p-2 bg-gray-50">
                    <span className="font-semibold">NPI {editing.physician_npi}</span>
                    <button onClick={() => setEditing({ ...editing, physician_npi: undefined })} className="text-xs text-red-600 ml-auto">Change</button>
                  </div>
                ) : (
                  <>
                    <input placeholder="Search by name or NPI…" value={physSearch} onChange={e => setPhysSearch(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm" />
                    {physResults.length > 0 && (
                      <div className="border rounded mt-1 max-h-48 overflow-auto">
                        {physResults.map(p => (
                          <button key={p.npi} onClick={() => setEditing({ ...editing, physician_npi: p.npi })}
                            className="block w-full text-left px-3 py-1 hover:bg-orange-50 text-sm">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-xs text-gray-500 ml-2">NPI {p.npi} · {p.specialty ?? "—"} · {p.city ?? "—"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Monthly fee paid to director ($)</label>
                <input type="number" step="0.01" value={editing.monthly_amount ?? 0}
                  onChange={e => setEditing({ ...editing, monthly_amount: parseFloat(e.target.value) || 0 })}
                  className="border rounded px-2 py-1 text-sm w-40" />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Locations covered by this contract</label>
                <div className="text-xs text-gray-500 mb-1">Only cases at checked locations count toward the ROI. Leave all unchecked for "all locations."</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                  {allLocations.map(l => (
                    <label key={l.full_name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                      <input type="checkbox" checked={(editing.locations_covered ?? []).includes(l.full_name)} onChange={() => toggleLocation(l.full_name)} />
                      {l.short_name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Affiliated physicians (his staff, PAs, NPs)</label>
                <div className="text-xs text-gray-500 mb-1">Their referrals also count toward this contract's ROI.</div>
                {(editing.affiliated_npis ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(editing.affiliated_npis ?? []).map(n => (
                      <span key={n} className="inline-flex items-center gap-1 bg-orange-100 text-orange-900 text-xs rounded px-2 py-1">
                        {n}
                        <button onClick={() => removeAffiliatedNpi(n)} className="text-red-600 ml-1">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input placeholder="Search name or NPI to add…" value={physSearch} onChange={e => setPhysSearch(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm" />
                {physResults.length > 0 && (
                  <div className="border rounded mt-1 max-h-48 overflow-auto">
                    {physResults.map(p => (
                      <button key={p.npi} onClick={() => { addAffiliatedNpi(p.npi, p.name); setPhysSearch(""); setPhysResults([]); }}
                        className="block w-full text-left px-3 py-1 hover:bg-orange-50 text-sm">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-xs text-gray-500 ml-2">NPI {p.npi} · {p.specialty ?? "—"} · {p.city ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">Contract start</label>
                  <input type="date" value={editing.contract_start ?? ""} onChange={e => setEditing({ ...editing, contract_start: e.target.value || null })}
                    className="border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Contract end (optional)</label>
                  <input type="date" value={editing.contract_end ?? ""} onChange={e => setEditing({ ...editing, contract_end: e.target.value || null })}
                    className="border rounded px-2 py-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Notes</label>
                <textarea value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={3}
                  className="w-full border rounded px-2 py-1 text-sm" />
              </div>

              <div className="flex justify-between gap-2 border-t pt-3">
                <button onClick={() => { setShowEditor(false); setEditing(null); }} className="px-3 py-2 text-sm bg-gray-200 rounded">Cancel</button>
                <button onClick={saveContract} className="px-4 py-2 text-sm text-white rounded font-semibold" style={{ backgroundColor: ORANGE }}>
                  {editing.id ? "Save changes" : "Create contract"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MedicalDirectorPage() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}><MedicalDirectorPageInner /></Suspense>;
}

function Stat({ label, value, color }: any) {
  return (
    <div className="border-l-4 bg-white rounded p-3" style={{ borderColor: color || ORANGE }}>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function BreakEvenBlock({ label, required, actual }: { label: string; required: number | null; actual: number | null }) {
  const req = required ?? 0;
  const act = actual ?? 0;
  const pct = req > 0 ? Math.min(150, (act / req) * 100) : 0;
  const meeting = req > 0 && act >= req;
  return (
    <div className="border rounded p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-bold mt-1">{req.toFixed(0)} visits</div>
      <div className="text-xs mt-1" style={{ color: meeting ? "#16A34A" : "#CC0000" }}>
        Actual: {act.toFixed(0)} ({meeting ? "✓ meeting" : `${(act / Math.max(req, 1) * 100).toFixed(0)}% of target`})
      </div>
      <div className="bg-gray-200 h-2 rounded mt-1 overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: meeting ? "#16A34A" : ORANGE }} />
      </div>
    </div>
  );
}

function CmpRow({ label, curr, prior, currency, decimals = 0, invert }: { label: string; curr: number; prior: number; currency?: boolean; decimals?: number; invert?: boolean }) {
  const fmt = (v: number) => currency ? fmtCurrency(v, decimals) : v.toLocaleString(undefined, { maximumFractionDigits: decimals });
  const delta = curr - prior;
  // For cost (invert=true), lower is better; for revenue/margin, higher is better
  const up = invert ? delta < 0 : delta > 0;
  const pct = prior ? (delta / Math.abs(prior)) * 100 : 0;
  const color = delta === 0 ? "#666" : up ? "#16A34A" : "#CC0000";
  return (
    <tr className="border-b">
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right font-semibold">{fmt(curr)}</td>
      <td className="px-3 py-1.5 text-right text-gray-500">{fmt(prior)}</td>
      <td className="px-3 py-1.5 text-right" style={{ color }}>{delta >= 0 ? "+" : ""}{fmt(delta)}</td>
      <td className="px-3 py-1.5 text-right" style={{ color }}>{prior ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}</td>
    </tr>
  );
}
