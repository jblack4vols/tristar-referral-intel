"use client";
import { useState, useEffect, useRef } from "react";

const ORANGE = "#FF8200";
const STORAGE_KEY = "tristar-referral-saved-views";

export type SavedView = {
  id: string;
  name: string;
  search: string; // URL search params
  created_at: string;
};

type Props = {
  currentSearch: string; // current URL search params string
  onLoad: (search: string) => void;
};

function loadAll(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAll(views: SavedView[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function SavedViews({ currentSearch, onLoad }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setViews(loadAll()); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = () => {
    if (!newName.trim()) return;
    const v: SavedView = {
      id: Math.random().toString(36).slice(2, 10),
      name: newName.trim(),
      search: currentSearch,
      created_at: new Date().toISOString(),
    };
    const next = [v, ...views];
    setViews(next); saveAll(next); setNewName("");
  };
  const remove = (id: string) => {
    const next = views.filter(v => v.id !== id);
    setViews(next); saveAll(next);
  };

  const copyLink = (v: SavedView) => {
    const url = window.location.origin + "/" + v.search;
    navigator.clipboard.writeText(url);
  };

  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => setOpen(o => !o)} className="px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200">
        📑 Views ({views.length}) ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-xl p-3 w-80 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">Saved views</div>
            <button onClick={() => setOpen(false)} className="text-xs text-gray-500">Close</button>
          </div>
          <div className="flex gap-1 mb-3">
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
              placeholder="Save current view as…"
              className="flex-1 border rounded px-2 py-1 text-xs"
            />
            <button onClick={save} className="px-3 py-1 text-xs rounded text-white" style={{ backgroundColor: ORANGE }}>Save</button>
          </div>
          <div className="overflow-auto flex-1 -mx-1">
            {views.length === 0 ? (
              <div className="text-xs text-gray-400 p-2">No saved views yet. Set your filters, then save this view.</div>
            ) : views.map(v => (
              <div key={v.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded text-sm">
                <button onClick={() => { onLoad(v.search); setOpen(false); }}
                  className="flex-1 text-left truncate hover:underline" style={{ color: ORANGE }}>
                  {v.name}
                </button>
                <button onClick={() => copyLink(v)} className="text-xs text-gray-500 hover:text-black" title="Copy link">🔗</button>
                <button onClick={() => remove(v.id)} className="text-xs text-red-600 hover:text-red-800" title="Delete">×</button>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-2 border-t pt-2">
            Views are stored in your browser only. Use 🔗 to copy a sharable link.
          </div>
        </div>
      )}
    </div>
  );
}
