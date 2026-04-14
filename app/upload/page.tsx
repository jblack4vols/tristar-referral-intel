"use client";
import { useState, useRef } from "react";

const ORANGE = "#FF8200";

export default function UploadPage() {
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Pick a file first."); return; }
    if (!password) { setError("Enter the upload password."); return; }
    setStatus("uploading");
    setError("");
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("password", password);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await r.json();
      if (!r.ok) {
        setStatus("error");
        setError(json.error || "Upload failed");
        return;
      }
      setStatus("done");
      setResult(json);
      // Reset file picker
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
    } catch (err: any) {
      setStatus("error");
      setError(err.message || String(err));
    }
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-3xl mx-auto">
        <header className="bg-black rounded-t-lg px-6 py-4">
          <h1 className="text-white text-2xl font-bold">Upload Referral Report</h1>
          <div className="text-gray-300 text-sm">
            Drop a Created Cases Report XLSX from Prompt EMR. The dashboard refreshes within ~5 minutes.
          </div>
        </header>

        <div className="bg-white rounded-b-lg shadow-lg p-6">
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Upload password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Set in Vercel env: UPLOAD_PASSWORD"
                className="w-full px-3 py-2 border rounded"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Created Cases Report (.xlsx)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border rounded"
              />
              {file && (
                <div className="text-xs text-gray-500 mt-1">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={status === "uploading"}
              className="px-6 py-2 font-semibold text-white rounded transition-opacity disabled:opacity-50"
              style={{ backgroundColor: ORANGE }}
            >
              {status === "uploading" ? "Processing…" : "Upload & Refresh Dashboard"}
            </button>
          </form>

          {status === "uploading" && (
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">
              ⏳ Parsing and upserting. This usually takes 30–90 seconds for a Created Cases Report.
              Don't close the tab.
            </div>
          )}

          {status === "done" && result && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded p-4">
              <div className="font-bold text-green-800 mb-2">✅ Upload complete</div>
              <div className="text-sm space-y-1 text-gray-700">
                <div>Cases parsed: <strong>{result.casesTotal}</strong></div>
                <div>Cases inserted/updated: <strong>{result.casesUpserted}</strong></div>
                <div>Physicians inserted/updated: <strong>{result.physiciansUpserted}</strong></div>
                <div>Date range: <strong>{result.minDate} → {result.maxDate}</strong></div>
                {result.errors > 0 && (
                  <div className="text-red-700">Errors: {result.errors} — see console</div>
                )}
              </div>
              <a href="/" className="inline-block mt-3 text-sm font-semibold" style={{ color: ORANGE }}>
                → View dashboard (refreshes within 5 min)
              </a>
            </div>
          )}

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">
              ❌ {error}
            </div>
          )}

          <div className="mt-6 text-xs text-gray-500 border-t pt-4">
            <p className="font-semibold mb-1">How it works</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The XLSX is parsed server-side using SheetJS</li>
              <li>Upserts use <code>patient_account_number</code> for cases and <code>npi</code> for physicians — running with the same file twice does not duplicate</li>
              <li>Caldwell + Grimaldi stay flagged as departed</li>
              <li>The dashboard's home page caches for 5 minutes (ISR), so changes appear within that window</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
