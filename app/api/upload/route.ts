import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEPARTED: Record<string, string> = {
  "1407495492": "Departed May 2025",
  "1528080777": "No longer practicing (Apr 2026)",
};

function normalizeNpi(v: any): string | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/\.0$/, "");
  if (!s || s === "nan" || s === "None") return null;
  return s;
}

function toDate(v: any): string | null {
  if (v == null || v === "") return null;
  // SheetJS returns either Date object or serial number depending on options
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  // String fallback
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function num(v: any): number {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const password = fd.get("password") as string;
    const file = fd.get("file") as File | null;

    if (process.env.UPLOAD_PASSWORD && password !== process.env.UPLOAD_PASSWORD) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Parse XLSX
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });

    if (rows.length === 0) {
      return NextResponse.json({ error: "XLSX has no rows" }, { status: 400 });
    }

    // Map from Created Cases Report column names to DB columns
    const cases = rows
      .filter(r => r["Patient Account Number"])
      .map(r => {
        const npi = normalizeNpi(r["Referring Doctor NPI"]);
        return {
          patient_account_number: String(r["Patient Account Number"]),
          patient_name: r["Patient Name"] || null,
          case_title: r["Case Title"] || null,
          case_therapist: r["Case Therapist"] || null,
          case_facility: r["Case Facility"] || "",
          case_status: r["Case Status"] || null,
          discipline: r["Discipline"] || null,
          patient_diagnosis_category: r["Patient Diagnosis Category"] || null,
          primary_insurance: r["Primary Insurance"] || null,
          primary_payer_type: r["Primary Payer Type"] || null,
          primary_plan_name: r["Primary Plan Name"] || null,
          secondary_payer_type: r["Secondary Payer Type"] || null,
          referring_doctor_name: r["Referring Doctor"] || null,
          referring_doctor_npi: npi,
          referral_source: r["Referral Source"] || null,
          arrived_visits: num(r["Arrived Visits"]),
          scheduled_visits: num(r["Scheduled Visits"]),
          created_date: toDate(r["Created Date"]),
          date_of_initial_eval: toDate(r["Date of Initial Eval"]),
          date_of_first_scheduled_visit: toDate(r["Date of First Scheduled Visit"]),
          date_of_first_arrived_visit: toDate(r["Date of First Arrived Visit"]),
          discharge_date: toDate(r["Discharge Date"]),
          discharge_reason: r["Discharge Reason"] || null,
          discharge_note_generated: r["Discharge Note Generated"] === true ? true : (r["Discharge Note Generated"] === false ? false : null),
          missed_visit_alerted: r["Missed Visit Alerted"] || null,
          rtm_status: r["RTM Status"] || null,
          related_cause: r["Related Cause"] || null,
        };
      });

    // Extract physicians from rows that have an NPI (not just Doctors Office)
    const physMap = new Map<string, any>();
    for (const c of cases) {
      const npi = c.referring_doctor_npi;
      if (!npi || physMap.has(npi)) continue;
      physMap.set(npi, {
        npi,
        name: c.referring_doctor_name || "",
        departed: !!DEPARTED[npi],
        departure_note: DEPARTED[npi] || null,
      });
    }
    const physicians = Array.from(physMap.values());

    // Date range for the response
    const dates = cases.map(c => c.created_date).filter(Boolean) as string[];
    const minDate = dates.sort()[0];
    const maxDate = dates.sort()[dates.length - 1];

    // Upsert via admin client (bypasses RLS)
    const supa = createAdminClient();

    let physiciansUpserted = 0;
    let casesUpserted = 0;
    let errors = 0;

    // Physicians first (FK target)
    for (const batch of chunk(physicians, 200)) {
      const { error } = await supa.from("physicians").upsert(batch, { onConflict: "npi", ignoreDuplicates: false });
      if (error) {
        console.error("Physician upsert error:", error);
        errors++;
      } else {
        physiciansUpserted += batch.length;
      }
    }

    for (const batch of chunk(cases, 200)) {
      const { error } = await supa.from("cases").upsert(batch, { onConflict: "patient_account_number", ignoreDuplicates: false });
      if (error) {
        console.error("Case upsert error:", error);
        errors++;
      } else {
        casesUpserted += batch.length;
      }
    }

    // Trigger ISR revalidation on the home page
    try { revalidatePath("/"); } catch {}

    return NextResponse.json({
      ok: true,
      casesTotal: cases.length,
      casesUpserted,
      physiciansUpserted,
      minDate,
      maxDate,
      errors,
      sheet: sheetName,
    });
  } catch (e: any) {
    console.error("Upload handler error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
