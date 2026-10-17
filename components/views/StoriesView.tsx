"use client";

import type { Ctx } from "@/app/dashboard/page";
import type { Story } from "@/lib/types";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { useApi } from "../useApi";
import { Avatar, Card, Empty, ErrorNote, KpiTile, Thumb, cx } from "../ui";
import { IconExternal, IconInfo } from "../icons";

function avg(list: (number | null | undefined)[]) {
  const nums = list.filter((v): v is number => typeof v === "number");
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function StoriesView({ ctx, onOpenSettings }: { ctx: Ctx; onOpenSettings: () => void }) {
  const q = useApi<{ stories: Story[] }>(`/api/stories?account=${ctx.accountId}&from=${ctx.from}&to=${ctx.to}`);
  const stories = q.data?.stories || [];
  const measured = stories.filter((s) => s.insights_ok !== false);
  const exitRates = measured.map((s) => (s.views && s.exits != null ? (s.exits / s.views) * 100 : null));

  if (q.error) return <ErrorNote error={q.error} />;

  return (
    <div className={cx("space-y-5 transition-opacity", q.loading && q.data && "opacity-60")}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="Stories за период" value={fmtNum(stories.length)} sub={measured.length !== stories.length ? `со статистикой ${measured.length}` : undefined} />
        <KpiTile label="Средний охват" value={fmtNum(avg(measured.map((s) => s.reach)))} />
        <KpiTile label="Средние просмотры" value={fmtNum(avg(measured.map((s) => s.views)))} />
        <KpiTile label="Ответы" value={measured.length ? fmtNum(measured.reduce((a, s) => a + (s.replies || 0), 0)) : "—"} />
        <KpiTile
          label="Доля выходов"
          value={fmtPct(avg(exitRates), 1)}
          hint="Сколько просмотров закончились выходом из Stories, в среднем по историям"
        />
      </div>

      <div className="flex gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-sub">
        <IconInfo className="mt-0.5 shrink-0 text-accent" width={16} height={16} />
        <p>
          Instagram показывает статистику Stories только 24 часа, пока история активна. Сайт сохраняет её четыре раза в сутки,
          поэтому цифры могут быть немного меньше итоговых: последний замер бывает за несколько часов до исчезновения истории.
          Истории, собранные до обновления сайта, остались без статистики.{" "}
          <button onClick={onOpenSettings} className="text-accent underline">
            Журнал сборов
          </button>
        </p>
      </div>

      {stories.length === 0 && !q.loading ? (
        <Card>
          <Empty title="За период Stories не сохранены" />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {stories.map((s) => {
            const acc = ctx.accounts.find((a) => a.id === s.account_id);
            const ok = s.insights_ok !== false;
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="relative">
                  <Thumb src={s.thumb_url} className="aspect-[9/16] w-full" />
                  {s.permalink && (
                    <a
                      href={s.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-2 top-2 rounded-md bg-card/90 p-1 text-sub hover:text-ink"
                      title="Открыть в Instagram"
                    >
                      <IconExternal width={14} height={14} />
                    </a>
                  )}
                </div>
                <div className="p-3 text-xs">
                  <div className="flex items-center gap-1.5 text-muted">
                    {!ctx.account && acc && <Avatar account={acc} size={16} />}
                    {fmtDateTime(s.posted_at)}
                  </div>
                  {ok ? (
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 tabular">
                      <Item label="Охват" value={s.reach} />
                      <Item label="Просмотры" value={s.views} />
                      <Item label="Ответы" value={s.replies} />
                      <Item label="Репосты" value={s.shares} />
                      <Item label="Вперёд" value={s.taps_forward} />
                      <Item label="Назад" value={s.taps_back} />
                      <Item label="Выходы" value={s.exits} />
                      <Item label="Свайп" value={s.swipe_forward} />
                    </dl>
                  ) : (
                    <p className="mt-2 text-muted">Статистика не сохранилась (собрана старой версией сайта)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: number | null }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{fmtNum(value)}</dd>
    </>
  );
}
