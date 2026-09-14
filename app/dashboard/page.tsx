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
import Link from "next/link";
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
  website_clicks: number;
  phone_call_clicks: number;
  text_message_clicks: number;
  email_contacts: number;
  get_directions_clicks: number;
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

type Ad = {
  id: number;
  account_id: string;
  title: string;
  start_date: string;
  end_date: string;
  budget: number | null;
  result_note: string | null;
};

const METRIC_LABELS: Record<string, string> = {
  reach: "Охват",
  impressions: "Показы",
  follower_count: "Подписчики",
  profile_views: "Визиты в профиль",
};

const COMM_LABELS: Record<string, string> = {
  website_clicks: "Клики по ссылке",
  phone_call_clicks: "Звонки",
  text_message_clicks: "SMS",
  email_contacts: "Email",
  get_directions_clicks: "Маршрут",
};

const PALETTE = ["#2F6FED", "#3FB68B", "#F2994A", "#D65DB1", "#00C2CB"];

function engagementOf(p: { likes?: number; comments?: number; saved?: number; shares?: number }) {
  return (p.likes || 0) + (p.comments || 0) + (p.saved || 0) + (p.shares || 0);
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<number | "custom">(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metric, setMetric] = useState<keyof typeof METRIC_LABELS>("reach");
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [bestTime, setBestTime] = useState<{ slots: any[]; reliable: boolean; totalPostsAnalyzed: number } | null>(
    null
  );
  const [postSort, setPostSort] = useState<"likes" | "comments" | "saved" | "reach" | "shares">(
    "reach"
  );
  const [postSortDir, setPostSortDir] = useState<"desc" | "asc">("desc");
  const [showAdForm, setShowAdForm] = useState(false);
  const [adForm, setAdForm] = useState({
    title: "",
    start_date: "",
    end_date: "",
    budget: "",
    result_note: "",
  });

  const effectiveFrom =
    datePreset === "custom"
      ? customFrom
      : new Date(Date.now() - (datePreset as number) * 86400000).toISOString().slice(0, 10);
  const effectiveTo = datePreset === "custom" ? customTo : new Date().toISOString().slice(0, 10);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []));
  }, []);

  useEffect(() => {
    if (datePreset === "custom" && (!customFrom || !customTo)) return;

    const statsUrl = `/api/stats?from=${effectiveFrom}&to=${effectiveTo}`;
    fetch(statsUrl)
      .then((r) => r.json())
      .then((d) => setStats(d.stats || []));

    const postsUrl =
      (selected === "all" ? "/api/posts?limit=100" : `/api/posts?account=${selected}&limit=100`) +
      `&from=${effectiveFrom}&to=${effectiveTo}`;
    fetch(postsUrl)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []));

    const storiesUrl =
      selected === "all" ? `/api/stories?days=90` : `/api/stories?account=${selected}&days=90`;
    fetch(storiesUrl)
      .then((r) => r.json())
      .then((d) => setStories(d.stories || []));

    const adsUrl = selected === "all" ? "/api/ads" : `/api/ads?account=${selected}`;
    fetch(adsUrl)
      .then((r) => r.json())
      .then((d) => setAds(d.ads || []));

    const bestTimeUrl =
      selected === "all" ? "/api/best-time" : `/api/best-time?account=${selected}`;
    fetch(bestTimeUrl)
      .then((r) => r.json())
      .then((d) => setBestTime(d));
  }, [selected, datePreset, customFrom, customTo]);

  const chartData = useMemo(() => {
    const byDate: Record<string, any> = {};
    for (const row of stats) {
      if (selected !== "all" && row.account_id !== selected) continue;
      if (!byDate[row.date]) byDate[row.date] = { date: row.date };
      byDate[row.date][row.accounts?.display_name || row.account_id] = (row as any)[metric];
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [stats, metric, selected]);

  const commChartData = useMemo(() => {
    const byDate: Record<string, any> = {};
    for (const row of stats) {
      if (selected !== "all" && row.account_id !== selected) continue;
      if (!byDate[row.date]) byDate[row.date] = { date: row.date };
      for (const key of Object.keys(COMM_LABELS)) {
        byDate[row.date][COMM_LABELS[key]] =
          (byDate[row.date][COMM_LABELS[key]] || 0) + ((row as any)[key] || 0);
      }
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [stats, selected]);

  const activityChartData = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const p of posts) {
      const day = p.posted_at?.slice(0, 10);
      if (!day) continue;
      byDate[day] = (byDate[day] || 0) + engagementOf(p);
    }
    return Object.entries(byDate)
      .map(([date, activity]) => ({ date, activity }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [posts]);

  const accountNames = useMemo(
    () => Array.from(new Set(stats.map((s) => s.accounts?.display_name).filter(Boolean))),
    [stats]
  );

  const sortedPosts = useMemo(() => {
    const sorted = [...posts].sort((a, b) => {
      const av = postSort === "reach" ? a.reach : (a as any)[postSort];
      const bv = postSort === "reach" ? b.reach : (b as any)[postSort];
      return postSortDir === "desc" ? (bv || 0) - (av || 0) : (av || 0) - (bv || 0);
    });
    return sorted;
  }, [posts, postSort, postSortDir]);

  const relevantAccounts =
    selected === "all" ? accounts : accounts.filter((a) => a.id === selected);
  const totalFollowers = relevantAccounts.reduce((s, a) => s + (a.latest?.follower_count || 0), 0);
  const totalEngagement = posts.reduce((s, p) => s + engagementOf(p), 0);
  const avgEngagementPerPost = posts.length ? totalEngagement / posts.length : 0;
  const er = totalFollowers ? (avgEngagementPerPost / totalFollowers) * 100 : 0;

  async function submitAd(e: React.FormEvent) {
    e.preventDefault();
    const accountForAd = selected === "all" ? accounts[0]?.id : selected;
    if (!accountForAd) return;
    await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountForAd, ...adForm }),
    });
    setShowAdForm(false);
    setAdForm({ title: "", start_date: "", end_date: "", budget: "", result_note: "" });
    const adsUrl = selected === "all" ? "/api/ads" : `/api/ads?account=${selected}`;
    fetch(adsUrl)
      .then((r) => r.json())
      .then((d) => setAds(d.ads || []));
  }

  return (
    <div className="min-h-screen bg-ink text-paper p-6 md:p-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl">Статистика Instagram</h1>
          <p className="text-muted text-sm mt-1">
            {accounts.length} аккаунта · обновляется ежедневно
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/competitors"
            className="border border-line px-4 py-2 rounded font-medium text-muted hover:text-paper transition self-start"
          >
            Конкуренты
          </Link>
          <button
            onClick={() => exportMonthlyPdf({ accounts, stats, posts, selected, days: 30 })}
            className="bg-accent text-white px-4 py-2 rounded font-medium hover:opacity-90 transition self-start"
          >
            Скачать отчёт (PDF)
          </button>
        </div>
      </header>

      {/* Переключатель аккаунтов */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      {/* Период — влияет на всё ниже */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDatePreset(d)}
            className={`px-3 py-1.5 rounded text-sm ${
              datePreset === d ? "bg-accent text-white" : "border border-line text-muted hover:text-paper"
            }`}
          >
            {d} дн.
          </button>
        ))}
        <button
          onClick={() => setDatePreset("custom")}
          className={`px-3 py-1.5 rounded text-sm ${
            datePreset === "custom" ? "bg-accent text-white" : "border border-line text-muted hover:text-paper"
          }`}
        >
          Свой период
        </button>
        {datePreset === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-panel border border-line rounded px-2 py-1.5 text-sm text-paper"
            />
            <span className="text-muted">—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-panel border border-line rounded px-2 py-1.5 text-sm text-paper"
            />
          </>
        )}
      </div>

      {/* Карточки сводки */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {relevantAccounts.map((a) => (
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
        ))}
      </div>

      {/* Активность и ER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <div className="border border-line rounded-lg p-4 bg-panel">
          <p className="text-muted text-xs mb-1">Вовлечённость за период</p>
          <p className="text-2xl font-display">{totalEngagement.toLocaleString("ru-RU")}</p>
          <p className="text-muted text-xs mt-1">лайки + комментарии + сохранения + репосты</p>
        </div>
        <div className="border border-line rounded-lg p-4 bg-panel">
          <p className="text-muted text-xs mb-1">ER (вовлечённость на пост)</p>
          <p className="text-2xl font-display">{er.toFixed(2)}%</p>
          <p className="text-muted text-xs mt-1">
            среднее на пост / подписчики, {posts.length} постов в периоде
          </p>
        </div>
        <div className="border border-line rounded-lg p-4 bg-panel">
          <p className="text-muted text-xs mb-1">Постов в периоде</p>
          <p className="text-2xl font-display">{posts.length}</p>
          <p className="text-muted text-xs mt-1">
            {posts.length
              ? `в среднем ${avgEngagementPerPost.toFixed(0)} вовлечённости на пост`
              : "нет постов в выбранном периоде"}
          </p>
        </div>
      </div>

      {/* График по метрике */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-6">
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
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#2B3742" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#8B98A5" fontSize={12} />
            <YAxis stroke="#8B98A5" fontSize={12} />
            <Tooltip contentStyle={{ background: "#1B2530", border: "1px solid #2B3742" }} />
            <Legend />
            {(selected === "all"
              ? accountNames
              : [accounts.find((a) => a.id === selected)?.display_name]
            ).map(
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

      {/* Активность по дням */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-6">
        <h2 className="font-display text-xl mb-4">Активность (лайки + комментарии + сохранения + репосты)</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={activityChartData}>
            <CartesianGrid stroke="#2B3742" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#8B98A5" fontSize={12} />
            <YAxis stroke="#8B98A5" fontSize={12} />
            <Tooltip contentStyle={{ background: "#1B2530", border: "1px solid #2B3742" }} />
            <Line type="monotone" dataKey="activity" stroke="#3FB68B" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Коммуникация */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <h2 className="font-display text-xl mb-1">Коммуникация</h2>
        <p className="text-muted text-xs mb-4">
          Клики по кнопкам связи в профиле — доступно только если в Instagram настроены кнопки контактов
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={commChartData}>
            <CartesianGrid stroke="#2B3742" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#8B98A5" fontSize={12} />
            <YAxis stroke="#8B98A5" fontSize={12} />
            <Tooltip contentStyle={{ background: "#1B2530", border: "1px solid #2B3742" }} />
            <Legend />
            {Object.values(COMM_LABELS).map((label, i) => (
              <Line
                key={label}
                type="monotone"
                dataKey={label}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Лучшее время для поста */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <h2 className="font-display text-xl mb-1">Лучшее время для поста</h2>
        <p className="text-muted text-xs mb-4">
          {bestTime && !bestTime.reliable
            ? `Накоплено ${bestTime.totalPostsAnalyzed} постов — для надёжного результата нужно больше данных, продолжайте публиковать в разное время`
            : "На основе средней вовлечённости постов по часу и дню недели публикации"}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {bestTime?.slots.slice(0, 5).map((s, i) => (
            <div key={i} className="border border-line rounded p-3 text-center">
              <p className="font-display text-lg">
                {s.day} {s.hour}:00
              </p>
              <p className="text-muted text-xs mt-1">ср. вовлечённость {s.avgEngagement.toFixed(0)}</p>
              <p className="text-muted text-xs">{s.postsCount} постов</p>
            </div>
          ))}
          {(!bestTime || bestTime.slots.length === 0) && (
            <p className="text-muted text-sm col-span-full">Пока недостаточно данных.</p>
          )}
        </div>
      </div>

      {/* Реклама */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Реклама</h2>
          <button
            onClick={() => setShowAdForm((v) => !v)}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded"
          >
            {showAdForm ? "Отмена" : "+ Добавить"}
          </button>
        </div>
        {showAdForm && (
          <form onSubmit={submitAd} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
            <input
              required
              placeholder="Название"
              value={adForm.title}
              onChange={(e) => setAdForm({ ...adForm, title: e.target.value })}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            />
            <input
              required
              type="date"
              value={adForm.start_date}
              onChange={(e) => setAdForm({ ...adForm, start_date: e.target.value })}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            />
            <input
              required
              type="date"
              value={adForm.end_date}
              onChange={(e) => setAdForm({ ...adForm, end_date: e.target.value })}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Бюджет"
              value={adForm.budget}
              onChange={(e) => setAdForm({ ...adForm, budget: e.target.value })}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Результат"
              value={adForm.result_note}
              onChange={(e) => setAdForm({ ...adForm, result_note: e.target.value })}
              className="bg-ink border border-line rounded px-2 py-1.5 text-sm"
            />
            <button type="submit" className="md:col-span-5 bg-good text-white rounded py-1.5 text-sm">
              Сохранить
            </button>
          </form>
        )}
        <div className="space-y-2">
          {ads.map((ad) => (
            <div key={ad.id} className="flex justify-between text-sm border-b border-line/50 py-2">
              <span>{ad.title}</span>
              <span className="text-muted">
                {ad.start_date} — {ad.end_date}
              </span>
              <span className="text-muted">{ad.budget ? `${ad.budget} ₽` : "—"}</span>
              <span className="text-muted">{ad.result_note || "—"}</span>
            </div>
          ))}
          {ads.length === 0 && <p className="text-muted text-sm">Пока нет размеченных кампаний.</p>}
        </div>
      </div>

      {/* Таблица постов с картинками */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel mb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-xl">Топ постов</h2>
          <div className="flex items-center gap-2 text-sm">
            {(["reach", "likes", "comments", "saved", "shares"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setPostSort(s)}
                className={`px-3 py-1.5 rounded ${
                  postSort === s ? "bg-accent text-white" : "text-muted hover:text-paper"
                }`}
              >
                {s === "reach"
                  ? "Охват"
                  : s === "likes"
                  ? "Лайки"
                  : s === "comments"
                  ? "Комм."
                  : s === "saved"
                  ? "Сохр."
                  : "Репосты"}
              </button>
            ))}
            <button
              onClick={() => setPostSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="px-3 py-1.5 rounded border border-line text-muted hover:text-paper"
              title="Сменить направление сортировки"
            >
              {postSortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sortedPosts.slice(0, 20).map((p) => (
            <a
              key={p.id}
              href={p.permalink}
              target="_blank"
              rel="noreferrer"
              className="block border border-line rounded-lg overflow-hidden hover:border-accent transition"
            >
              <div className="aspect-square bg-ink overflow-hidden">
                {p.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                    Нет превью
                  </div>
                )}
              </div>
              <div className="p-2 text-xs">
                <p className="text-muted">{p.accounts?.display_name}</p>
                <p className="text-muted">{new Date(p.posted_at).toLocaleDateString("ru-RU")}</p>
                <p className="mt-1">
                  ❤ {p.likes?.toLocaleString("ru-RU")} · 💬 {p.comments?.toLocaleString("ru-RU")}
                </p>
                <p className="text-muted">Охват {p.reach?.toLocaleString("ru-RU")}</p>
              </div>
            </a>
          ))}
        </div>
        {sortedPosts.length === 0 && (
          <p className="text-muted text-sm py-6 text-center">
            Нет постов в выбранном периоде.
          </p>
        )}
      </div>

      {/* Stories */}
      <div className="border border-line rounded-lg p-4 md:p-6 bg-panel">
        <h2 className="font-display text-xl mb-4">Stories</h2>
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
          {stories.length === 0 && (
            <p className="text-muted text-sm py-6 text-center">
              Stories живут только 24 часа — здесь появятся только те, что были собраны после запуска сайта.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
