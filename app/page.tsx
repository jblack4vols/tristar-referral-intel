import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading dashboard…</div>}>
      <Dashboard />
    </Suspense>
  );
}
