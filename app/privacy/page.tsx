import { LogoMark } from "@/components/icons";

export const metadata = { title: "Политика конфиденциальности — IG Dashboard" };

// Публичная страница: ссылку на неё требует экран входа Google (Google Auth Platform → Branding).
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-page px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl border border-line bg-card p-6 text-[15px] leading-relaxed text-ink sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <h1 className="text-lg font-semibold">Политика конфиденциальности IG Dashboard</h1>
        </div>
        <div className="space-y-4 text-sub">
          <p>
            IG Dashboard — закрытый сайт статистики проекта Dentarisma. Сайт собирает показатели аккаунтов Instagram, каналов Telegram и YouTube, которые
            подключил владелец, и показывает их на графиках и в отчётах. Доступ к сайту защищён паролем.
          </p>
          <h2 className="pt-2 font-semibold text-ink">Какие данные Google мы получаем</h2>
          <p>
            Если владелец YouTube-канала входит через Google, сайт получает доступ только на чтение (youtube.readonly и yt-analytics.readonly): список
            каналов, видео и их статистику, отчёты YouTube Analytics и YouTube Reporting. Сайт ничего не публикует, не меняет и не удаляет на канале.
          </p>
          <h2 className="pt-2 font-semibold text-ink">Где хранятся данные</h2>
          <p>
            Статистика хранится в базе данных владельца сайта (Supabase). Ключ доступа Google хранится в зашифрованном виде. Мы не передаём и не продаём
            данные третьим лицам и не используем их для рекламы.
          </p>
          <h2 className="pt-2 font-semibold text-ink">Как отозвать доступ</h2>
          <p>
            Нажмите «Отключить» в разделе «Настройки» → YouTube или удалите доступ приложения на странице{" "}
            <a className="text-accent underline" href="https://myaccount.google.com/permissions">
              myaccount.google.com/permissions
            </a>
            . После этого сайт перестанет получать аналитику канала.
          </p>
          <h2 className="pt-2 font-semibold text-ink">Связь</h2>
          <p>
            Вопросы по данным:{" "}
            <a className="text-accent underline" href="mailto:dentarisma.blog@gmail.com">
              dentarisma.blog@gmail.com
            </a>
            .
          </p>
        </div>
      </article>
    </div>
  );
}
