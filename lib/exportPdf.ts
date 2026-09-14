import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportMonthlyPdf({
  accounts,
  stats,
  posts,
  selected,
  days,
}: {
  accounts: any[];
  stats: any[];
  posts: any[];
  selected: string;
  days: number;
}) {
  const doc = new jsPDF();
  const today = new Date().toLocaleDateString("ru-RU");

  doc.setFontSize(16);
  doc.text("Отчёт по статистике Instagram", 14, 18);
  doc.setFontSize(10);
  doc.text(`Сформировано: ${today} · период: ${days} дней`, 14, 25);

  const relevantAccounts =
    selected === "all" ? accounts : accounts.filter((a) => a.id === selected);

  autoTable(doc, {
    startY: 32,
    head: [["Аккаунт", "Подписчики", "Охват", "Показы", "Визиты в профиль"]],
    body: relevantAccounts.map((a) => [
      a.display_name,
      a.latest?.follower_count ?? "—",
      a.latest?.reach ?? "—",
      a.latest?.impressions ?? "—",
      a.latest?.profile_views ?? "—",
    ]),
  });

  const relevantPosts =
    selected === "all" ? posts : posts.filter((p) => p.account_id === selected);
  const topPosts = [...relevantPosts]
    .sort((a, b) => (b.reach || 0) - (a.reach || 0))
    .slice(0, 15);

  const finalY = (doc as any).lastAutoTable.finalY || 60;
  doc.setFontSize(12);
  doc.text("Топ-15 постов по охвату", 14, finalY + 12);

  autoTable(doc, {
    startY: finalY + 16,
    head: [["Дата", "Аккаунт", "Охват", "Лайки", "Комментарии", "Сохранения"]],
    body: topPosts.map((p) => [
      new Date(p.posted_at).toLocaleDateString("ru-RU"),
      p.accounts?.display_name || "",
      p.reach ?? 0,
      p.likes ?? 0,
      p.comments ?? 0,
      p.saved ?? 0,
    ]),
  });

  doc.save(`instagram-otchet-${today.replace(/\./g, "-")}.pdf`);
}
