"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const ORANGE = "#FF8200";

export function PhysicianNotes({ npi }: { npi: string }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [author, setAuthor] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("physician_notes").select("*").eq("physician_npi", npi).order("created_at", { ascending: false }).limit(50);
    setNotes(data ?? []);
  };
  useEffect(() => { load(); }, [npi]);

  const save = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("physician_notes").insert({ physician_npi: npi, note: newNote.trim(), author: author.trim() || null });
    if (error) { alert(error.message); setSaving(false); return; }
    setNewNote(""); setSaving(false);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await supabase.from("physician_notes").delete().eq("id", id);
    load();
  };

  return (
    <div className="border rounded p-3">
      <h3 className="font-bold mb-2" style={{ color: ORANGE }}>📝 Notes ({notes.length})</h3>
      <div className="flex gap-2 mb-3">
        <input placeholder="Your name (optional)" value={author} onChange={e => setAuthor(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-40" />
        <input placeholder="Add a note — scheduling feedback, conversation notes, etc." value={newNote} onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => e.key === "Enter" && save()}
          className="flex-1 border rounded px-2 py-1 text-sm" />
        <button onClick={save} disabled={saving || !newNote.trim()}
          className="px-3 py-1 text-xs rounded text-white font-semibold disabled:opacity-50" style={{ backgroundColor: ORANGE }}>
          {saving ? "…" : "Add"}
        </button>
      </div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {notes.length === 0 && <div className="text-xs text-gray-400 italic">No notes yet. Add observations from marketer visits, director conversations, or office feedback.</div>}
        {notes.map(n => (
          <div key={n.id} className="border-l-4 border-orange-300 bg-orange-50 p-2 text-sm flex items-start gap-2">
            <div className="flex-1">
              <div>{n.note}</div>
              <div className="text-xs text-gray-500 mt-1">
                {n.author ? `${n.author} · ` : ""}{new Date(n.created_at).toLocaleString()}
              </div>
            </div>
            <button onClick={() => remove(n.id)} className="text-xs text-red-600">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PhysicianActivities({ npi }: { npi: string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    activity_date: new Date().toISOString().slice(0, 10),
    activity_type: "in_person",
    outcome: "",
    next_step: "",
    marketer_name: "",
    notes: "",
  });

  const load = async () => {
    const { data } = await supabase.from("marketer_activities").select("*").eq("physician_npi", npi).order("activity_date", { ascending: false }).limit(100);
    setActivities(data ?? []);
  };
  useEffect(() => { load(); }, [npi]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("marketer_activities").insert({ physician_npi: npi, ...form });
    if (error) { alert(error.message); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setForm({ ...form, outcome: "", next_step: "", notes: "" });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this activity?")) return;
    await supabase.from("marketer_activities").delete().eq("id", id);
    load();
  };

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold" style={{ color: ORANGE }}>📞 Marketer activity log ({activities.length})</h3>
        <button onClick={() => setShowForm(s => !s)} className="px-3 py-1 text-xs rounded text-white font-semibold" style={{ backgroundColor: ORANGE }}>
          {showForm ? "Cancel" : "+ Log activity"}
        </button>
      </div>

      {showForm && (
        <div className="bg-orange-50 border border-orange-200 rounded p-3 mb-3 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <label className="block text-xs text-gray-600">Date</label>
              <input type="date" value={form.activity_date} onChange={e => setForm({ ...form, activity_date: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-600">Type</label>
              <select value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })} className="border rounded px-2 py-1 text-sm w-full">
                {["in_person", "phone", "email", "fax", "lunch", "drop_in", "newsletter", "other"].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600">Marketer name</label>
              <input value={form.marketer_name} onChange={e => setForm({ ...form, marketer_name: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600">Outcome</label>
            <input value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })}
              placeholder="What happened? e.g., 'Had 10-min chat, office manager open to scheduling adjustments'"
              className="border rounded px-2 py-1 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Next step</label>
            <input value={form.next_step} onChange={e => setForm({ ...form, next_step: e.target.value })}
              placeholder="e.g., 'Bring outcomes data at next visit in 30 days'"
              className="border rounded px-2 py-1 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="border rounded px-2 py-1 text-sm w-full" />
          </div>
          <button onClick={save} disabled={saving}
            className="px-3 py-1 text-sm rounded text-white font-semibold disabled:opacity-50" style={{ backgroundColor: ORANGE }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-auto">
        {activities.length === 0 && <div className="text-xs text-gray-400 italic">No activity yet. Log marketer visits to measure ROI over time.</div>}
        {activities.map(a => (
          <div key={a.id} className="border-l-4 border-orange-300 bg-orange-50 p-2 text-sm flex items-start gap-2">
            <div className="flex-1">
              <div className="font-semibold">
                {a.activity_date} · {a.activity_type?.replace(/_/g, " ")}
                {a.marketer_name && <span className="text-xs text-gray-500 ml-2">by {a.marketer_name}</span>}
              </div>
              {a.outcome && <div className="text-sm mt-1"><span className="text-gray-500">Outcome:</span> {a.outcome}</div>}
              {a.next_step && <div className="text-sm"><span className="text-gray-500">Next:</span> {a.next_step}</div>}
              {a.notes && <div className="text-xs text-gray-600 mt-1 italic">{a.notes}</div>}
            </div>
            <button onClick={() => remove(a.id)} className="text-xs text-red-600">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
