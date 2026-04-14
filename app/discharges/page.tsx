"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const ORANGE = "#FF8200";

type QueueItem = {
  case_id: string; patient_account_number: string; patient_name: string | null;
  case_facility: string; case_therapist: string | null; referring_doctor_name: string | null;
  referring_doctor_npi: string | null; primary_payer_type: string | null;
  patient_diagnosis_category: string | null; created_date: string; discharge_date: string;
  discharge_reason: string | null; arrived_visits: number;
  days_of_care: number | null; days_since_discharge: number | null;
  outcome_status: string; outcome_report_id: string | null;
  outcome_sent_at: string | null; outcome_channel: string | null;
  physician_name: string | null; physician_departed: boolean | null;
};

function generateOutcomeBody(q: QueueItem) {
  const lines = [
    `Dr. ${(q.referring_doctor_name ?? q.physician_name ?? "").split(" ").slice(-1)[0] || "Referring Provider"},`,
    ``,
    `We are writing to close the loop on ${q.patient_name ?? q.patient_account_number}, whom you referred on ${q.created_date}.`,
    ``,
    `• Initial evaluation → Discharge: ${q.days_of_care ?? "—"} days of care`,
    `• Total arrived visits: ${q.arrived_visits}`,
    `• Primary diagnosis category: ${q.patient_diagnosis_category ?? "—"}`,
    `• Discharge date: ${q.discharge_date} · Reason: ${q.discharge_reason ?? "—"}`,
    `• Treating clinic: ${q.case_facility.replace("Tristar PT - ", "")} · Therapist: ${q.case_therapist ?? "—"}`,
    ``,
    `Thank you for trusting Tristar PT with your patient. If there is anything we could have done differently, please let us know — we want to keep earning your referrals.`,
    ``,
    `Tristar PT · tristarpt.com`,
  ];
  return lines.join("\n");
}

export default function DischargesPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<"pending" | "all" | "sent" | "overdue">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeStart, setRangeStart] = useState("2025-01-01");
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));

  // Report composer state
  const [activeCase, setActiveCase] = useState<QueueItem | null>(null);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<string>("fax");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "done">("idle");

  const reload = async () => {
    setLoading(true);
    setError(null);
    const [q, st] = await Promise.all([
      supabase.from("v_outcome_queue").select("*").gte("discharge_date", rangeStart).lte("discharge_date", rangeEnd).order("discharge_date", { ascending: false }).limit(500),
      supabase.rpc("rpc_outcome_stats", { range_start: rangeStart, range_end: rangeEnd }),
    ]);
    if (q.error) { setError(q.error.message); setLoading(false); return; }
    setItems(q.data ?? []);
    setStats(st.data?.[0] ?? null);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [rangeStart, rangeEnd]);

  const visible = items.filter(q => {
    if (filter === "pending") if (!(q.outcome_status === "pending" || q.outcome_status === "drafted")) return false;
    if (filter === "sent" && q.outcome_status !== "sent") return false;
    if (filter === "overdue" && !((q.outcome_status === "pending" || q.outcome_status === "drafted") && (q.days_since_discharge ?? 0) > 2)) return false;
    if (search && !(
      (q.patient_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (q.referring_doctor_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      q.patient_account_number.includes(search)
    )) return false;
    return true;
  });

  const openComposer = (q: QueueItem) => {
    setActiveCase(q);
    setBody(generateOutcomeBody(q));
    setChannel("fax");
    setSavingState("idle");
  };

  const saveReport = async (status: "sent" | "drafted" | "skipped") => {
    if (!activeCase) return;
    setSavingState("saving");
    const payload: any = {
      case_id: activeCase.case_id,
      physician_npi: activeCase.referring_doctor_npi,
      status,
      channel: status === "sent" ? channel : null,
      body_text: body,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      sent_by: status === "sent" ? "Jordan" : null,
      notes: null,
    };
    // Update if existing, insert if not
    const { error } = activeCase.outcome_report_id
      ? await supabase.from("outcome_reports").update(payload).eq("id", activeCase.outcome_report_id)
      : await supabase.from("outcome_reports").insert(payload);
    if (error) { setError(error.message); setSavingState("idle"); return; }
    setSavingState("done");
    setActiveCase(null);
    reload();
  };

  const badge = (s: string) => {
    const style = ({
      sent: "bg-green-100 text-green-800",
      drafted: "bg-yellow-100 text-yellow-800",
      pending: "bg-red-100 text-red-800",
      skipped: "bg-gray-100 text-gray-700",
    } as any)[s] || "bg-gray-100 text-gray-700";
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${style}`}>{s}</span>;
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-3">
          <Link href="/" className="text-sm hover:underline" style={{ color: ORANGE }}>← Back to dashboard</Link>
        </div>
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Outcome Loop — Work Queue</h1>
          <div className="text-gray-300 text-sm">Recently-discharged cases. Send an outcome report back to the referring physician within 72 hours.</div>
        </header>

        {/* Stats + controls */}
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-3 text-sm">
          {stats && (
            <>
              <span><span className="font-bold">{stats.total_discharges}</span> discharges</span>
              <span>· <span className="font-bold text-red-700">{stats.pending}</span> pending</span>
              <span>· <span className="font-bold text-yellow-700">{stats.drafted}</span> drafted</span>
              <span>· <span className="font-bold text-green-700">{stats.sent}</span> sent</span>
              <span className="text-red-700">· <span className="font-bold">{stats.overdue_48hr}</span> overdue 48hr</span>
            </>
          )}
          <div className="ml-auto flex gap-1">
            {(["pending", "overdue", "all", "sent"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={"px-3 py-1 rounded text-xs " + (filter === f ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
                style={filter === f ? { backgroundColor: ORANGE } : {}}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white border-x border-b px-6 py-3 flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <span className="text-gray-400">→</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="border rounded px-2 py-1 text-xs" />
          <input placeholder="Search patient, physician, account…" value={search} onChange={e => setSearch(e.target.value)}
            className="border rounded px-2 py-1 text-xs flex-1 min-w-60" />
          <span className="text-xs text-gray-500">{visible.length} showing</span>
        </div>

        <div className="bg-white rounded-b-lg shadow-lg">
          {loading && <div className="p-12 text-center text-gray-500">Loading…</div>}
          {error && <div className="m-4 bg-red-50 border border-red-200 rounded p-4 text-red-800">Error: {error}</div>}

          {!loading && !error && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Discharged</th>
                    <th className="px-2 py-2 text-left">Patient</th>
                    <th className="px-2 py-2 text-left">Referrer</th>
                    <th className="px-2 py-2 text-left">Clinic</th>
                    <th className="px-2 py-2 text-right">Visits</th>
                    <th className="px-2 py-2 text-left">Reason</th>
                    <th className="px-2 py-2 text-right">Days since</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 200).map((q, i) => (
                    <tr key={q.case_id} className={i % 2 === 0 ? "bg-white" : "bg-orange-50"} style={q.physician_departed ? { opacity: 0.4 } : {}}>
                      <td className="px-2 py-2">{badge(q.outcome_status)}</td>
                      <td className="px-2 py-2 text-xs">{q.discharge_date}</td>
                      <td className="px-2 py-2">{q.patient_name ?? q.patient_account_number}</td>
                      <td className="px-2 py-2 text-xs">
                        {q.referring_doctor_npi ? (
                          <Link href={`/physician/${q.referring_doctor_npi}`} className="hover:underline" style={{ color: ORANGE }}>
                            {q.referring_doctor_name ?? q.physician_name ?? q.referring_doctor_npi}
                          </Link>
                        ) : (q.referring_doctor_name ?? "—")}
                        {q.physician_departed && <span className="ml-1 text-red-600">❌</span>}
                      </td>
                      <td className="px-2 py-2 text-xs">{q.case_facility.replace("Tristar PT - ", "")}</td>
                      <td className="px-2 py-2 text-right">{q.arrived_visits}</td>
                      <td className="px-2 py-2 text-xs">{q.discharge_reason ?? "—"}</td>
                      <td className="px-2 py-2 text-right" style={(q.days_since_discharge ?? 0) > 2 ? { color: "#CC0000", fontWeight: "bold" } : {}}>{q.days_since_discharge}</td>
                      <td className="px-2 py-2">
                        {!q.physician_departed && (
                          <button onClick={() => openComposer(q)} className="text-xs font-semibold px-2 py-1 rounded text-white" style={{ backgroundColor: ORANGE }}>
                            {q.outcome_status === "sent" ? "Re-open" : "Compose"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length > 200 && (
                <div className="text-center text-xs text-gray-500 py-2">Showing first 200 of {visible.length}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer modal */}
      {activeCase && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-20 p-4 overflow-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-auto">
            <div className="px-6 py-4 border-b" style={{ backgroundColor: ORANGE, color: "white" }}>
              <h2 className="font-bold">Outcome Report — {activeCase.patient_name ?? activeCase.patient_account_number}</h2>
              <div className="text-sm opacity-90">
                To: {activeCase.referring_doctor_name ?? activeCase.physician_name ?? "—"} (NPI {activeCase.referring_doctor_npi ?? "?"})
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">Channel:</span>
                {(["fax", "email", "portal", "phone", "in_person"] as const).map(c => (
                  <label key={c} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} />
                    <span className="capitalize">{c.replace("_", " ")}</span>
                  </label>
                ))}
              </div>
              <textarea value={body} onChange={e => setBody(e.target.value)}
                className="w-full border rounded p-3 font-mono text-sm" rows={16} />
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setActiveCase(null)} className="px-3 py-2 text-sm bg-gray-200 rounded">Cancel</button>
                <div className="flex gap-2">
                  <button onClick={() => saveReport("skipped")} disabled={savingState === "saving"}
                    className="px-3 py-2 text-sm bg-gray-200 rounded">Skip</button>
                  <button onClick={() => saveReport("drafted")} disabled={savingState === "saving"}
                    className="px-3 py-2 text-sm bg-yellow-100 rounded">Save draft</button>
                  <button onClick={() => saveReport("sent")} disabled={savingState === "saving"}
                    className="px-3 py-2 text-sm text-white rounded" style={{ backgroundColor: ORANGE }}>
                    {savingState === "saving" ? "Saving…" : "Mark as sent"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                This records the outcome report against the case + physician. Actual delivery (fax/email) happens outside the app for now.
                "Mark as sent" is what the dashboard uses to measure outcome-loop coverage.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
