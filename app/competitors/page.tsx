"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Snapshot = {
  id: number;
  date: string;
  followers: number | null;
  top_post_url: string | null;
  top_post_note: string | null;
};

type Competitor = {
  id: number;
  name: string;
  username: string | null;
  notes: string | null;
  snapshots: Snapshot[];
};

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newComp, setNewComp] = useState({ name: "", username: "", notes: "" });
  const [snapshotForms, setSnapshotForms] = useState<Record<number, any>>({});

  function load() {
    fetch("/api/competitors")
      .then((r) => r.json())
      .then((d) => setCompetitors(d.competitors || []));
  }

  useEffect(load, []);

  async function addCompetitor(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "competitor", ...newComp }),
    });
    setNewComp({ name: "", username: "", notes: "" });
    setShowNewForm(false);
    load();
  }

  async function addSnapshot(competitorId: number) {
    const form = snapshotForms[competitorId] || {};
    if (!form.date) return;
    await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "snapshot", competitor_id: competitorId, ...form }),
    });
    setSnapshotForms({ ...snapshotForms, [competitorId]: {} });
    load();
  }

  async function deleteCompetitor(id: number) {
    await fetch(`/api/competitors?id=${id}&type=competitor`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen bg-ink text-paper p-6 md:p-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl">Конкуренты</h1>
          <p className="text-muted text-sm mt-1">
            Ручной трекер — Instagram API не даёт данные по чужим аккаунтам, поэтому цифры
            вносятся вручную, когда заходите к конкуренту
          </p>
        </div>
        <Link href="/dashboard" className="text-muted hover:text-paper text-sm">
          ← К дашборду
        </Link>
      </header>

      <button
        onClick={() => setShowNewForm((v) => !v)}
        className="bg-accent text-white px-4 py-2 rounded font-medium mb-6"
      >
        {showNewForm ? "Отмена" : "+ Добавить конкурента"}
      </button>

      {showNewForm && (
        <form
          onSubmit={addCompetitor}
          className="border border-line rounded-lg p-4 bg-panel mb-8 grid grid-cols-1 md:grid-cols-4 gap-2"
        >
          <input
            required
            placeholder="Название/бренд"
            value={newComp.name}
            onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
            className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="@username"
            value={newComp.username}
            onChange={(e) => setNewComp({ ...newComp, username: e.target.value })}
            className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Заметки"
            value={newComp.notes}
            onChange={(e) => setNewComp({ ...newComp, notes: e.target.value })}
            className="bg-ink border border-line rounded px-2 py-1.5 text-sm md:col-span-2"
          />
          <button type="submit" className="md:col-span-4 bg-good text-white rounded py-1.5 text-sm">
            Сохранить
          </button>
        </form>
      )}

      <div className="space-y-6">
        {competitors.map((c) => (
          <div key={c.id} className="border border-line rounded-lg p-4 md:p-6 bg-panel">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-xl">{c.name}</h2>
                {c.username && <p className="text-muted text-sm">@{c.username}</p>}
              </div>
              <button
                onClick={() => deleteCompetitor(c.id)}
                className="text-muted hover:text-warn text-sm"
              >
                Удалить
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
              <input
                type="date"
                value={snapshotForms[c.id]?.date || ""}
                onChange={(e) =>
                  setSnapshotForms({
                    ...snapshotForms,
                    [c.id]: { ...snapshotForms[c.id], date: e.target.value },
                  })
                }
                className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Подписчиков"
                value={snapshotForms[c.id]?.followers || ""}
                onChange={(e) =>
                  setSnapshotForms({
                    ...snapshotForms,
                    [c.id]: { ...snapshotForms[c.id], followers: e.target.value },
                  })
                }
                className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Ссылка на залетевший пост"
                value={snapshotForms[c.id]?.top_post_url || ""}
                onChange={(e) =>
                  setSnapshotForms({
                    ...snapshotForms,
                    [c.id]: { ...snapshotForms[c.id], top_post_url: e.target.value },
                  })
                }
                className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => addSnapshot(c.id)}
                className="bg-accent text-white rounded py-1.5 text-sm"
              >
                Добавить снимок
              </button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-line">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4">Подписчиков</th>
                  <th className="py-2 pr-4">Залетевший пост</th>
                </tr>
              </thead>
              <tbody>
                {c.snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-line/50">
                    <td className="py-2 pr-4 text-muted">{s.date}</td>
                    <td className="py-2 pr-4">{s.followers?.toLocaleString("ru-RU") ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {s.top_post_url ? (
                        <a href={s.top_post_url} target="_blank" rel="noreferrer" className="text-accent">
                          ссылка
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.snapshots.length === 0 && (
              <p className="text-muted text-sm py-4">Пока нет снимков.</p>
            )}
          </div>
        ))}
        {competitors.length === 0 && (
          <p className="text-muted text-sm">Пока нет добавленных конкурентов.</p>
        )}
      </div>
    </div>
  );
}
