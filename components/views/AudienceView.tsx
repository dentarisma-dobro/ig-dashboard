"use client";

import type { Ctx } from "@/app/dashboard/page";
import type { AudienceRow } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { topEntries } from "@/lib/metrics";
import { useApi } from "../useApi";
import { Card, CardHeader, Empty, ErrorNote } from "../ui";
import { BarList } from "../charts";

const GENDER: Record<string, string> = { F: "Женщины", M: "Мужчины", U: "Не указан" };
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string) {
  try {
    regionNames ||= new Intl.DisplayNames(["ru"], { type: "region" });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

export function audienceLists(a: AudienceRow) {
  return {
    gender: topEntries(a.gender, 3).map(([k, v]) => ({ label: GENDER[k] || k, value: v })),
    age: AGE_ORDER.filter((k) => a.age?.[k] != null).map((k) => ({ label: k.replace("-", "–"), value: a.age![k] })),
    city: topEntries(a.city, 10).map(([k, v]) => ({ label: k.split(",")[0], value: v })),
    country: topEntries(a.country, 10).map(([k, v]) => ({ label: countryName(k), value: v })),
  };
}

export function AudienceView({ ctx }: { ctx: Ctx }) {
  const q = useApi<{ audience: AudienceRow | null }>(`/api/audience?account=${ctx.accountId}`);
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data) return null;
  const a = q.data.audience;
  if (!a) {
    return (
      <Card>
        <Empty title="Данных об аудитории пока нет">
          Instagram отдаёт демографию только аккаунтам от 100 подписчиков. Сайт запрашивает её раз в сутки.
        </Empty>
      </Card>
    );
  }
  const lists = audienceLists(a);
  const sumGender = lists.gender.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-sub">
        Подписчики аккаунта по данным Instagram на {fmtDate(a.date)}. Всего учтено {sumGender} подписчиков.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Пол" />
          <div className="px-5 pb-5">{lists.gender.length ? <BarList items={lists.gender} /> : <p className="text-sm text-muted">Нет данных</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Возраст" />
          <div className="px-5 pb-5">{lists.age.length ? <BarList items={lists.age} /> : <p className="text-sm text-muted">Нет данных</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Города" subtitle="Топ-10" />
          <div className="px-5 pb-5">
            {lists.city.length ? <BarList items={lists.city} total={sumGender || undefined} /> : <p className="text-sm text-muted">Нет данных</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Страны" subtitle="Топ-10" />
          <div className="px-5 pb-5">
            {lists.country.length ? <BarList items={lists.country} total={sumGender || undefined} /> : <p className="text-sm text-muted">Нет данных</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
