import { supabase } from "@/lib/supabase";
import Dashboard from "@/components/Dashboard";

export const revalidate = 300; // 5 min cache

async function getData() {
  const [summary, physicians, locations, monthly, funnel] = await Promise.all([
    supabase.from("v_summary").select("*").single(),
    supabase.from("v_physician_ytd").select("*").order("evals_curr", { ascending: false }),
    supabase.from("v_location_scorecard").select("*"),
    supabase.from("v_monthly_trend").select("*"),
    supabase.from("v_funnel").select("*"),
  ]);

  return {
    summary: summary.data ?? null,
    physicians: physicians.data ?? [],
    locations: locations.data ?? [],
    monthly: monthly.data ?? [],
    funnel: funnel.data ?? [],
    error: summary.error || physicians.error || locations.error || monthly.error || funnel.error,
  };
}

export default async function HomePage() {
  const data = await getData();

  if (data.error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-600">
          <h1 className="text-2xl font-bold text-red-700 mb-2">Data Load Error</h1>
          <p className="text-sm text-gray-700 mb-2">The dashboard could not load data from Supabase.</p>
          <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">{JSON.stringify(data.error, null, 2)}</pre>
          <p className="text-sm text-gray-600 mt-3">Check <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> environment variables in Vercel.</p>
        </div>
      </div>
    );
  }

  return <Dashboard data={data} />;
}
