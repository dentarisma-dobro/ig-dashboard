// Выгрузка в Excel (.xlsx): сводка, статистика по дням, публикации и Stories Instagram,
// сводка, дни и посты Telegram. Библиотека exceljs грузится только по нажатию кнопки.

import type { ReportData } from "./report/data";
import { dateInTz, LOCAL_TZ } from "./dates";
import { KIND_LABEL } from "./metrics";
import { TG_MEDIA_LABEL, tgPostLink } from "./tgmetrics";
import { fmtRange } from "./format";
import { reportFileName, saveBlob } from "./exportPdf";

function localDateTime(iso: string) {
  // Excel хранит дату без часового пояса, поэтому записываем московское время как есть
  const d = new Date(iso);
  const date = dateInTz(d, LOCAL_TZ);
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: LOCAL_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return new Date(`${date}T${time}:00Z`);
}

const pct = (v: number | null) => (v == null ? null : v / 100);
const round = (v: number | null) => (v == null ? null : Math.round(v));

function header(ws: any) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F8" } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function addInstagram(wb: any, data: ReportData) {
  const summary = wb.addWorksheet("Instagram сводка");
  summary.columns = [
    { header: "Аккаунт", key: "name", width: 24 },
    { header: "Username", key: "username", width: 22 },
    { header: "Подписчики на конец периода", key: "followers", width: 14 },
    { header: "Прирост", key: "delta", width: 10 },
    { header: "Подписались", key: "follows", width: 12 },
    { header: "Отписались", key: "unfollows", width: 12 },
    { header: "Средний охват в день", key: "reach", width: 14 },
    { header: "Просмотры", key: "views", width: 12 },
    { header: "Посещения профиля", key: "pv", width: 12 },
    { header: "Взаимодействия", key: "inter", width: 14 },
    { header: "Клики по ссылке", key: "clicks", width: 12 },
    { header: "Публикаций", key: "posts", width: 11 },
    { header: "Средний охват публикации", key: "postReach", width: 14 },
    { header: "ER", key: "er", width: 9 },
    { header: "ERR", key: "err", width: 9 },
    { header: "Лайки", key: "likes", width: 10 },
    { header: "Комментарии", key: "comments", width: 12 },
    { header: "Сохранения", key: "saves", width: 12 },
    { header: "Репосты", key: "shares", width: 10 },
  ];
  for (const r of data.accounts) {
    summary.addRow({
      name: r.account.display_name,
      username: "@" + r.account.username,
      followers: r.cur.followersEnd,
      delta: r.cur.followersDelta,
      follows: r.cur.follows,
      unfollows: r.cur.unfollows,
      reach: round(r.cur.reachAvg),
      views: r.cur.viewsSum,
      pv: r.cur.profileViewsSum,
      inter: r.cur.interactionsSum,
      clicks: r.cur.websiteClicksSum,
      posts: r.cur.posts,
      postReach: round(r.cur.postsReachAvg),
      er: pct(r.cur.er),
      err: pct(r.cur.err),
      likes: r.cur.likes,
      comments: r.cur.comments,
      saves: r.cur.saves,
      shares: r.cur.shares,
    });
  }
  summary.getColumn("er").numFmt = "0.00%";
  summary.getColumn("err").numFmt = "0.00%";
  header(summary);
  summary.addRow([]);
  summary.addRow([`Период: ${fmtRange(data.from, data.to)}`]);
  summary.addRow(["ER = (лайки + комментарии + сохранения + репосты) / подписчики; ERR = то же / охват публикации"]);

  const days = wb.addWorksheet("Instagram по дням");
  days.columns = [
    { header: "Аккаунт", key: "name", width: 22 },
    { header: "Дата", key: "date", width: 12, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Подписчики", key: "followers", width: 12 },
    { header: "Подписались", key: "follows", width: 12 },
    { header: "Отписались", key: "unfollows", width: 12 },
    { header: "Охват", key: "reach", width: 10 },
    { header: "Просмотры", key: "views", width: 11 },
    { header: "Посещения профиля", key: "pv", width: 12 },
    { header: "Взаимодействия", key: "inter", width: 14 },
    { header: "Клики по ссылке", key: "clicks", width: 12 },
  ];
  for (const r of data.accounts) {
    for (const d of r.days) {
      days.addRow({
        name: r.account.display_name,
        date: new Date(d.date + "T00:00:00Z"),
        followers: d.followers,
        follows: d.follows,
        unfollows: d.unfollows,
        reach: d.reach,
        views: d.views,
        pv: d.profile_views,
        inter: d.total_interactions,
        clicks: d.website_clicks,
      });
    }
  }
  header(days);

  const posts = wb.addWorksheet("Instagram публикации");
  posts.columns = [
    { header: "Аккаунт", key: "name", width: 20 },
    { header: "Дата и время (Мск)", key: "date", width: 17, style: { numFmt: "dd.mm.yyyy hh:mm" } },
    { header: "Тип", key: "kind", width: 11 },
    { header: "Подпись", key: "caption", width: 50 },
    { header: "Охват", key: "reach", width: 10 },
    { header: "Просмотры", key: "views", width: 11 },
    { header: "Лайки", key: "likes", width: 9 },
    { header: "Комментарии", key: "comments", width: 12 },
    { header: "Сохранения", key: "saved", width: 11 },
    { header: "Репосты", key: "shares", width: 10 },
    { header: "ER", key: "er", width: 9, style: { numFmt: "0.00%" } },
    { header: "ERR", key: "err", width: 9, style: { numFmt: "0.00%" } },
    { header: "Ссылка", key: "link", width: 40 },
  ];
  for (const r of data.accounts) {
    for (const p of r.posts) {
      posts.addRow({
        name: r.account.display_name,
        date: localDateTime(p.posted_at),
        kind: KIND_LABEL[p.kind],
        caption: (p.caption || "").replace(/\s+/g, " ").slice(0, 500),
        reach: p.reach,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        saved: p.saved,
        shares: p.shares,
        er: pct(p.er),
        err: pct(p.err),
        link: p.permalink ? { text: p.permalink, hyperlink: p.permalink } : null,
      });
    }
  }
  header(posts);

  const stories = wb.addWorksheet("Instagram Stories");
  stories.columns = [
    { header: "Аккаунт", key: "name", width: 20 },
    { header: "Дата и время (Мск)", key: "date", width: 17, style: { numFmt: "dd.mm.yyyy hh:mm" } },
    { header: "Охват", key: "reach", width: 10 },
    { header: "Просмотры", key: "views", width: 11 },
    { header: "Ответы", key: "replies", width: 10 },
    { header: "Репосты", key: "shares", width: 10 },
    { header: "Вперёд", key: "fwd", width: 10 },
    { header: "Назад", key: "back", width: 10 },
    { header: "Выходы", key: "exits", width: 10 },
    { header: "Статистика", key: "ok", width: 14 },
  ];
  for (const r of data.accounts) {
    for (const s of r.stories) {
      const ok = s.insights_ok !== false;
      stories.addRow({
        name: r.account.display_name,
        date: localDateTime(s.posted_at),
        reach: ok ? s.reach : null,
        views: ok ? s.views : null,
        replies: ok ? s.replies : null,
        shares: ok ? s.shares : null,
        fwd: ok ? s.taps_forward : null,
        back: ok ? s.taps_back : null,
        exits: ok ? s.exits : null,
        ok: ok ? "есть" : "не сохранилась",
      });
    }
  }
  header(stories);
}

function addTelegram(wb: any, data: ReportData) {
  const summary = wb.addWorksheet("Telegram сводка");
  summary.columns = [
    { header: "Канал", key: "title", width: 26 },
    { header: "Username", key: "username", width: 20 },
    { header: "Тип", key: "own", width: 11 },
    { header: "Подписчики на конец периода", key: "subs", width: 14 },
    { header: "Прирост", key: "delta", width: 10 },
    { header: "Подписались", key: "joined", width: 12 },
    { header: "Отписались", key: "left", width: 12 },
    { header: "Постов", key: "posts", width: 9 },
    { header: "Средний охват поста", key: "views", width: 13 },
    { header: "Охват за 24 часа", key: "views24", width: 12 },
    { header: "ERR", key: "err", width: 9, style: { numFmt: "0.0%" } },
    { header: "ERR24", key: "err24", width: 9, style: { numFmt: "0.0%" } },
    { header: "ER", key: "er", width: 9, style: { numFmt: "0.00%" } },
    { header: "Реакции", key: "reactions", width: 10 },
    { header: "Репосты", key: "forwards", width: 10 },
    { header: "Комментарии", key: "comments", width: 12 },
  ];
  for (const r of data.tg) {
    summary.addRow({
      title: r.channel.title,
      username: r.channel.username ? "@" + r.channel.username : "",
      own: r.channel.is_own ? "свой" : "конкурент",
      subs: r.cur.subsEnd,
      delta: r.cur.subsDelta,
      joined: r.cur.joined,
      left: r.cur.left,
      posts: r.cur.posts,
      views: round(r.cur.viewsAvg),
      views24: round(r.cur.views24Avg),
      err: pct(r.cur.err),
      err24: pct(r.cur.err24),
      er: pct(r.cur.er),
      reactions: r.cur.reactions,
      forwards: r.cur.forwards,
      comments: r.cur.comments,
    });
  }
  header(summary);
  summary.addRow([]);
  summary.addRow([`Период: ${fmtRange(data.from, data.to)}`]);
  summary.addRow(["ERR = просмотры поста / подписчики; ERR24 = просмотры за первые сутки / подписчики; ER = (реакции + репосты + комментарии) / просмотры"]);

  const days = wb.addWorksheet("Telegram по дням");
  days.columns = [
    { header: "Канал", key: "title", width: 24 },
    { header: "Дата", key: "date", width: 12, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Подписчики", key: "subs", width: 12 },
    { header: "Подписались", key: "joined", width: 12 },
    { header: "Отписались", key: "left", width: 12 },
    { header: "Просмотры канала", key: "views", width: 14 },
    { header: "Просмотры постов дня", key: "postViews", width: 16 },
  ];
  for (const r of data.tg) {
    for (const d of r.days) {
      days.addRow({
        title: r.channel.title,
        date: new Date(d.date + "T00:00:00Z"),
        subs: d.subscribers,
        joined: d.follows,
        left: d.unfollows,
        views: d.views,
        postViews: d.postViews,
      });
    }
  }
  header(days);

  const posts = wb.addWorksheet("Telegram посты");
  posts.columns = [
    { header: "Канал", key: "title", width: 22 },
    { header: "Дата и время (Мск)", key: "date", width: 17, style: { numFmt: "dd.mm.yyyy hh:mm" } },
    { header: "Тип", key: "type", width: 9 },
    { header: "Текст", key: "text", width: 50 },
    { header: "Просмотры", key: "views", width: 11 },
    { header: "За 24 часа", key: "views24", width: 11 },
    { header: "ERR", key: "err", width: 9, style: { numFmt: "0.0%" } },
    { header: "Реакции", key: "reactions", width: 10 },
    { header: "Репосты", key: "forwards", width: 10 },
    { header: "Комментарии", key: "comments", width: 12 },
    { header: "ER", key: "er", width: 9, style: { numFmt: "0.00%" } },
    { header: "Ссылка", key: "link", width: 34 },
  ];
  for (const r of data.tg) {
    for (const p of r.posts) {
      const link = tgPostLink(r.channel, p);
      posts.addRow({
        title: r.channel.title,
        date: localDateTime(p.posted_at),
        type: TG_MEDIA_LABEL[p.media_type || "other"] || "",
        text: (p.text || "").replace(/\s+/g, " ").slice(0, 500),
        views: p.views,
        views24: p.views_24h,
        err: pct(p.err),
        reactions: p.reactions,
        forwards: p.forwards,
        comments: p.comments,
        er: pct(p.er),
        link: link ? { text: link, hyperlink: link } : null,
      });
    }
  }
  header(posts);
}

export async function downloadExcelReport(data: ReportData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Статистика Instagram и Telegram";
  wb.created = new Date();
  if (data.accounts.length) addInstagram(wb, data);
  if (data.tg.length) addTelegram(wb, data);
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    reportFileName(data, "xlsx")
  );
}
