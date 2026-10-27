// Режим без ключей: чтение публичных страниц каналов t.me/<канал> и t.me/s/<канал>.
//
// Telegram показывает там число подписчиков, посты с датами, просмотрами и реакциями.
// Репостов, комментариев и встроенной статистики там нет, а просмотры больше тысячи
// Telegram округляет (1.2K). Работает только для публичных каналов.

import { parse, type HTMLElement } from "node-html-parser";
import type { ChannelPost } from "./telegram";

const HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

async function getHtml(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20000) }).catch(
      (e) => {
        throw new Error(`Нет связи с t.me: ${e?.message || e}`);
      }
    );
    if (res.ok) return res.text();
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`t.me ответил ${res.status}`);
  }
}

// "696" -> 696, "12 345" -> 12345, "1.2K" -> 1200, "3.4M" -> 3400000
export function parseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const s = raw.replace(/[\s ,]/g, "").toUpperCase();
  const m = s.match(/^([\d.]+)([KMB])?/);
  if (!m) return null;
  const mult = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "B" ? 1e9 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function htmlText(el: HTMLElement | null): string {
  if (!el) return "";
  return parse(el.innerHTML.replace(/<br\s*\/?>/gi, "\n")).text.trim();
}

function mediaType(msg: HTMLElement): string {
  if (msg.querySelector(".tgme_widget_message_grouped_wrap")) return "album";
  if (msg.querySelector(".tgme_widget_message_video_player, .tgme_widget_message_roundvideo_player, .tgme_widget_message_video_wrap")) return "video";
  if (msg.querySelector(".tgme_widget_message_photo_wrap")) return "photo";
  if (msg.querySelector(".tgme_widget_message_poll")) return "poll";
  if (msg.querySelector(".tgme_widget_message_voice, .tgme_widget_message_audio")) return "audio";
  if (msg.querySelector(".tgme_widget_message_document_wrap")) return "file";
  return "text";
}

// Внутренний ID канала зашит в атрибут data-view каждого поста
function channelIdFrom(msg: HTMLElement): string | null {
  const raw = msg.getAttribute("data-view");
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.c === "number" ? String(Math.abs(json.c)) : null;
  } catch {
    return null;
  }
}

function parsePosts(root: HTMLElement): { posts: ChannelPost[]; tgId: string | null; nextBefore: number | null } {
  const posts: ChannelPost[] = [];
  let tgId: string | null = null;
  for (const msg of root.querySelectorAll(".tgme_widget_message")) {
    if (msg.classList.contains("service_message")) continue;
    const ref = msg.getAttribute("data-post") || "";
    const msgId = Number(ref.split("/")[1]);
    const time = msg.querySelector("time")?.getAttribute("datetime");
    if (!msgId || !time) continue;
    tgId ||= channelIdFrom(msg);
    const reactions = msg
      .querySelectorAll(".tgme_reaction")
      .map((r) => parseCount(r.text.match(/([\d.,]+\s*[KMB]?)\s*$/i)?.[1]))
      .reduce<number>((a, b) => a + (b || 0), 0);
    posts.push({
      msgId,
      postedAt: new Date(time).toISOString(),
      text: htmlText(msg.querySelector(".tgme_widget_message_text")),
      mediaType: mediaType(msg),
      views: parseCount(msg.querySelector(".tgme_widget_message_views")?.text),
      forwards: null,
      reactions,
      comments: null,
    });
  }
  const before = root.querySelector(".tme_messages_more[data-before]")?.getAttribute("data-before");
  const minId = posts.length ? Math.min(...posts.map((p) => p.msgId)) : null;
  // Ссылка «ещё» ведёт на посты старше; если она не двигается дальше, архив закончился
  const nextBefore = before && minId && Number(before) <= minId && minId > 1 ? Number(before) : null;
  return { posts, tgId, nextBefore };
}

export type PublicChannel = {
  username: string;
  tgId: string | null;
  title: string;
  about: string | null;
  subscribers: number | null;
  avatarUrl: string | null;
};

// Канал и первая страница его постов (около 20 самых новых)
export async function fetchPublicChannel(username: string): Promise<{ info: PublicChannel; posts: ChannelPost[]; nextBefore: number | null }> {
  const [preview, page] = await Promise.all([getHtml(`https://t.me/s/${username}`), getHtml(`https://t.me/${username}`)]);
  const root = parse(preview);
  const header = root.querySelector(".tgme_channel_info");
  if (!header) {
    throw new Error(`Публичный канал @${username} не найден. Проверьте ссылку: закрытые каналы и группы без ключей Telegram не читаются`);
  }
  // На t.me/<канал> число подписчиков точное ("12 345 subscribers"), на t.me/s бывает округлённым
  const extra = parse(page).querySelector(".tgme_page_extra")?.text || "";
  let subscribers = /subscriber/i.test(extra) ? parseCount(extra) : null;
  if (subscribers == null) {
    const counter = root
      .querySelectorAll(".tgme_channel_info_counter")
      .find((c) => /subscriber/i.test(c.querySelector(".counter_type")?.text || ""));
    subscribers = parseCount(counter?.querySelector(".counter_value")?.text);
  }
  const parsed = parsePosts(root);
  return {
    info: {
      username: root.querySelector(".tgme_channel_info_header_username a")?.text.replace("@", "").trim() || username,
      tgId: parsed.tgId,
      title: htmlText(root.querySelector(".tgme_channel_info_header_title")) || username,
      about: htmlText(root.querySelector(".tgme_channel_info_description")) || null,
      subscribers,
      avatarUrl: root.querySelector(".tgme_channel_info_header .tgme_page_photo_image img")?.getAttribute("src") || null,
    },
    posts: parsed.posts,
    nextBefore: parsed.nextBefore,
  };
}

// Страница архива: посты старше before
export async function fetchPublicPosts(username: string, before: number) {
  return parsePosts(parse(await getHtml(`https://t.me/s/${username}?before=${before}`)));
}
