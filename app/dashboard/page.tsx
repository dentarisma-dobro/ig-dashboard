"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { exportMonthlyPdf } from "@/lib/exportPdf";

type Account = {
  id: string;
  username: string;
  display_name: string;
  latest: {
    reach: number;
    impressions: number;
    follower_count: number;
    profile_views: number;
    date: string;
  } | null;
};

type DailyStat = {
  account_id: string;
  date: string;
  reach: number;
  impressions: number;
  follower_count: number;
  profile_views: number;
  accounts: { username: string; display_name: string };
};

type Post = {
  id: string;
  account_id: string;
  caption: string;
  permalink: string;
  thumbnail_url: string;
  posted_at: string;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  reach: number;
  accounts: { username: string; display_name: string };
};

type StoryRow = {
  id: string;
  account_id: string;
  posted_at: string;
  reach: number;
  replies: number;
  exits: number;
  accounts: { username: string; display_name: string };
};

const METRIC_LABELS: Record<string, string> = {
  reach: "Охват",
  impressions: "Показы",
  follower_count: "Подписчики",
  profile_views: "Визиты в профиль",
};

const PALETTE = ["#2F6FED", "#3FB68B", "#F2994A"];

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<keyof typeof METRIC_LABELS>("reach");
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [postSort, setPostSort] = useState<"likes" | "comments" | "saved" | "reach">(
    "reach"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?days=${days}`)
      .then((r) => r.json())
      .then((d) => setStats(d.stats || []));

    const postsUrl =
      selected === "all" ? "/api/posts?limit=60" : `/api/posts?account=${selected}&limit=60`;
    fetch(postsUrl)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []));

    const storiesUrl =
      selected === "all"
        ? `/api/stories?days=${days}`
        : `/api/stories?account=${selected}&days=${days}`;
    fetch(storiesUrl)
      .then((r) => r.json())
      .then((d) => {
        setStories(d.stories || []);
        setLoading(false);
      });
  }, [selected, days]);

  // Готовим данные графика: одна строка на дату, колонка на каждый аккаунт
  const chartData = useMemo(() => {
    const byDate: Record<string, any> = {};
    for (const row of stats) {
      if (selected !== "all" && row.account_id !== selected) continue;
      if (!byDate[row.date]) byDate[row.date] = { date: row.date };
      byDate[row.date][row.accounts?.display_name || row.account_id] = (row as any)[
        metric
      ];
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [stats, metric, selected]);

  const accountNames = useMemo(
    () => Array.from(new Set(stats.map((s) => s.accounts?.display_name).filter(Boolean))),
    [stats]
  );

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => (b[postSort] || 0) - (a[postSort] || 0)),
    [posts, postSort]
  );

  return (
    <div className="min-h-screen bg-ink text-paper p-6 md:p-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl">Статистика Instagram</h1>
          <p className="text-muted text-sm mt-1">
            {accounts.length} аккаунта · обновляется ежедневно
          </p>
        </div>
        <button
          onClick={() => exportMonthlyPdf({ accounts, stats, posts, selected, days })}
          className="bg-accent text-white px-4 py-2 rounded font-medium hover:opacity-90 transition self-start"
        >
          Скачать отчёт за период (PDF)
        </button>
      </header>

      {/* Переключатель аккаунтов */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setSelected("all")}
          className={`px-4 py-2 rounded border text-sm ${
            selected === "all"
              ? "bg-accent border-accent text-white"
              : "border-line text-muted hover:text-paper"
          }`}
        >
          Все аккаунты
        </button>
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelected(a.id)}
            className={`px-4 py-2 rounded border text-sm ${
              selected === a.id
                ? "bg-accent border-accent text-white"
                : "border-line text-muted hover:text-paper"
            }`}
          >
            {a.display_name}
          </button>
        ))}
      </div>

      {/* Карточки сводки */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {(selected === "all" ? accounts : accounts.filter((a) => a.id === selected)).map(
          (a) => (
            <div key={a.id} className="border border-line rounded-lg p-4 bg-panel">
              <p className="text-muted text-xs mb-2">{a.display_name}</p>
              <p className="text-2xl font-display">
                {a.latest?.follower_count?.toLocaleString("ru-RU") ?? "—"}
              </p>
              <p className="text-muted text-xs">подписчиков</p>
              <div className="mt-3 flex gap-4 text-xs text-muted">
                <span>Охват: {a.latest?.reach?.toLocaleString("ru-RU") ?? "—"}</span>
                <span>Показы: {a.latest?.impressions?.toLocaleString("ru-RU") ?? "—"}</span>
              </div>
            </div>
          )
        )}
      </div>

      {/* График по метрике */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMetric(key as any)}
                className={`px-3 py-1.5 rounded text-sm ${
                  metric === key ? "bg-accent text-white" : "text-muted hover:text-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded text-sm ${
                  days === d ? "bg-accent text-white" : "text-muted hover:text-paper"
                }`}
              >
                {d} дн.
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#2B3742" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#8B98A5" fontSize={12} />
            <YAxis stroke="#8B98A5" fontSize={12} />
            <Tooltip
              contentStyle={{ background: "#1B2530", border: "1px solid #2B3742" }}
            />
            <Legend />
            {(selected === "all" ? accountNames : [accounts.find((a) => a.id === selected)?.display_name]).map(
              (name, i) =>
                name && (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Таблица постов */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Посты</h2>
          <div className="flex gap-2 text-sm">
            {(["reach", "likes", "comments", "saved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPostSort(s)}
                className={`px-3 py-1.5 rounded ${
                  postSort === s ? "bg-accent text-white" : "text-muted hover:text-paper"
                }`}
              >
                {s === "reach" ? "Охват" : s === "likes" ? "Лайки" : s === "comments" ? "Комментарии" : "Сохранения"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left border-b border-line">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Аккаунт</th>
                <th className="py-2 pr-4">Подпись</th>
                <th className="py-2 pr-4">Охват</th>
                <th className="py-2 pr-4">Лайки</th>
                <th className="py-2 pr-4">Комм.</th>
                <th className="py-2 pr-4">Сохр.</th>
              </tr>
            </thead>
            <tbody>
              {sortedPosts.slice(0, 25).map((p) => (
                <tr key={p.id} className="border-b border-line/50">
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    {new Date(p.posted_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{p.accounts?.display_name}</td>
                  <td className="py-2 pr-4 max-w-xs truncate">{p.caption || "—"}</td>
                  <td className="py-2 pr-4">{p.reach?.toLocaleString("ru-RU")}</td>
                  <td className="py-2 pr-4">{p.likes?.toLocaleString("ru-RU")}</td>
                  <td className="py-2 pr-4">{p.comments?.toLocaleString("ru-RU")}</td>
                  <td className="py-2 pr-4">{p.saved?.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedPosts.length === 0 && !loading && (
            <p className="text-muted text-sm py-6 text-center">
              Пока нет данных — они появятся после первого сбора статистики.
            </p>
          )}
        </div>
      </div>

      {/* Stories */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel">
        <h2 className="font-display text-xl mb-4">Stories за период</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left border-b border-line">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Аккаунт</th>
                <th className="py-2 pr-4">Охват</th>
                <th className="py-2 pr-4">Ответы</th>
                <th className="py-2 pr-4">Выходы</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => (
                <tr key={s.id} className="border-b border-line/50">
                  <td className="py-2 pr-4 text-muted whitespace-nowrap">
                    {new Date(s.posted_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="py-2 pr-4">{s.accounts?.display_name}</td>
                  <td className="py-2 pr-4">{s.reach?.toLocaleString("ru-RU")}</td>
                  <td className="py-2 pr-4">{s.replies?.toLocaleString("ru-RU")}</td>
                  <td className="py-2 pr-4">{s.exits?.toLocaleString("ru-RU")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stories.length === 0 && !loading && (
            <p className="text-muted text-sm py-6 text-center">
              Stories живут только 24 часа, поэтому здесь появятся только те, что были
              собраны после запуска сайта.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
