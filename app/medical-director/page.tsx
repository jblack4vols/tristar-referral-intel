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

function MedicalDirectorPageInner() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analysis params
  const [rangeStart, setRangeStart] = useState(startOfYearStr());
  const [rangeEnd, setRangeEnd] = useState(todayStr());
  const [rpv, setRpv] = useState(95);
  const [cpv, setCpv] = useState(92);
  const [roi, setRoi] = useState<RoiResult | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Partial<Contract> & { id?: string } | null>(null);
  const [allLocations, setAllLocations] = useState<{ full_name: string; short_name: string }[]>([]);
  const [physSearch, setPhysSearch] = useState("");
  const [physResults, setPhysResults] = useState<any[]>([]);

  // Load contracts
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

  // Recompute ROI when contract or params change
  useEffect(() => {
    if (!activeId) { setRoi(null); return; }
    setRoiLoading(true);
    supabase.rpc("rpc_medical_director_roi", {
      p_contract_id: activeId, range_start: rangeStart, range_end: rangeEnd,
      rpv, cpv
    }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRoi(data?.[0] ?? null);
      setRoiLoading(false);
    });
  }, [activeId, rangeStart, rangeEnd, rpv, cpv]);

  // Physician search for editor
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

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>

        <header className="bg-black rounded-t-lg px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-bold">Medical Director ROI Calculator</h1>
            <div className="text-gray-300 text-sm">Does what you're paying a medical director return its cost in referral-driven margin?</div>
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

              {/* Parameters */}
              <div className="bg-gray-50 border rounded p-3 flex flex-wrap items-end gap-3 text-sm">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date range</label>
                  <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
                  <span className="text-gray-400 mx-1">→</span>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Revenue per visit ($)</label>
                  <input type="number" step="0.01" value={rpv} onChange={e => setRpv(parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-xs w-24" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cost per visit ($)</label>
                  <input type="number" step="0.01" value={cpv} onChange={e => setCpv(parseFloat(e.target.value) || 0)} className="border rounded px-2 py-1 text-xs w-24" />
                </div>
                <div className="text-xs text-gray-500">
                  Margin per visit: <strong>{fmtCurrency(rpv - cpv, 2)}</strong>
                </div>
                <button onClick={() => {
                  const c = contracts.find(x => x.id === activeId);
                  if (c) openEditor(c);
                }} className="ml-auto px-3 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">Edit contract</button>
                {activeId && (
                  <button onClick={() => deactivateContract(activeId)} className="px-3 py-1 text-xs rounded bg-red-100 hover:bg-red-200 text-red-800">Deactivate</button>
                )}
              </div>

              {roiLoading && <div className="text-center text-sm text-gray-500 py-4">Computing…</div>}

              {roi && !roiLoading && (
                <div className="space-y-4">
                  {/* Contract details */}
                  <div className="border rounded p-3 bg-orange-50">
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
                    <div className="text-sm font-semibold text-gray-600">Verdict</div>
                    <div className="text-2xl font-bold mt-1" style={{ color: roi.net_vs_fee > 0 ? "#065F46" : roi.net_vs_fee > (roi.total_fee_in_range * -0.25) ? "#92400E" : "#991B1B" }}>
                      {roi.verdict}
                    </div>
                    <div className="text-sm mt-2">
                      Net vs fee in window: <strong>{fmtCurrency(roi.net_vs_fee)}</strong>
                      {" "}({roi.net_vs_fee >= 0 ? "you're ahead" : "you're underwater"})
                    </div>
                  </div>

                  {/* Actual performance */}
                  <div>
                    <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Actual performance (in window)</h3>
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
                      <BreakEvenBlock
                        label="Per month"
                        required={roi.break_even_visits_per_month}
                        actual={roi.actual_visits_per_month}
                      />
                      <BreakEvenBlock
                        label="Per quarter"
                        required={roi.break_even_visits_per_quarter}
                        actual={roi.actual_visits_per_month * 3}
                      />
                      <BreakEvenBlock
                        label="Per year"
                        required={roi.break_even_visits_per_year}
                        actual={roi.actual_visits_per_month * 12}
                      />
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
                        Options: increase visits per case (care retention), expand affiliated NPI list, renegotiate the fee.</>
                      ) : (
                        <>You're clearing break-even by <strong>{fmtCurrency(roi.net_vs_fee)}</strong> in this window.
                        That's <strong>{roi.net_vs_fee > 0 && roi.total_fee_in_range > 0 ? ((roi.net_vs_fee / roi.total_fee_in_range) * 100).toFixed(0) : "0"}%</strong> over what you're paying —
                        this contract is paying for itself plus contribution.</>
                      )}
                    </div>
                  </div>

                  {/* Caveat */}
                  <div className="text-xs text-gray-500 italic border-t pt-3">
                    This calc treats the contract as purely referral-driven. Real medical director value often includes compliance oversight, staff training,
                    peer-review coverage, and strategic input — all of which don't show up as visits. Treat this as the <strong>minimum</strong> referral-economics threshold,
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
              {/* Physician selector */}
              <div>
                <label className="block text-sm font-semibold mb-1">Director (physician)</label>
                {editing.physician_npi ? (
                  <div className="flex items-center gap-2 text-sm border rounded p-2 bg-gray-50">
                    <span className="font-semibold">NPI {editing.physician_npi}</span>
                    <button onClick={() => setEditing({ ...editing, physician_npi: undefined })} className="text-xs text-red-600 ml-auto">Change</button>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder="Search by name or NPI…"
                      value={physSearch} onChange={e => setPhysSearch(e.target.value)}
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

              {/* Monthly amount */}
              <div>
                <label className="block text-sm font-semibold mb-1">Monthly fee paid to director ($)</label>
                <input type="number" step="0.01" value={editing.monthly_amount ?? 0}
                  onChange={e => setEditing({ ...editing, monthly_amount: parseFloat(e.target.value) || 0 })}
                  className="border rounded px-2 py-1 text-sm w-40" />
              </div>

              {/* Locations covered */}
              <div>
                <label className="block text-sm font-semibold mb-1">Locations covered by this contract</label>
                <div className="text-xs text-gray-500 mb-1">Only cases at checked locations count toward the ROI. Leave all unchecked for "all locations."</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                  {allLocations.map(l => (
                    <label key={l.full_name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                      <input type="checkbox"
                        checked={(editing.locations_covered ?? []).includes(l.full_name)}
                        onChange={() => toggleLocation(l.full_name)} />
                      {l.short_name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Affiliated NPIs */}
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
                <input
                  placeholder="Search name or NPI to add…"
                  value={physSearch} onChange={e => setPhysSearch(e.target.value)}
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

              {/* Dates + notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">Contract start</label>
                  <input type="date" value={editing.contract_start ?? ""}
                    onChange={e => setEditing({ ...editing, contract_start: e.target.value || null })}
                    className="border rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Contract end (optional)</label>
                  <input type="date" value={editing.contract_end ?? ""}
                    onChange={e => setEditing({ ...editing, contract_end: e.target.value || null })}
                    className="border rounded px-2 py-1 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Notes</label>
                <textarea value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  rows={3} className="w-full border rounded px-2 py-1 text-sm" />
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
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading…</div>}>
      <MedicalDirectorPageInner />
    </Suspense>
  );
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
