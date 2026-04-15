"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const ORANGE = "#FF8200";

function Inner() {
  const [callSheet, setCallSheet] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ytdStart = `${new Date().getFullYear()}-01-01`;
    const priorStart = `${new Date().getFullYear() - 1}-01-01`;
    const priorEnd = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    supabase.rpc("rpc_physician_stats_v3", {
      curr_start: ytdStart, curr_end: today, prior_start: priorStart, prior_end: priorEnd,
      source_filter: ["Doctors Office"], payer_filter: null, clinic_filter: null, specialty_filter: null, therapist_filter: null, npi_filter: null, dx_filter: null, status_filter: null,
    }).then(({ data }) => {
      const rows = (data ?? [])
        .filter((r: any) => !r.departed && (r.decline_flag || r.growth_flag))
        .map((r: any) => ({
          ...r,
          priority: r.decline_flag === "GONE_DARK" ? "Critical" :
                    r.decline_flag === "SHARP_DECLINE" ? "High" :
                    "Medium",
        }))
        .sort((a: any, b: any) => ["Critical", "High", "Medium"].indexOf(a.priority) - ["Critical", "High", "Medium"].indexOf(b.priority) || b.evals_prior - a.evals_prior)
        .slice(0, 20);
      setCallSheet(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      supabase.from("physicians").select("npi, name, specialty, city")
        .or(`name.ilike.%${search}%,npi.like.%${search}%`).limit(10)
        .then(({ data }) => setSearchResults(data ?? []));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const bg = (p: string) => ({ Critical: "#FEE2E2", High: "#FFE4C4", Medium: "#FEF3C7" } as any)[p];

  return (
    <div className="min-h-screen bg-orange-50">
      <div className="max-w-md mx-auto px-3 py-3">
        <div className="sticky top-0 bg-black text-white px-3 py-2 rounded mb-3">
          <div className="flex items-center justify-between">
            <div className="font-bold">Tristar — Field</div>
            <Link href="/" className="text-xs text-gray-300">Desktop →</Link>
          </div>
        </div>

        <div className="bg-white rounded p-2 mb-3">
          <input
            placeholder="🔍 Search physician by name or NPI…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full text-base border rounded px-3 py-2" />
          {searchResults.length > 0 && (
            <div className="mt-2 border-t pt-2 max-h-64 overflow-auto">
              {searchResults.map(p => (
                <Link key={p.npi} href={`/physician/${p.npi}`}
                  className="block py-2 px-2 hover:bg-orange-50 rounded">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-gray-500">NPI {p.npi} · {p.specialty ?? "—"} · {p.city ?? "—"}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <h2 className="font-bold mb-2" style={{ color: ORANGE }}>Today's Call Sheet</h2>
        {loading && <div className="text-center text-gray-500 py-8">Loading…</div>}
        {!loading && callSheet.map(r => (
          <Link key={r.npi} href={`/physician/${r.npi}`}
            className="block bg-white rounded mb-2 p-3 shadow active:scale-95 transition"
            style={{ borderLeft: `4px solid ${bg(r.priority)}` }}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-bold">{r.physician ?? r.npi}</div>
                <div className="text-xs text-gray-600">{r.decline_flag ?? r.growth_flag}</div>
                <div className="text-xs text-gray-500 mt-1">{r.evals_prior} → {r.evals_curr} evals</div>
              </div>
              <div className="text-xs px-2 py-1 rounded font-semibold" style={{ backgroundColor: bg(r.priority) }}>
                {r.priority}
              </div>
            </div>
          </Link>
        ))}
        {!loading && callSheet.length === 0 && <div className="text-center text-gray-500 py-8">No actionable physicians 🎉</div>}

        <div className="mt-4 bg-white rounded p-2 text-sm">
          <div className="font-bold mb-2" style={{ color: ORANGE }}>Quick links</div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/discharges" className="bg-orange-100 rounded p-3 text-center font-semibold">📬 Outcomes</Link>
            <Link href="/weekly" className="bg-orange-100 rounded p-3 text-center font-semibold">📄 Weekly</Link>
            <Link href="/upload" className="bg-orange-100 rounded p-3 text-center font-semibold">+ Upload</Link>
            <Link href="/" className="bg-gray-100 rounded p-3 text-center font-semibold">Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={null}><Inner/></Suspense>; }
