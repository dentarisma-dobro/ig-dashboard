// PDF-отчёт (A4). Рендерится в браузере через @react-pdf/renderer со встроенным шрифтом Inter,
// поэтому кириллица отображается правильно. Графики векторные.

import { Document, Font, Image, Line, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { AccountReport, DayPoint, ReportData, ReportPost } from "./data";
import { fmtAxis, fmtCompact, fmtDateTime, fmtDay, fmtNum, fmtPct, fmtRange, fmtSigned, pctChange } from "../format";
import { KIND_LABEL, topEntries } from "../metrics";

let fontsReady = false;
export function registerFonts(origin: string) {
  if (fontsReady) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${origin}/fonts/Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/Inter-SemiBold.ttf`, fontWeight: 600 },
      { src: `${origin}/fonts/Inter-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Русские слова не переносим по английским правилам
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const C = {
  ink: "#14171c",
  sub: "#5a6270",
  muted: "#8a929e",
  line: "#e6e8ec",
  grid: "#eceef1",
  soft: "#f4f6f8",
  blue: "#2a78d6",
  red: "#e34948",
  up: "#0b7a35",
  down: "#c93434",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
};

const PAGE_W = 595.28;
const PAD = 32;
const CONTENT_W = PAGE_W - PAD * 2;

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9, color: C.ink, paddingTop: PAD, paddingBottom: 44, paddingHorizontal: PAD },
  footer: { position: "absolute", bottom: 18, left: PAD, right: PAD, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  h1: { fontSize: 18, fontWeight: 700 },
  h2: { fontSize: 11.5, fontWeight: 600, marginBottom: 2 },
  note: { fontSize: 7.5, color: C.muted },
  section: { marginTop: 16 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 10 },
  row: { flexDirection: "row" },
  th: { fontSize: 7.5, color: C.muted, fontWeight: 600 },
  td: { fontSize: 8.5 },
});

// ---------------------------------------------------------------------------
// Мелкие элементы
// ---------------------------------------------------------------------------

function DeltaText({ cur, prev, mode = "pct" }: { cur: number | null; prev: number | null; mode?: "pct" | "pp" }) {
  const change = mode === "pp" ? (cur != null && prev != null ? cur - prev : null) : pctChange(cur, prev);
  if (change == null || !Number.isFinite(change)) return <Text style={{ fontSize: 7.5, color: C.muted }}>нет данных для сравнения</Text>;
  const r = Math.round(change * 10) / 10;
  if (r === 0) return <Text style={{ fontSize: 7.5, color: C.muted }}>без изменений</Text>;
  return (
    <Text style={{ fontSize: 7.5, fontWeight: 600, color: r > 0 ? C.up : C.down }}>
      {r > 0 ? "▲ +" : "▼ −"}
      {mode === "pp" ? `${fmtNum(Math.abs(r), 1)} п.п.` : fmtPct(Math.abs(r))}
      <Text style={{ color: C.muted, fontWeight: 400 }}> к прошлому периоду</Text>
    </Text>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <View style={{ width: (CONTENT_W - 18) / 4, marginRight: 6, marginBottom: 6, ...s.card, padding: 8 }} wrap={false}>
      <Text style={{ fontSize: 7.5, color: C.sub }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</Text>
      <View style={{ marginTop: 2 }}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Графики
// ---------------------------------------------------------------------------

function niceScale(min: number, max: number, count: number, zero: boolean) {
  let lo = zero ? Math.min(0, min) : min;
  let hi = zero ? Math.max(0, max) : max;
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

function PdfChart({
  kind,
  values,
  negative,
  dates,
  height = 130,
  zero = true,
}: {
  kind: "line" | "bar";
  values: (number | null)[];
  negative?: (number | null)[]; // для подписок/отписок: рисуется вниз красным
  dates: string[];
  height?: number;
  zero?: boolean;
}) {
  const width = CONTENT_W - 22; // внутри карточки: минус отступы и рамка
  const padL = 40;
  const padR = 4;
  const padT = 6;
  const padB = 16;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const nums = [...values, ...(negative || []).map((v) => (v == null ? null : -v))].filter(
    (v): v is number => typeof v === "number"
  );
  if (nums.length === 0) {
    return (
      <View style={{ height: 40, justifyContent: "center" }}>
        <Text style={s.note}>Нет данных за этот период</Text>
      </View>
    );
  }
  const { lo, hi, ticks } = niceScale(Math.min(...nums), Math.max(...nums), 4, zero);
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const n = dates.length;
  const band = plotW / n;
  const x = (i: number) => padL + band * (i + 0.5);
  const bw = Math.max(1.5, Math.min(band * 0.62, 12));
  const every = Math.max(1, Math.ceil(n / 8));

  let path = "";
  if (kind === "line") {
    let started = false;
    values.forEach((v, i) => {
      if (v == null) return;
      path += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    });
  }

  return (
    <View style={{ width, height, position: "relative" }}>
      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <Line key={t} x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 && negative ? "#c3c7ce" : C.grid} strokeWidth={0.7} />
        ))}
        {kind === "line" && path && <Path d={path} stroke={C.blue} strokeWidth={1.6} fill="none" />}
        {kind === "bar" &&
          values.map((v, i) => {
            const h = v == null ? 0 : Math.abs(y(v) - y(0));
            if (v == null || h < 0.6) return null;
            return <Rect key={`p${i}`} x={x(i) - bw / 2} y={Math.min(y(v), y(0))} width={bw} height={h} fill={C.blue} rx={h > 5 ? Math.min(2, bw / 3) : 0} />;
          })}
        {kind === "bar" &&
          negative?.map((v, i) => {
            const h = v == null ? 0 : Math.abs(y(-v) - y(0));
            if (v == null || h < 0.6) return null;
            return <Rect key={`n${i}`} x={x(i) - bw / 2} y={y(0)} width={bw} height={h} fill={C.red} rx={h > 5 ? Math.min(2, bw / 3) : 0} />;
          })}
      </Svg>
      {ticks.map((t) => (
        <Text key={t} style={{ position: "absolute", left: 0, width: padL - 6, top: y(t) - 4.5, textAlign: "right", fontSize: 6.5, color: C.muted }}>
          {fmtAxis(Math.abs(t))}
        </Text>
      ))}
      {dates.map((d, i) =>
        i % every === 0 ? (
          <Text key={d} style={{ position: "absolute", top: height - padB + 4, left: x(i) - 20, width: 40, textAlign: "center", fontSize: 6.5, color: C.muted }}>
            {fmtDay(d)}
          </Text>
        ) : null
      )}
    </View>
  );
}

function ChartBlock({ title, subtitle, legend, children }: { title: string; subtitle?: string; legend?: { label: string; color: string }[]; children: React.ReactNode }) {
  return (
    <View style={[s.section, s.card]} wrap={false}>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }]}>
        <View>
          <Text style={s.h2}>{title}</Text>
          {subtitle && <Text style={s.note}>{subtitle}</Text>}
        </View>
        {legend && (
          <View style={s.row}>
            {legend.map((l) => (
              <View key={l.label} style={[s.row, { alignItems: "center", marginLeft: 10 }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.color, marginRight: 4 }} />
                <Text style={{ fontSize: 7.5, color: C.sub }}>{l.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Таблицы
// ---------------------------------------------------------------------------

type Col<T> = { title: string; width: number; align?: "left" | "right"; render: (row: T) => React.ReactNode };

function Table<T>({ cols, rows }: { cols: Col<T>[]; rows: T[] }) {
  return (
    <View>
      <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 4 }]}>
        {cols.map((c) => (
          <Text key={c.title} style={[s.th, { width: c.width, textAlign: c.align || "left" }]}>
            {c.title}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.grid, paddingVertical: 4, alignItems: "center" }]} wrap={false}>
          {cols.map((c) => (
            <View key={c.title} style={{ width: c.width, alignItems: c.align === "right" ? "flex-end" : "flex-start" }}>
              {c.render(r)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const T = ({ children, bold, color }: { children: React.ReactNode; bold?: boolean; color?: string }) => (
  <Text style={[s.td, bold ? { fontWeight: 600 } : {}, color ? { color } : {}]}>{children}</Text>
);

// В шрифте нет эмодзи: без этой чистки вместо них в PDF появляются случайные символы
function plainText(text: string) {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortCaption(p: ReportPost) {
  const text = plainText(p.caption || "") || "Без подписи";
  return text.length > 70 ? text.slice(0, 68) + "…" : text;
}

// ---------------------------------------------------------------------------
// Разделы
// ---------------------------------------------------------------------------

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Статистика Instagram · сформировано {fmtDateTime(generatedAt)}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function AccountHeader({ r, data, avatar }: { r: AccountReport; data: ReportData; avatar?: string | null }) {
  return (
    <View style={[s.row, { alignItems: "center", marginBottom: 12 }]}>
      {avatar ? (
        <Image src={avatar} style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }} />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: "#eaf2fc" }} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 7.5, color: C.muted, letterSpacing: 0.4 }}>ОТЧЁТ ПО INSTAGRAM</Text>
        <Text style={s.h1}>{plainText(r.account.display_name)}</Text>
        <Text style={{ color: C.sub, marginTop: 1 }}>
          @{r.account.username} · {fmtRange(data.from, data.to)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 16, fontWeight: 600 }}>{fmtNum(r.cur.followersEnd ?? r.account.followers_count)}</Text>
        <Text style={s.note}>подписчиков</Text>
      </View>
    </View>
  );
}

function KpiGrid({ r }: { r: AccountReport }) {
  const { cur, prev } = r;
  return (
    <View style={[s.row, { flexWrap: "wrap", marginRight: -6 }]}>
      <Kpi label="Прирост подписчиков" value={fmtSigned(cur.followersDelta)}>
        <Text style={s.note}>
          {cur.follows != null ? `+${fmtNum(cur.follows)} подписались, −${fmtNum(cur.unfollows)} отписались` : "нет данных о подписках"}
        </Text>
      </Kpi>
      <Kpi label="Средний охват в день" value={fmtNum(cur.reachAvg)}>
        <DeltaText cur={cur.reachAvg} prev={prev.reachAvg} />
      </Kpi>
      <Kpi label="Просмотры" value={fmtCompact(cur.viewsSum)}>
        <DeltaText cur={cur.viewsSum} prev={prev.viewsSum} />
      </Kpi>
      <Kpi label="Посещения профиля" value={fmtNum(cur.profileViewsSum)}>
        <DeltaText cur={cur.profileViewsSum} prev={prev.profileViewsSum} />
      </Kpi>
      <Kpi label="Взаимодействия" value={fmtNum(cur.interactionsSum)}>
        <DeltaText cur={cur.interactionsSum} prev={prev.interactionsSum} />
      </Kpi>
      <Kpi label="Клики по ссылке" value={fmtNum(cur.websiteClicksSum)}>
        <DeltaText cur={cur.websiteClicksSum} prev={prev.websiteClicksSum} />
      </Kpi>
      <Kpi label="Публикации" value={fmtNum(cur.posts)}>
        <DeltaText cur={cur.posts} prev={prev.posts} />
      </Kpi>
      <Kpi label="Средний охват публикации" value={fmtNum(cur.postsReachAvg)}>
        <DeltaText cur={cur.postsReachAvg} prev={prev.postsReachAvg} />
      </Kpi>
      <Kpi label="ER (по подписчикам)" value={fmtPct(cur.er, 2)}>
        <DeltaText cur={cur.er} prev={prev.er} mode="pp" />
      </Kpi>
      <Kpi label="ERR (по охвату)" value={fmtPct(cur.err, 2)}>
        <DeltaText cur={cur.err} prev={prev.err} mode="pp" />
      </Kpi>
      <Kpi label="Лайки и комментарии" value={`${fmtNum(cur.likes)} / ${fmtNum(cur.comments)}`}>
        <Text style={s.note}>по публикациям периода</Text>
      </Kpi>
      <Kpi label="Сохранения и репосты" value={`${fmtNum(cur.saves)} / ${fmtNum(cur.shares)}`}>
        <Text style={s.note}>по публикациям периода</Text>
      </Kpi>
    </View>
  );
}

function Charts({ days }: { days: DayPoint[] }) {
  const dates = days.map((d) => d.date);
  return (
    <>
      <ChartBlock title="Подписчики" subtitle="Число подписчиков на конец дня">
        <PdfChart kind="line" values={days.map((d) => d.followers)} dates={dates} zero={false} />
      </ChartBlock>
      <ChartBlock
        title="Подписки и отписки"
        subtitle="Сколько подписались и отписались за день"
        legend={[
          { label: "Подписались", color: C.blue },
          { label: "Отписались", color: C.red },
        ]}
      >
        <PdfChart kind="bar" values={days.map((d) => d.follows)} negative={days.map((d) => d.unfollows)} dates={dates} height={110} />
      </ChartBlock>
      <ChartBlock title="Охват по дням" subtitle="Уникальные аккаунты, которые видели контент. Сутки по времени Instagram">
        <PdfChart kind="bar" values={days.map((d) => d.reach)} dates={dates} />
      </ChartBlock>
      <ChartBlock title="Просмотры по дням" subtitle="Показы публикаций, Reels и Stories">
        <PdfChart kind="bar" values={days.map((d) => d.views)} dates={dates} />
      </ChartBlock>
    </>
  );
}

function ContentSection({ r, thumbs }: { r: AccountReport; thumbs: Record<string, string | null> }) {
  const top = [...r.posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 10);
  const w = CONTENT_W - 20;
  return (
    <>
      <View style={[s.section, s.card]} wrap={false}>
        <Text style={[s.h2, { marginBottom: 6 }]}>Типы публикаций</Text>
        {r.kinds.length === 0 ? (
          <Text style={s.note}>За период нет публикаций</Text>
        ) : (
          <Table
            rows={r.kinds}
            cols={[
              { title: "Тип", width: w * 0.28, render: (k) => <T>{KIND_LABEL[k.kind]}</T> },
              { title: "Публикаций", width: w * 0.14, align: "right", render: (k) => <T>{k.count}</T> },
              { title: "Ср. охват", width: w * 0.15, align: "right", render: (k) => <T>{fmtNum(k.reachAvg)}</T> },
              { title: "Ср. просмотры", width: w * 0.15, align: "right", render: (k) => <T>{fmtNum(k.viewsAvg)}</T> },
              { title: "Ср. реакции", width: w * 0.14, align: "right", render: (k) => <T>{fmtNum(k.interactionsAvg, 1)}</T> },
              { title: "Ср. ERR", width: w * 0.14, align: "right", render: (k) => <T>{fmtPct(k.errAvg, 2)}</T> },
            ]}
          />
        )}
      </View>

      <View style={[s.section, s.card]} wrap={top.length > 6} minPresenceAhead={120}>
        <Text style={[s.h2, { marginBottom: 6 }]}>Лучшие публикации по охвату</Text>
        {top.length === 0 ? (
          <Text style={s.note}>За период нет публикаций</Text>
        ) : (
          <Table
            rows={top}
            cols={[
              {
                title: "Публикация",
                width: w * 0.38,
                render: (p) => (
                  <View style={[s.row, { alignItems: "center" }]}>
                    {thumbs[p.id] ? (
                      <Image src={thumbs[p.id]!} style={{ width: 28, height: 28, borderRadius: 3, marginRight: 6 }} />
                    ) : (
                      <View style={{ width: 28, height: 28, borderRadius: 3, marginRight: 6, backgroundColor: C.soft }} />
                    )}
                    <View style={{ width: w * 0.38 - 40 }}>
                      <Text style={{ fontSize: 7, color: C.muted }}>
                        {KIND_LABEL[p.kind]} · {fmtDateTime(p.posted_at)}
                      </Text>
                      <Text style={{ fontSize: 7.5 }}>{shortCaption(p)}</Text>
                    </View>
                  </View>
                ),
              },
              { title: "Охват", width: w * 0.1, align: "right", render: (p) => <T bold>{fmtNum(p.reach)}</T> },
              { title: "Просм.", width: w * 0.1, align: "right", render: (p) => <T>{fmtNum(p.views)}</T> },
              { title: "Лайки", width: w * 0.08, align: "right", render: (p) => <T>{fmtNum(p.likes)}</T> },
              { title: "Комм.", width: w * 0.08, align: "right", render: (p) => <T>{fmtNum(p.comments)}</T> },
              { title: "Сохр.", width: w * 0.08, align: "right", render: (p) => <T>{fmtNum(p.saved)}</T> },
              { title: "Репост", width: w * 0.08, align: "right", render: (p) => <T>{fmtNum(p.shares)}</T> },
              { title: "ERR", width: w * 0.1, align: "right", render: (p) => <T>{fmtPct(p.err, 1)}</T> },
            ]}
          />
        )}
      </View>
    </>
  );
}

function StoriesAndAudience({ r }: { r: AccountReport }) {
  const measured = r.stories.filter((x) => x.insights_ok !== false);
  const avg = (vals: (number | null)[]) => {
    const n = vals.filter((v): v is number => typeof v === "number");
    return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
  };
  const a = r.audience;
  const gender = a?.gender ? topEntries(a.gender, 3) : [];
  const genderTotal = gender.reduce((sum, [, v]) => sum + v, 0);
  const GENDER: Record<string, string> = { F: "Женщины", M: "Мужчины", U: "Не указан" };
  const ages = a?.age ? ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"].filter((k) => a.age![k] != null) : [];
  const ageMax = Math.max(1, ...ages.map((k) => a!.age![k]));
  const cities = a?.city ? topEntries(a.city, 6) : [];

  return (
    <View style={[s.section, s.row]} wrap={false}>
      <View style={[s.card, { flex: 1, marginRight: 8 }]}>
        <Text style={[s.h2, { marginBottom: 6 }]}>Stories за период</Text>
        {r.stories.length === 0 ? (
          <Text style={s.note}>Stories за период не сохранены</Text>
        ) : (
          <>
            {[
              ["Опубликовано", fmtNum(r.stories.length)],
              ["Со статистикой", fmtNum(measured.length)],
              ["Средний охват", fmtNum(avg(measured.map((x) => x.reach)))],
              ["Средние просмотры", fmtNum(avg(measured.map((x) => x.views)))],
              ["Ответы", measured.length ? fmtNum(measured.reduce((acc, x) => acc + (x.replies || 0), 0)) : "—"],
              ["Выходы", measured.length ? fmtNum(measured.reduce((acc, x) => acc + (x.exits || 0), 0)) : "—"],
            ].map(([k, v]) => (
              <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: C.grid }]}>
                <Text style={{ color: C.sub }}>{k}</Text>
                <Text style={{ fontWeight: 600 }}>{v}</Text>
              </View>
            ))}
          </>
        )}
      </View>
      <View style={[s.card, { flex: 1.4 }]}>
        <Text style={[s.h2, { marginBottom: 6 }]}>Аудитория подписчиков</Text>
        {!a ? (
          <Text style={s.note}>Instagram отдаёт демографию только аккаунтам от 100 подписчиков</Text>
        ) : (
          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[s.th, { marginBottom: 3 }]}>Пол</Text>
              {gender.map(([k, v]) => (
                <Text key={k} style={{ marginBottom: 2 }}>
                  {GENDER[k] || k}: <Text style={{ fontWeight: 600 }}>{fmtPct(genderTotal ? (v / genderTotal) * 100 : null, 0)}</Text>
                </Text>
              ))}
              <Text style={[s.th, { marginTop: 6, marginBottom: 3 }]}>Города</Text>
              {cities.map(([k, v]) => (
                <Text key={k} style={{ marginBottom: 1.5, fontSize: 8 }}>
                  {k.split(",")[0]} — {fmtNum(v)}
                </Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.th, { marginBottom: 3 }]}>Возраст</Text>
              {ages.map((k) => (
                <View key={k} style={{ marginBottom: 3 }}>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <Text style={{ fontSize: 7.5 }}>{k.replace("-", "–")}</Text>
                    <Text style={{ fontSize: 7.5, color: C.sub }}>{fmtNum(a.age![k])}</Text>
                  </View>
                  <View style={{ height: 3, backgroundColor: C.grid, borderRadius: 2, marginTop: 1 }}>
                    <View style={{ height: 3, width: `${(a.age![k] / ageMax) * 100}%`, backgroundColor: C.blue, borderRadius: 2 }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function ComparisonPage({ data }: { data: ReportData }) {
  const w = CONTENT_W - 20;
  return (
    <Page size="A4" style={s.page}>
      <Text style={{ fontSize: 7.5, color: C.muted, letterSpacing: 0.4 }}>ОТЧЁТ ПО INSTAGRAM</Text>
      <Text style={s.h1}>Сравнение аккаунтов</Text>
      <Text style={{ color: C.sub, marginTop: 2, marginBottom: 12 }}>
        {fmtRange(data.from, data.to)} · сравнение с периодом {fmtRange(data.prevFrom, data.prevTo)}
      </Text>
      <View style={s.card}>
        <Table
          rows={data.accounts}
          cols={[
            {
              title: "Аккаунт",
              width: w * 0.22,
              render: (r) => (
                <View style={[s.row, { alignItems: "center" }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, marginRight: 5, backgroundColor: C.series[data.accounts.indexOf(r) % C.series.length] }} />
                  <View>
                    <Text style={{ fontWeight: 600 }}>{plainText(r.account.display_name)}</Text>
                    <Text style={{ fontSize: 7, color: C.muted }}>@{r.account.username}</Text>
                  </View>
                </View>
              ),
            },
            { title: "Подписчики", width: w * 0.11, align: "right", render: (r) => <T>{fmtNum(r.cur.followersEnd)}</T> },
            {
              title: "Прирост",
              width: w * 0.09,
              align: "right",
              render: (r) => (
                <T color={(r.cur.followersDelta || 0) > 0 ? C.up : (r.cur.followersDelta || 0) < 0 ? C.down : undefined}>
                  {fmtSigned(r.cur.followersDelta)}
                </T>
              ),
            },
            { title: "Охват/день", width: w * 0.11, align: "right", render: (r) => <T>{fmtNum(r.cur.reachAvg)}</T> },
            { title: "Просмотры", width: w * 0.11, align: "right", render: (r) => <T>{fmtCompact(r.cur.viewsSum)}</T> },
            { title: "Визиты", width: w * 0.09, align: "right", render: (r) => <T>{fmtNum(r.cur.profileViewsSum)}</T> },
            { title: "Публикаций", width: w * 0.1, align: "right", render: (r) => <T>{fmtNum(r.cur.posts)}</T> },
            { title: "ER", width: w * 0.08, align: "right", render: (r) => <T>{fmtPct(r.cur.er, 2)}</T> },
            { title: "ERR", width: w * 0.09, align: "right", render: (r) => <T>{fmtPct(r.cur.err, 2)}</T> },
          ]}
        />
      </View>
      <Text style={[s.note, { marginTop: 8 }]}>
        ER = (лайки + комментарии + сохранения + репосты) / подписчики; ERR = то же / охват публикации. Средние по публикациям периода.
      </Text>
      <Footer generatedAt={data.generatedAt} />
    </Page>
  );
}

export function ReportDocument({
  data,
  images,
}: {
  data: ReportData;
  images: Record<string, string | null>; // id поста или "avatar:<id аккаунта>" -> data URL
}) {
  return (
    <Document title={`Отчёт Instagram ${fmtRange(data.from, data.to)}`} author="Статистика Instagram" language="ru">
      {data.accounts.length > 1 && <ComparisonPage data={data} />}
      {data.accounts.map((r) => (
        <Page key={r.account.id} size="A4" style={s.page}>
          <AccountHeader r={r} data={data} avatar={images[`avatar:${r.account.id}`]} />
          <KpiGrid r={r} />
          <Charts days={r.days} />
          <ContentSection r={r} thumbs={images} />
          <StoriesAndAudience r={r} />
          <Text style={[s.note, { marginTop: 10 }]}>
            Сравнение с периодом {fmtRange(data.prevFrom, data.prevTo)}. Сутки Instagram считает по тихоокеанскому времени, время
            публикаций указано по Москве.
          </Text>
          <Footer generatedAt={data.generatedAt} />
        </Page>
      ))}
    </Document>
  );
}
