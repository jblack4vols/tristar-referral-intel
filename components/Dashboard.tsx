"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { FiltersPanel, FilterState, FilterOption } from "./FiltersPanel";
import { SavedViews } from "./SavedViews";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const LOC_SLUG: Record<string, string> = {
  "Tristar PT - Morristown": "morristown",
  "Tristar PT - Maryville": "maryville",
  "Tristar PT - Bean Station": "bean-station",
  "Tristar PT - Newport": "newport",
  "Tristar PT - Jefferson City": "jefferson-city",
  "Tristar PT - Rogersville": "rogersville",
  "Tristar PT - New Tazewell": "new-tazewell",
  "Tristar PT - Johnson City": "johnson-city",
};

const ORANGE = "#FF8200";
const BLACK = "#000000";

type PhysicianRow = {
  npi: string; physician: string | null; specialty: string | null;
  practice_city: string | null; practice_state: string | null; departed: boolean | null;
  evals_curr: number; evals_prior: number; visits_curr: number; visits_prior: number;
  dominant_payer: string | null; payer_a_pct: number; locations: string | null;
  yoy_pct: number; decline_flag: string | null; growth_flag: string | null;
};

type LocationRow = {
  location: string; short_name: string;
  evals_curr: number; evals_prior: number; yoy_pct: number | null;
  unique_mds: number; top_md_name: string | null;
  top_md_evals: number | null; top_md_pct: number;
  gone_dark_count: number; rising_stars_count: number;
};

type SummaryRow = {
  curr_total_cases: number; prior_total_cases: number;
  curr_doc_referrals: number; prior_doc_referrals: number;
  curr_unique_physicians: number; prior_unique_physicians: number;
  gone_dark_actionable: number; sharp_decline_count: number; moderate_decline_count: number;
  new_relationships: number; rising_stars: number;
  curr_start: string; curr_end: string; prior_start: string; prior_end: string;
};


const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const endOfYear = (d: Date) => new Date(d.getFullYear(), 11, 31);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfQuarter = (d: Date) => {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
};
const endOfQuarter = (d: Date) => {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
};
const startOfWeek = (d: Date) => {
  // Monday-start week
  const day = (d.getDay() + 6) % 7;
  const s = new Date(d); s.setDate(s.getDate() - day); s.setHours(0, 0, 0, 0); return s;
};
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addMonths = (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const addYears = (d: Date, n: number) => { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; };
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
const minusOneYear = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
const isoDate = (s: string) => new Date(s + "T00:00:00");

type Preset =
  | "ytd" | "last-year"
  | "this-quarter" | "last-quarter"
  | "this-month" | "last-month"
  | "this-week" | "last-week"
  | "last-7" | "last-30" | "last-60" | "last-90" | "last-180" | "last-12mo"
  | "custom";

type CompareMode = "yoy" | "sequential";

const Kpi = ({ label, value, sub, color }: any) => (
  <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: color || ORANGE }}>
    <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
    <div className="text-2xl font-bold mt-1 text-black">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const Tab = ({ active, onClick, children }: any) => (
  <button onClick={onClick}
    className={"px-4 py-2 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap " + (active ? "text-white" : "text-gray-700 bg-gray-100 hover:bg-gray-200")}
    style={active ? { backgroundColor: ORANGE } : {}}>
    {children}
  </button>
);

export default function Dashboard() {
  // Date range state
  const [preset, setPreset] = useState<Preset>("ytd");
  const [compare, setCompare] = useState<CompareMode>("yoy");
  const [currStart, setCurrStart] = useState<string>(fmtDate(startOfYear(today())));
  const [currEnd, setCurrEnd] = useState<string>(fmtDate(today()));
  const [priorStart, setPriorStart] = useState<string>(fmtDate(minusOneYear(startOfYear(today()))));
  const [priorEnd, setPriorEnd] = useState<string>(fmtDate(minusOneYear(today())));
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);

  // All filters (multi-select across all dimensions)
  const [filters, setFilters] = useState<FilterState>({
    sources: ["Doctors Office"], payers: [], clinics: [], specialties: [],
    therapists: [], npis: [], diagnoses: [], statuses: [],
  });
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);

  // URL state sync
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlInitialized, setUrlInitialized] = useState(false);
  const preserveSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";

  // Data state
  const [tab, setTab] = useState<string>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [physicians, setPhysicians] = useState<PhysicianRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; evals: number }[]>([]);
  const [funnel, setFunnel] = useState<{ period: string; created: number; scheduled: number; arrived: number; evaluated: number }[]>([]);

  // Apply preset — computes current window. Prior window derives from `compare`.
  const applyPreset = useCallback((p: Preset, mode: CompareMode = compare) => {
    setPreset(p);
    const t = today();
    let cs: Date, ce: Date;

    switch (p) {
      case "ytd": cs = startOfYear(t); ce = t; break;
      case "last-year": cs = startOfYear(addYears(t, -1)); ce = endOfYear(addYears(t, -1)); break;
      case "this-quarter": cs = startOfQuarter(t); ce = t; break;
      case "last-quarter": {
        const lq = addMonths(startOfQuarter(t), -3);
        cs = startOfQuarter(lq); ce = endOfQuarter(lq); break;
      }
      case "this-month": cs = startOfMonth(t); ce = t; break;
      case "last-month": {
        const lm = addMonths(startOfMonth(t), -1);
        cs = startOfMonth(lm); ce = endOfMonth(lm); break;
      }
      case "this-week": cs = startOfWeek(t); ce = t; break;
      case "last-week": {
        const lw = addDays(startOfWeek(t), -7);
        cs = lw; ce = addDays(lw, 6); break;
      }
      case "last-7": ce = t; cs = addDays(t, -6); break;
      case "last-30": ce = t; cs = addDays(t, -29); break;
      case "last-60": ce = t; cs = addDays(t, -59); break;
      case "last-90": ce = t; cs = addDays(t, -89); break;
      case "last-180": ce = t; cs = addDays(t, -179); break;
      case "last-12mo": ce = t; cs = addYears(t, -1); break;
      default: return; // custom: leave alone
    }

    // Prior window
    let ps: Date, pe: Date;
    if (mode === "yoy") {
      ps = addYears(cs, -1); pe = addYears(ce, -1);
    } else {
      // Sequential — window of same length immediately preceding
      const len = daysBetween(cs, ce); // inclusive days-1
      pe = addDays(cs, -1);
      ps = addDays(pe, -len);
    }
    setCurrStart(fmtDate(cs)); setCurrEnd(fmtDate(ce));
    setPriorStart(fmtDate(ps)); setPriorEnd(fmtDate(pe));
  }, [compare]);

  // When user toggles comparison mode, recompute prior window based on current preset
  const applyCompare = useCallback((mode: CompareMode) => {
    setCompare(mode);
    if (preset !== "custom") applyPreset(preset, mode);
  }, [preset, applyPreset]);

  // Load date bounds + all filter options once
  useEffect(() => {
    supabase.rpc("rpc_date_bounds").then(({ data }) => {
      if (data && data.length > 0) {
        setBounds({ min: data[0].min_date, max: data[0].max_date });
      }
    });
    supabase.rpc("rpc_filter_options").then(({ data }) => {
      if (data) setFilterOptions(data);
    });
  }, []);

  // Hydrate state from URL on mount (one-time)
  useEffect(() => {
    if (urlInitialized) return;
    const getArr = (k: string): string[] => {
      const v = searchParams.get(k);
      return v ? v.split("|").filter(Boolean) : [];
    };
    const getStr = (k: string, def: string) => searchParams.get(k) ?? def;
    const cs = searchParams.get("cs"); const ce = searchParams.get("ce");
    const ps = searchParams.get("ps"); const pe = searchParams.get("pe");
    if (cs) setCurrStart(cs);
    if (ce) setCurrEnd(ce);
    if (ps) setPriorStart(ps);
    if (pe) setPriorEnd(pe);
    if (cs || ce || ps || pe) setPreset("custom");
    setCompare(getStr("cm", "yoy") as CompareMode);
    // Only overwrite filters if any filter param present
    const keys = ["src", "pay", "cln", "spc", "thr", "npi", "dx", "stat"];
    if (keys.some(k => searchParams.get(k) !== null)) {
      setFilters({
        sources: getArr("src"),
        payers: getArr("pay"),
        clinics: getArr("cln"),
        specialties: getArr("spc"),
        therapists: getArr("thr"),
        npis: getArr("npi"),
        diagnoses: getArr("dx"),
        statuses: getArr("stat"),
      });
    }
    setUrlInitialized(true);
  }, [searchParams, urlInitialized]);

  // Sync state → URL (debounced, skip first render)
  useEffect(() => {
    if (!urlInitialized) return;
    const qs = new URLSearchParams();
    qs.set("cs", currStart); qs.set("ce", currEnd);
    qs.set("ps", priorStart); qs.set("pe", priorEnd);
    if (compare !== "yoy") qs.set("cm", compare);
    const f: [string, string[]][] = [
      ["src", filters.sources], ["pay", filters.payers], ["cln", filters.clinics],
      ["spc", filters.specialties], ["thr", filters.therapists], ["npi", filters.npis],
      ["dx", filters.diagnoses], ["stat", filters.statuses],
    ];
    for (const [k, v] of f) if (v.length > 0) qs.set(k, v.join("|"));
    const next = "?" + qs.toString();
    if (next !== window.location.search) {
      router.replace(next, { scroll: false });
    }
  }, [urlInitialized, currStart, currEnd, priorStart, priorEnd, compare, filters, router]);

  // Load all data when dates or filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      const nullIfEmpty = (a: string[]) => (a.length === 0 ? null : a);
      const commonFilters = {
        source_filter: nullIfEmpty(filters.sources),
        payer_filter: nullIfEmpty(filters.payers),
        clinic_filter: nullIfEmpty(filters.clinics),
        specialty_filter: nullIfEmpty(filters.specialties),
        therapist_filter: nullIfEmpty(filters.therapists),
        npi_filter: nullIfEmpty(filters.npis),
        dx_filter: nullIfEmpty(filters.diagnoses),
        status_filter: nullIfEmpty(filters.statuses),
      };
      const params: any = {
        curr_start: currStart, curr_end: currEnd,
        prior_start: priorStart, prior_end: priorEnd,
        ...commonFilters,
      };
      const trendRange = currStart < priorStart ? currStart : priorStart;
      const trendEnd = currEnd > priorEnd ? currEnd : priorEnd;
      try {
        const [s, p, l, f, m] = await Promise.all([
          supabase.rpc("rpc_summary_v3", params),
          supabase.rpc("rpc_physician_stats_v3", params),
          supabase.rpc("rpc_location_scorecard_v3", params),
          supabase.rpc("rpc_funnel_v3", params),
          supabase.rpc("rpc_monthly_trend_v3", { range_start: trendRange, range_end: trendEnd, ...commonFilters }),
        ]);
        if (cancelled) return;
        const firstError = s.error || p.error || l.error || f.error || m.error;
        if (firstError) {
          setError(firstError.message);
          setLoading(false);
          return;
        }
        setSummary(s.data?.[0] ?? null);
        setPhysicians((p.data ?? []).sort((a: any, b: any) => b.evals_curr - a.evals_curr));
        setLocations(l.data ?? []);
        setFunnel(f.data ?? []);
        setMonthly(m.data ?? []);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) { setError(e.message || String(e)); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [currStart, currEnd, priorStart, priorEnd, filters]);

  const curr = funnel.find((f) => f.period === "curr") || { created: 0, scheduled: 0, arrived: 0, evaluated: 0 };
  const prior = funnel.find((f) => f.period === "prior") || { created: 0, scheduled: 0, arrived: 0, evaluated: 0 };
  const s = summary || ({} as Partial<SummaryRow>);
  const yoy = (s.prior_doc_referrals && s.curr_doc_referrals !== undefined)
    ? ((s.curr_doc_referrals - s.prior_doc_referrals) / s.prior_doc_referrals) * 100 : 0;
  const convCurr = curr.created ? (curr.arrived / curr.created) * 100 : 0;
  const convPrior = prior.created ? (prior.arrived / prior.created) * 100 : 0;

  const goneDark = physicians.filter((r) => r.decline_flag === "GONE_DARK");
  const sharpDecline = physicians.filter((r) => r.decline_flag === "SHARP_DECLINE" || r.decline_flag === "MODERATE_DECLINE");
  const growth = physicians.filter((r) => r.growth_flag);

  const callSheet = useMemo(() => {
    const rows: any[] = [];
    for (const r of physicians) {
      if (r.departed) continue;
      let priority: string | null = null;
      let category = "";
      let action = "";
      if (r.decline_flag === "GONE_DARK" && r.evals_prior >= 15) {
        priority = "Critical"; category = "Gone Dark — top referrer"; action = "Visit this week. Bring outcomes + apology.";
      } else if (r.decline_flag === "GONE_DARK") {
        priority = "Critical"; category = "Gone Dark"; action = "Phone within 48 hrs. In-person within 2 weeks.";
      } else if (r.decline_flag === "SHARP_DECLINE") {
        priority = "High"; category = "Sharp Decline >50%"; action = "Visit within 2 weeks.";
      } else if (r.decline_flag === "MODERATE_DECLINE") {
        priority = "Medium"; category = "Moderate Decline"; action = "Phone check-in within 2 weeks.";
      } else if (r.growth_flag === "RISING_STAR") {
        priority = "Medium"; category = "Rising Star"; action = "Lunch/drop-in within 30 days.";
      } else if (r.growth_flag === "NEW_RELATIONSHIP" && r.evals_curr >= 5) {
        priority = "Medium"; category = "New Relationship"; action = "Monthly touch cadence.";
      }
      if (priority) rows.push({ ...r, priority, category, action });
    }
    const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2 };
    rows.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || b.evals_prior - a.evals_prior);
    return rows;
  }, [physicians]);

  const tabs = ["Overview", "Locations", "Physicians", "Call Sheet", "Alerts"];

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <header className="bg-black rounded-t-lg px-6 py-4 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-white text-2xl font-bold">Tristar PT — Referral Intelligence</h1>
            <div className="text-gray-300 text-sm">
              Current: {currStart} → {currEnd}  ·  Prior: {priorStart} → {priorEnd}
            </div>
          </div>
          <div className="text-right text-sm text-gray-300">
            <div>{(s.curr_doc_referrals ?? 0).toLocaleString()} physician referrals</div>
            <div>{s.curr_unique_physicians ?? 0} unique physicians</div>
            <div className="flex gap-1 mt-1 justify-end items-center">
              <SavedViews
                currentSearch={typeof window !== "undefined" ? window.location.search : ""}
                onLoad={(search) => router.replace("/" + search, { scroll: false })}
              />
              <Link href="/discharges" className="px-2 py-1 text-xs font-semibold rounded bg-white text-black">Outcome queue</Link>
              <Link href="/upload" className="px-2 py-1 text-xs font-semibold rounded text-white" style={{ backgroundColor: ORANGE }}>+ Upload</Link>
            </div>
          </div>
        </header>

        {/* Date range controls — row 1: presets */}
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-700 mr-2">Range:</span>
          {([
            { id: "this-week", label: "This week" },
            { id: "last-week", label: "Last week" },
            { id: "this-month", label: "This month" },
            { id: "last-month", label: "Last month" },
            { id: "this-quarter", label: "This qtr" },
            { id: "last-quarter", label: "Last qtr" },
            { id: "ytd", label: "YTD" },
            { id: "last-year", label: "Last year" },
          ] as { id: Preset; label: string }[]).map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={"px-2 py-1 rounded text-xs " + (preset === p.id ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
              style={preset === p.id ? { backgroundColor: ORANGE } : {}}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 mx-1">|</span>
          {([
            { id: "last-7", label: "7d" },
            { id: "last-30", label: "30d" },
            { id: "last-60", label: "60d" },
            { id: "last-90", label: "90d" },
            { id: "last-180", label: "180d" },
            { id: "last-12mo", label: "12mo" },
          ] as { id: Preset; label: string }[]).map(p => (
            <button key={p.id} onClick={() => applyPreset(p.id)}
              className={"px-2 py-1 rounded text-xs " + (preset === p.id ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
              style={preset === p.id ? { backgroundColor: ORANGE } : {}}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 mx-1">|</span>
          <button onClick={() => applyPreset("custom")}
            className={"px-2 py-1 rounded text-xs " + (preset === "custom" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
            style={preset === "custom" ? { backgroundColor: ORANGE } : {}}>
            Custom
          </button>
        </div>

        {/* Date range controls — row 2: dates + compare mode */}
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Current:</span>
            <input type="date" value={currStart} min={bounds?.min} max={bounds?.max}
              onChange={e => { setPreset("custom"); setCurrStart(e.target.value); }}
              className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400">→</span>
            <input type="date" value={currEnd} min={bounds?.min} max={bounds?.max}
              onChange={e => { setPreset("custom"); setCurrEnd(e.target.value); }}
              className="border rounded px-2 py-1 text-xs" />
          </div>
          <div className="flex items-center gap-1 ml-3">
            <span className="text-xs text-gray-500">Prior:</span>
            <input type="date" value={priorStart} min={bounds?.min} max={bounds?.max}
              onChange={e => { setPreset("custom"); setPriorStart(e.target.value); }}
              className="border rounded px-2 py-1 text-xs" />
            <span className="text-gray-400">→</span>
            <input type="date" value={priorEnd} min={bounds?.min} max={bounds?.max}
              onChange={e => { setPreset("custom"); setPriorEnd(e.target.value); }}
              className="border rounded px-2 py-1 text-xs" />
          </div>
          <div className="flex items-center gap-1 ml-3">
            <span className="text-xs text-gray-500">Compare:</span>
            <button onClick={() => applyCompare("yoy")}
              className={"px-2 py-1 rounded text-xs " + (compare === "yoy" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
              style={compare === "yoy" ? { backgroundColor: ORANGE } : {}}
              title="Prior = same window last year (seasonality-aware)">
              YoY
            </button>
            <button onClick={() => applyCompare("sequential")}
              className={"px-2 py-1 rounded text-xs " + (compare === "sequential" ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
              style={compare === "sequential" ? { backgroundColor: ORANGE } : {}}
              title="Prior = equal-length window immediately before current">
              Sequential
            </button>
          </div>
          {bounds && (
            <span className="text-xs text-gray-400 ml-auto">Data available: {bounds.min} → {bounds.max}</span>
          )}
        </div>

        {/* All filters (multi-select across 7 dimensions) */}
        <FiltersPanel filters={filters} options={filterOptions} onChange={setFilters} />

        <div className="bg-white rounded-b-lg shadow-lg">
          <div className="px-4 pt-3 flex gap-1 border-b overflow-x-auto">
            {tabs.map((t) => <Tab key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
          </div>

          <div className="p-4">
            {loading && <div className="text-center py-12 text-gray-500">Loading…</div>}
            {error && <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">Error: {error}</div>}

            {!loading && !error && tab === "Overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Kpi label="Total Cases Created" value={(s.curr_total_cases ?? 0).toLocaleString()}
                    sub={`vs ${s.prior_total_cases ?? 0} prior`} color={ORANGE} />
                  <Kpi label="Physician Referrals (with NPI)" value={(s.curr_doc_referrals ?? 0).toLocaleString()}
                    sub={`${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% vs ${s.prior_doc_referrals ?? 0}`} color={ORANGE} />
                  <Kpi label="Unique Physicians" value={s.curr_unique_physicians ?? 0}
                    sub={`vs ${s.prior_unique_physicians ?? 0} prior`} color={ORANGE} />
                  <Kpi label="Created → Arrived" value={`${convCurr.toFixed(1)}%`}
                    sub={`Prior: ${convPrior.toFixed(1)}%`} color={ORANGE} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Kpi label="🔴 Gone Dark" value={s.gone_dark_actionable ?? 0} sub="excl. departed" color="#CC0000" />
                  <Kpi label="🟠 Sharp Declines" value={s.sharp_decline_count ?? 0} sub=">50% drop" color="#EA580C" />
                  <Kpi label="🟡 Moderate Declines" value={s.moderate_decline_count ?? 0} sub="20-50% drop" color="#D97706" />
                  <Kpi label="🌱 New Relationships" value={s.new_relationships ?? 0} sub="≥5 evals, 0 prior" color="#16A34A" />
                  <Kpi label="🚀 Rising Stars" value={s.rising_stars ?? 0} sub="≥50% YoY growth" color="#16A34A" />
                </div>
                <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
                  <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Monthly Referral Volume (covers both periods)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="evals" stroke={ORANGE} strokeWidth={3} dot={{ fill: ORANGE }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {!loading && !error && tab === "Locations" && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                  <div className="px-4 py-3 font-bold text-white" style={{ backgroundColor: ORANGE }}>Location Scorecard</div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Location</th>
                          <th className="px-3 py-2 text-right">Curr</th>
                          <th className="px-3 py-2 text-right">Prior</th>
                          <th className="px-3 py-2 text-right">YoY</th>
                          <th className="px-3 py-2 text-right">Unique MDs</th>
                          <th className="px-3 py-2 text-left">Top Referrer</th>
                          <th className="px-3 py-2 text-right">Top %</th>
                          <th className="px-3 py-2 text-right">Gone Dark</th>
                          <th className="px-3 py-2 text-right">Rising</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locations.map((r, i) => (
                          <tr key={r.location} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                            <td className="px-3 py-2 font-semibold">
                              <Link href={`/location/${LOC_SLUG[r.location] ?? "morristown"}${preserveSearch}`} className="hover:underline" style={{ color: ORANGE }}>
                                {r.short_name}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right">{r.evals_curr}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{r.evals_prior}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: r.yoy_pct == null ? "#16A34A" : r.yoy_pct >= 0 ? "#16A34A" : "#CC0000" }}>
                              {r.yoy_pct == null ? "NEW" : `${r.yoy_pct >= 0 ? "+" : ""}${r.yoy_pct}%`}
                            </td>
                            <td className="px-3 py-2 text-right">{r.unique_mds}</td>
                            <td className="px-3 py-2 text-xs">{r.top_md_name ?? "—"} {r.top_md_evals ? `(${r.top_md_evals})` : ""}</td>
                            <td className="px-3 py-2 text-right">{r.top_md_pct}%</td>
                            <td className="px-3 py-2 text-right font-semibold" style={r.gone_dark_count >= 2 ? { color: "#CC0000" } : {}}>{r.gone_dark_count}</td>
                            <td className="px-3 py-2 text-right">{r.rising_stars_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
                  <h3 className="font-bold mb-3" style={{ color: ORANGE }}>Referral Volume by Location</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={locations}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="short_name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="evals_curr" name="Current" fill={ORANGE} />
                      <Bar dataKey="evals_prior" name="Prior" fill={BLACK} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {!loading && !error && tab === "Physicians" && <PhysiciansTab physicians={physicians} preserveSearch={preserveSearch} />}
            {!loading && !error && tab === "Call Sheet" && <CallSheetTab rows={callSheet} preserveSearch={preserveSearch} />}
            {!loading && !error && tab === "Alerts" && (
              <div className="space-y-6">
                <AlertTable title="🔴 Gone Dark (includes departed)" rows={goneDark} color="#CC0000" preserveSearch={preserveSearch} />
                <AlertTable title="🟠 Sharp / 🟡 Moderate Decline" rows={sharpDecline} color="#EA580C" preserveSearch={preserveSearch} />
                <AlertTable title="🌱🚀 Growth" rows={growth} color="#16A34A" preserveSearch={preserveSearch} />
              </div>
            )}
          </div>
        </div>
        <footer className="text-center text-xs text-gray-600 mt-3 pb-4">
          Powered by Supabase + Vercel · Caldwell + Grimaldi auto-excluded from actionable lists
        </footer>
      </div>
    </div>
  );
}

function PhysiciansTab({ physicians, preserveSearch }: { physicians: PhysicianRow[]; preserveSearch: string }) {
  const [filter, setFilter] = useState("");
  const rows = physicians.filter((r) =>
    !filter ||
    (r.physician ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    r.npi.includes(filter) ||
    (r.dominant_payer ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (r.locations ?? "").toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 200);
  return (
    <div>
      <input placeholder="Search physician, NPI, payer, location..." value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-2 border rounded mb-3" />
      <div className="bg-white rounded-lg shadow overflow-auto border border-gray-200">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: ORANGE, color: "white" }}>
            <tr>
              <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Physician</th><th className="px-3 py-2 text-left">NPI</th>
              <th className="px-3 py-2 text-right">Curr</th><th className="px-3 py-2 text-right">Prior</th><th className="px-3 py-2 text-right">YoY</th>
              <th className="px-3 py-2 text-right">Visits</th><th className="px-3 py-2 text-right">Payer A %</th>
              <th className="px-3 py-2 text-left">Top Payer</th><th className="px-3 py-2 text-left">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.npi + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                <td className="px-3 py-1">{i + 1}</td>
                <td className="px-3 py-1 font-semibold">
                  <Link href={`/physician/${r.npi}${preserveSearch}`} className="hover:underline" style={{ color: ORANGE }}>
                    {r.physician ?? r.npi}
                  </Link>
                  {r.departed ? " (departed)" : ""}
                </td>
                <td className="px-3 py-1 font-mono text-xs">{r.npi}</td>
                <td className="px-3 py-1 text-right">{r.evals_curr}</td>
                <td className="px-3 py-1 text-right">{r.evals_prior}</td>
                <td className="px-3 py-1 text-right" style={{ color: r.yoy_pct >= 999 ? "#16A34A" : r.yoy_pct >= 0 ? "#16A34A" : "#CC0000" }}>
                  {r.yoy_pct >= 999 ? "NEW" : `${r.yoy_pct >= 0 ? "+" : ""}${r.yoy_pct}%`}
                </td>
                <td className="px-3 py-1 text-right">{r.visits_curr}</td>
                <td className="px-3 py-1 text-right">{r.payer_a_pct}%</td>
                <td className="px-3 py-1 text-xs">{r.dominant_payer ?? "—"}</td>
                <td className="px-3 py-1 text-xs">{r.decline_flag ?? r.growth_flag ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CallSheetTab({ rows, preserveSearch }: { rows: any[]; preserveSearch: string }) {
  const [pf, setPf] = useState<string>("All");
  const filters = ["All", "Critical", "High", "Medium"];
  const visible = rows.filter(r => pf === "All" || r.priority === pf);
  const bg = (p: string) => ({ Critical: "#FEE2E2", High: "#FFE4C4", Medium: "#FEF3C7" } as any)[p] || "#F5F5F5";
  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {filters.map(f => (
          <button key={f} onClick={() => setPf(f)}
            className={"px-3 py-1 text-sm rounded " + (pf === f ? "text-white" : "bg-gray-200")}
            style={pf === f ? { backgroundColor: ORANGE } : {}}>
            {f} ({f === "All" ? rows.length : rows.filter(r => r.priority === f).length})
          </button>
        ))}
      </div>
      <div className="bg-white rounded-lg shadow overflow-auto border border-gray-200">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: ORANGE, color: "white" }}>
            <tr>
              <th className="px-2 py-2 text-left">Priority</th><th className="px-2 py-2 text-left">Category</th>
              <th className="px-2 py-2 text-left">Physician</th><th className="px-2 py-2 text-left">NPI</th>
              <th className="px-2 py-2 text-right">Prior</th><th className="px-2 py-2 text-right">Curr</th><th className="px-2 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.npi + i} style={{ backgroundColor: bg(r.priority) }}>
                <td className="px-2 py-2 font-semibold">{r.priority}</td>
                <td className="px-2 py-2 text-xs">{r.category}</td>
                <td className="px-2 py-2 font-semibold">
                  <Link href={`/physician/${r.npi}${preserveSearch}`} className="hover:underline" style={{ color: ORANGE }}>
                    {r.physician ?? r.npi}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono text-xs">{r.npi}</td>
                <td className="px-2 py-2 text-right">{r.evals_prior}</td>
                <td className="px-2 py-2 text-right">{r.evals_curr}</td>
                <td className="px-2 py-2 text-xs">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertTable({ title, rows, color, preserveSearch }: { title: string; rows: PhysicianRow[]; color: string; preserveSearch: string }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
      <div className="px-4 py-3 font-bold text-white" style={{ backgroundColor: color }}>{title} ({rows.length})</div>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Physician</th><th className="px-3 py-2 text-left">NPI</th>
              <th className="px-3 py-2 text-right">Prior</th><th className="px-3 py-2 text-right">Curr</th>
              <th className="px-3 py-2 text-left">Flag</th><th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.npi + i} style={r.departed ? { opacity: 0.5 } : {}}>
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/physician/${r.npi}${preserveSearch}`} className="hover:underline" style={{ color: ORANGE }}>
                    {r.physician ?? r.npi}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.npi}</td>
                <td className="px-3 py-2 text-right">{r.evals_prior}</td>
                <td className="px-3 py-2 text-right">{r.evals_curr}</td>
                <td className="px-3 py-2 text-xs">{r.decline_flag ?? r.growth_flag}</td>
                <td className="px-3 py-2 text-xs">{r.departed ? "❌ Departed — do not contact" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
