"use client";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const ORANGE = "#FF8200";
const BLACK = "#000000";

type PhysicianRow = {
  npi: string;
  physician: string | null;
  specialty: string | null;
  practice_city: string | null;
  practice_state: string | null;
  departed: boolean | null;
  evals_curr: number;
  evals_prior: number;
  visits_curr: number;
  visits_prior: number;
  dominant_payer: string | null;
  payer_a_pct: number;
  locations: string | null;
  yoy_pct: number;
  decline_flag: string | null;
  growth_flag: string | null;
};

type LocationRow = {
  location: string;
  short_name: string;
  evals_curr: number;
  evals_prior: number;
  yoy_pct: number | null;
  unique_mds: number;
  top_md_name: string | null;
  top_md_evals: number | null;
  top_md_pct: number;
  gone_dark_count: number;
  rising_stars_count: number;
};

type Props = {
  data: {
    summary: any;
    physicians: PhysicianRow[];
    locations: LocationRow[];
    monthly: { month: string; evals: number }[];
    funnel: { period: string; created: number; scheduled: number; arrived: number; evaluated: number }[];
  };
};

const Kpi = ({ label, value, sub, color }: any) => (
  <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: color || ORANGE }}>
    <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
    <div className="text-2xl font-bold mt-1 text-black">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const Tab = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={"px-4 py-2 font-semibold text-sm rounded-t-lg transition-colors whitespace-nowrap " + (active ? "text-white" : "text-gray-700 bg-gray-100 hover:bg-gray-200")}
    style={active ? { backgroundColor: ORANGE } : {}}
  >
    {children}
  </button>
);

export default function Dashboard({ data }: Props) {
  const [tab, setTab] = useState<string>("Overview");
  const tabs = ["Overview", "Locations", "Physicians", "Call Sheet", "Alerts"];

  const s = data.summary || {};
  const curr = data.funnel.find((f) => f.period === "curr") || { created: 0, scheduled: 0, arrived: 0, evaluated: 0 };
  const prior = data.funnel.find((f) => f.period === "prior") || { created: 0, scheduled: 0, arrived: 0, evaluated: 0 };

  const yoy = s.prior_doc_referrals ? ((s.curr_doc_referrals - s.prior_doc_referrals) / s.prior_doc_referrals) * 100 : 0;
  const convCurr = curr.created ? (curr.arrived / curr.created) * 100 : 0;
  const convPrior = prior.created ? (prior.arrived / prior.created) * 100 : 0;

  // Derived lists
  const goneDark = data.physicians.filter((r) => r.decline_flag === "GONE_DARK");
  const sharpDecline = data.physicians.filter((r) => r.decline_flag === "SHARP_DECLINE" || r.decline_flag === "MODERATE_DECLINE");
  const growth = data.physicians.filter((r) => r.growth_flag);

  const callSheet = useMemo(() => {
    const rows: any[] = [];
    for (const r of data.physicians) {
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
  }, [data.physicians]);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <header className="bg-black rounded-t-lg px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-white text-2xl font-bold">Tristar PT — Referral Intelligence</h1>
            <div className="text-gray-300 text-sm">
              YTD {new Date().getFullYear()} · YoY vs same calendar window prior year · as of {s.as_of_date ?? "today"}
            </div>
          </div>
          <div className="text-right text-sm text-gray-300">
            <div>{s.curr_doc_referrals?.toLocaleString() ?? 0} physician referrals</div>
            <div>{s.curr_unique_physicians ?? 0} unique physicians</div>
          </div>
        </header>

        <div className="bg-white rounded-b-lg shadow-lg">
          <div className="px-4 pt-3 flex gap-1 border-b overflow-x-auto">
            {tabs.map((t) => <Tab key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}
          </div>
          <div className="p-4">
            {tab === "Overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Kpi label="Physician Referrals" value={s.curr_doc_referrals?.toLocaleString() ?? 0}
                    sub={`${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}% YoY · Prior: ${s.prior_doc_referrals ?? 0}`} color={ORANGE} />
                  <Kpi label="Unique Physicians" value={s.curr_unique_physicians ?? 0}
                    sub={`vs ${s.prior_unique_physicians ?? 0} prior`} color={ORANGE} />
                  <Kpi label="Created → Arrived" value={`${convCurr.toFixed(1)}%`}
                    sub={`Prior: ${convPrior.toFixed(1)}%`} color={ORANGE} />
                  <Kpi label="Gone Dark (actionable)" value={s.gone_dark_actionable ?? 0}
                    sub="excluding confirmed departed" color="#CC0000" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Kpi label="🌱 New Relationships" value={s.new_relationships ?? 0} sub="≥5 evals, 0 prior" color="#16A34A" />
                  <Kpi label="🚀 Rising Stars" value={s.rising_stars ?? 0} sub="≥50% YoY growth" color="#16A34A" />
                  <Kpi label="🟠 Sharp Declines" value={s.sharp_decline_count ?? 0} sub=">50% drop" color="#EA580C" />
                  <Kpi label="🟡 Moderate Declines" value={s.moderate_decline_count ?? 0} sub="20-50% drop" color="#D97706" />
                </div>

                <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
                  <h3 className="font-bold mb-2" style={{ color: ORANGE }}>Monthly Referral Volume (18-mo)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data.monthly}>
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

            {tab === "Locations" && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                  <div className="px-4 py-3 font-bold text-white" style={{ backgroundColor: ORANGE }}>Location Scorecard</div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Location</th>
                          <th className="px-3 py-2 text-right">YTD Curr</th>
                          <th className="px-3 py-2 text-right">YTD Prior</th>
                          <th className="px-3 py-2 text-right">YoY</th>
                          <th className="px-3 py-2 text-right">Unique MDs</th>
                          <th className="px-3 py-2 text-left">Top Referrer</th>
                          <th className="px-3 py-2 text-right">Top %</th>
                          <th className="px-3 py-2 text-right">Gone Dark</th>
                          <th className="px-3 py-2 text-right">Rising</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.locations.map((r, i) => (
                          <tr key={r.location} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                            <td className="px-3 py-2 font-semibold">{r.short_name}</td>
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
                    <BarChart data={data.locations}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="short_name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="evals_curr" name="YTD Curr" fill={ORANGE} />
                      <Bar dataKey="evals_prior" name="YTD Prior" fill={BLACK} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {tab === "Physicians" && <PhysiciansTab physicians={data.physicians} />}

            {tab === "Call Sheet" && <CallSheetTab rows={callSheet} />}

            {tab === "Alerts" && (
              <div className="space-y-6">
                <AlertTable title="🔴 Gone Dark (includes departed)" rows={goneDark} color="#CC0000" />
                <AlertTable title="🟠 Sharp / 🟡 Moderate Decline" rows={sharpDecline} color="#EA580C" />
                <AlertTable title="🌱🚀 Growth" rows={growth} color="#16A34A" />
              </div>
            )}
          </div>
        </div>
        <footer className="text-center text-xs text-gray-600 mt-3 pb-4">
          Powered by Supabase · Data refreshed every 5 min · Caldwell + Grimaldi auto-excluded from actionable lists
        </footer>
      </div>
    </div>
  );
}

function PhysiciansTab({ physicians }: { physicians: PhysicianRow[] }) {
  const [filter, setFilter] = useState("");
  const rows = physicians.filter((r) =>
    !filter ||
    (r.physician ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    r.npi.includes(filter) ||
    (r.dominant_payer ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (r.locations ?? "").toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 100);

  return (
    <div>
      <input placeholder="Search physician, NPI, payer, location..." value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full px-3 py-2 border rounded mb-3" />
      <div className="bg-white rounded-lg shadow overflow-auto border border-gray-200">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: ORANGE, color: "white" }}>
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Physician</th>
              <th className="px-3 py-2 text-left">NPI</th>
              <th className="px-3 py-2 text-right">Evals Curr</th>
              <th className="px-3 py-2 text-right">Evals Prior</th>
              <th className="px-3 py-2 text-right">YoY</th>
              <th className="px-3 py-2 text-right">Visits</th>
              <th className="px-3 py-2 text-right">Payer A %</th>
              <th className="px-3 py-2 text-left">Top Payer</th>
              <th className="px-3 py-2 text-left">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.npi + i} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"}>
                <td className="px-3 py-1">{i + 1}</td>
                <td className="px-3 py-1 font-semibold">{r.physician ?? r.npi}{r.departed ? " (departed)" : ""}</td>
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

function CallSheetTab({ rows }: { rows: any[] }) {
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
              <th className="px-2 py-2 text-left">Priority</th>
              <th className="px-2 py-2 text-left">Category</th>
              <th className="px-2 py-2 text-left">Physician</th>
              <th className="px-2 py-2 text-left">NPI</th>
              <th className="px-2 py-2 text-right">Prior</th>
              <th className="px-2 py-2 text-right">Curr</th>
              <th className="px-2 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.npi + i} style={{ backgroundColor: bg(r.priority) }}>
                <td className="px-2 py-2 font-semibold">{r.priority}</td>
                <td className="px-2 py-2 text-xs">{r.category}</td>
                <td className="px-2 py-2 font-semibold">{r.physician ?? r.npi}</td>
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

function AlertTable({ title, rows, color }: { title: string; rows: PhysicianRow[]; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
      <div className="px-4 py-3 font-bold text-white" style={{ backgroundColor: color }}>{title} ({rows.length})</div>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Physician</th>
              <th className="px-3 py-2 text-left">NPI</th>
              <th className="px-3 py-2 text-right">Prior</th>
              <th className="px-3 py-2 text-right">Curr</th>
              <th className="px-3 py-2 text-left">Flag</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.npi + i} style={r.departed ? { opacity: 0.5 } : {}}>
                <td className="px-3 py-2 font-semibold">{r.physician ?? r.npi}</td>
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
