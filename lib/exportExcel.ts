// Выгрузка в Excel (.xlsx): сводка, статистика по дням, публикации и Stories.
// Библиотека exceljs грузится только по нажатию кнопки.

import type { ReportData } from "./report/data";
import { dateInTz, LOCAL_TZ } from "./dates";
import { KIND_LABEL } from "./metrics";
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

export async function downloadExcelReport(data: ReportData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Статистика Instagram";
  wb.created = new Date();

  const header = (ws: any) => {
    const row = ws.getRow(1);
    row.font = { bold: true };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F8" } };
    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 30;
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Сводка
  const summary = wb.addWorksheet("Сводка");
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
      reach: r.cur.reachAvg == null ? null : Math.round(r.cur.reachAvg),
      views: r.cur.viewsSum,
      pv: r.cur.profileViewsSum,
      inter: r.cur.interactionsSum,
      clicks: r.cur.websiteClicksSum,
      posts: r.cur.posts,
      postReach: r.cur.postsReachAvg == null ? null : Math.round(r.cur.postsReachAvg),
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

  // По дням
  const days = wb.addWorksheet("По дням");
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

  // Публикации
  const posts = wb.addWorksheet("Публикации");
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

  // Stories
  const stories = wb.addWorksheet("Stories");
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

  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    reportFileName(data, "xlsx")
  );
}
