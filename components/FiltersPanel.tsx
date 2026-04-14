"use client";
import { useState, useMemo } from "react";

const ORANGE = "#FF8200";

export type FilterState = {
  sources: string[];
  payers: string[];
  clinics: string[];
  specialties: string[];
  therapists: string[];
  npis: string[];
  diagnoses: string[];
  statuses: string[];
};

export type FilterOption = { dimension: string; value: string; label: string; total_cases: number };

type Props = {
  filters: FilterState;
  options: FilterOption[];
  onChange: (f: FilterState) => void;
};

type Dim = keyof FilterState;

const DIM_MAP: { key: Dim; dbKey: string; label: string; shortLabel: string }[] = [
  { key: "sources", dbKey: "source", label: "Referral sources", shortLabel: "Sources" },
  { key: "payers", dbKey: "payer", label: "Payers", shortLabel: "Payers" },
  { key: "clinics", dbKey: "clinic", label: "Clinics", shortLabel: "Clinics" },
  { key: "specialties", dbKey: "specialty", label: "Physician specialties", shortLabel: "Specialties" },
  { key: "therapists", dbKey: "therapist", label: "Therapists", shortLabel: "Therapists" },
  { key: "diagnoses", dbKey: "diagnosis", label: "Diagnosis categories", shortLabel: "Diagnosis" },
  { key: "statuses", dbKey: "status", label: "Case statuses", shortLabel: "Status" },
];

export function FiltersPanel({ filters, options, onChange }: Props) {
  const [open, setOpen] = useState<Dim | null>(null);
  const [search, setSearch] = useState<Record<Dim, string>>({
    sources: "", payers: "", clinics: "", specialties: "", therapists: "", npis: "", diagnoses: "", statuses: "",
  });

  const byDim = useMemo(() => {
    const m: Record<string, FilterOption[]> = {};
    for (const o of options) {
      if (!m[o.dimension]) m[o.dimension] = [];
      m[o.dimension].push(o);
    }
    return m;
  }, [options]);

  const toggle = (dim: Dim, value: string) => {
    const current = filters[dim];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    onChange({ ...filters, [dim]: next });
  };

  const clearDim = (dim: Dim) => onChange({ ...filters, [dim]: [] });
  const clearAll = () => onChange({
    sources: [], payers: [], clinics: [], specialties: [], therapists: [], npis: [], diagnoses: [], statuses: [],
  });

  const activeCount = Object.values(filters).reduce((s, v) => s + v.length, 0);
  const chipLabel = (dim: Dim, sl: string) => {
    const n = filters[dim].length;
    if (n === 0) return sl;
    if (n === 1) return `${sl}: ${filters[dim][0].length > 20 ? filters[dim][0].slice(0, 18) + "…" : filters[dim][0]}`;
    return `${sl}: ${n}`;
  };

  return (
    <div className="bg-white border-x border-b px-6 py-3 text-sm relative">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-700 mr-1">Filters:</span>
        {DIM_MAP.map(({ key, dbKey, shortLabel }) => {
          const hasSelection = filters[key].length > 0;
          return (
            <button key={key} onClick={() => setOpen(open === key ? null : key)}
              className={"px-3 py-1 rounded text-xs transition-colors " + (hasSelection ? "text-white" : "bg-gray-100 hover:bg-gray-200")}
              style={hasSelection ? { backgroundColor: ORANGE } : {}}>
              {chipLabel(key, shortLabel)} ▾
            </button>
          );
        })}
        {activeCount > 0 && (
          <button onClick={clearAll} className="px-2 py-1 rounded text-xs text-red-700 hover:bg-red-50 ml-1">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-6 top-full mt-1 z-20 bg-white border rounded-lg shadow-xl p-3 w-[min(480px,calc(100vw-3rem))] max-h-[420px] overflow-hidden flex flex-col"
          onMouseLeave={() => { /* keep open; user closes */ }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">{DIM_MAP.find(d => d.key === open)?.label}</div>
            <div className="flex gap-2 text-xs">
              {filters[open].length > 0 && (
                <button onClick={() => clearDim(open)} className="text-red-700 hover:underline">Clear</button>
              )}
              <button onClick={() => setOpen(null)} className="text-gray-500 hover:underline">Close</button>
            </div>
          </div>
          <input
            type="text"
            value={search[open]}
            onChange={e => setSearch({ ...search, [open]: e.target.value })}
            placeholder="Search…"
            className="w-full border rounded px-2 py-1 text-sm mb-2"
            autoFocus
          />
          <div className="overflow-auto flex-1 -mx-1">
            {(() => {
              const dbKey = DIM_MAP.find(d => d.key === open)!.dbKey;
              const opts = (byDim[dbKey] ?? []).filter(o =>
                !search[open] || o.label.toLowerCase().includes(search[open].toLowerCase())
              );
              if (opts.length === 0) return <div className="text-xs text-gray-400 p-2">No options</div>;
              return opts.map(o => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={filters[open].includes(o.value)}
                    onChange={() => toggle(open, o.value)}
                  />
                  <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                  <span className="text-xs text-gray-500">{o.total_cases.toLocaleString()}</span>
                </label>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
