// Работа с Telegram через аккаунт (MTProto, библиотека GramJS).
//
// Сайт входит в отдельный аккаунт Telegram и от его имени читает каналы:
// число подписчиков, посты с просмотрами и реакциями, а по своим каналам,
// где аккаунт админ, ещё и встроенную статистику Telegram.
//
// Сессия аккаунта хранится в таблице tg_session зашифрованной (AES-256-GCM).
// Ключ получается из TG_API_HASH, который есть только в переменных окружения,
// поэтому утечка одной базы не даёт доступа к аккаунту.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Logger, LogLevel } from "telegram/extensions/Logger";
import { computeCheck } from "telegram/Password";
import { returnBigInt } from "telegram/Helpers";
import { getSupabase } from "./supabase";

function creds() {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH || "";
  if (!apiId || !apiHash) {
    throw new Error("Не заданы TG_API_ID и TG_API_HASH (my.telegram.org → API development tools)");
  }
  return { apiId, apiHash };
}

export function telegramConfigured() {
  return !!(process.env.TG_API_ID && process.env.TG_API_HASH);
}

// ---------------------------------------------------------------------------
// Шифрование сессии
// ---------------------------------------------------------------------------

function key() {
  return createHash("sha256").update(`ig-dashboard:tg-session:${creds().apiHash}`).digest();
}

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((b) => Buffer.from(b, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Клиент и сессия
// ---------------------------------------------------------------------------

function newClient(session = "") {
  const { apiId, apiHash } = creds();
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    baseLogger: new Logger(LogLevel.ERROR),
    deviceModel: "Statistics dashboard",
    systemVersion: "Server",
    appVersion: "2.1",
  });
}

function saveSession(client: TelegramClient): string {
  return client.session.save() as unknown as string;
}

type SessionRow = {
  data: string | null;
  pending: string | null;
  phone: string | null;
  user_name: string | null;
  updated_at: string | null;
};

async function readRow(): Promise<SessionRow | null> {
  const { data, error } = await getSupabase().from("tg_session").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function writeRow(patch: Partial<SessionRow>) {
  const { error } = await getSupabase()
    .from("tg_session")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Понятные сообщения вместо кодов ошибок Telegram
function friendly(e: any): Error {
  const code: string = e?.errorMessage || e?.message || String(e);
  const wait = code.match(/FLOOD_WAIT_?(\d+)?/);
  if (wait) return new Error(`Telegram просит подождать${e?.seconds ? ` ${e.seconds} сек.` : ""} и повторить`);
  const map: Record<string, string> = {
    PHONE_NUMBER_INVALID: "Неверный номер телефона. Формат: +79991234567",
    PHONE_CODE_INVALID: "Неверный код",
    PHONE_CODE_EXPIRED: "Код устарел, запросите новый",
    SEND_CODE_UNAVAILABLE: "Другие способы отправки кода закончились. Нажмите «Начать заново» и запросите код снова",
    PHONE_CODE_EMPTY: "Введите код",
    PASSWORD_HASH_INVALID: "Неверный облачный пароль",
    PHONE_NUMBER_BANNED: "Этот номер заблокирован в Telegram",
    AUTH_KEY_UNREGISTERED: "Сессия Telegram завершена, войдите заново в настройках",
    SESSION_REVOKED: "Сессия Telegram завершена, войдите заново в настройках",
    USERNAME_NOT_OCCUPIED: "Канал с таким именем не найден",
    USERNAME_INVALID: "Неверное имя канала",
    CHANNEL_PRIVATE: "Канал закрытый, аккаунт в нём не состоит",
    CHAT_ADMIN_REQUIRED: "Для статистики аккаунт должен быть админом канала",
  };
  for (const [k, v] of Object.entries(map)) if (code.includes(k)) return new Error(v);
  return e instanceof Error ? e : new Error(code);
}

export async function sessionStatus() {
  if (!telegramConfigured()) return { configured: false, connected: false, pending: false, userName: null, phone: null };
  const row = await readRow();
  let pending: { step?: string; via?: string; next?: string | null; phone?: string } = {};
  if (row?.pending) {
    try {
      pending = JSON.parse(decrypt(row.pending));
    } catch {
      pending = {};
    }
  }
  return {
    configured: true,
    connected: !!row?.data,
    pending: pending.step ?? null,
    codeVia: pending.step === "code" ? pending.via ?? null : null,
    codeNext: pending.step === "code" ? pending.next ?? null : null,
    codePhone: pending.phone ? maskPhone(pending.phone) : null,
    userName: row?.user_name ?? null,
    phone: row?.phone ?? null,
  };
}

function maskPhone(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : phone;
}

// Куда Telegram отправил код: способов много, и для входа в сторонние программы он часто выбирает не SMS
function describeSentCode(t: Api.auth.TypeSentCodeType): string {
  if (t instanceof Api.auth.SentCodeTypeApp) return "в приложение Telegram: откройте этот аккаунт и чат «Telegram» с синей галочкой";
  if (t instanceof Api.auth.SentCodeTypeEmailCode) return `на почту ${t.emailPattern}, привязанную к аккаунту для входа`;
  if (t instanceof Api.auth.SentCodeTypeSms || t instanceof Api.auth.SentCodeTypeFirebaseSms) return "по SMS на этот номер";
  if (t instanceof Api.auth.SentCodeTypeSmsWord || t instanceof Api.auth.SentCodeTypeSmsPhrase) return "по SMS: кодом будет слово или фраза";
  if (t instanceof Api.auth.SentCodeTypeCall) return "звонком: робот продиктует код";
  if (t instanceof Api.auth.SentCodeTypeFlashCall || t instanceof Api.auth.SentCodeTypeMissedCall)
    return "звонком, отвечать не нужно: код в последних цифрах номера, с которого позвонят";
  if (t instanceof Api.auth.SentCodeTypeFragmentSms) return `через Fragment: ${t.url}`;
  return t.className;
}

function describeNextType(t: Api.auth.TypeCodeType | undefined): string | null {
  if (!t) return null;
  if (t instanceof Api.auth.CodeTypeSms) return "по SMS";
  if (t instanceof Api.auth.CodeTypeCall) return "звонком";
  if (t instanceof Api.auth.CodeTypeFlashCall || t instanceof Api.auth.CodeTypeMissedCall) return "пропущенным звонком";
  if (t instanceof Api.auth.CodeTypeFragmentSms) return "через Fragment";
  return null;
}

async function savePendingCode(client: TelegramClient, phone: string, sent: Api.auth.TypeSentCode) {
  if (!(sent instanceof Api.auth.SentCode)) throw new Error("Telegram не прислал код, попробуйте ещё раз");
  if (sent.type instanceof Api.auth.SentCodeTypeSetUpEmailRequired) {
    throw new Error("Telegram требует сначала привязать к этому аккаунту почту для входа. Сделайте это в приложении Telegram: Настройки → Конфиденциальность → Почта для входа");
  }
  const via = describeSentCode(sent.type);
  const next = describeNextType(sent.nextType);
  await writeRow({
    pending: encrypt(JSON.stringify({ session: saveSession(client), phone, phoneCodeHash: sent.phoneCodeHash, step: "code", via, next })),
  });
  return { via, next };
}

// Шаг 1: Telegram присылает код (в приложение, на почту, по SMS или звонком)
export async function startLogin(phoneRaw: string) {
  const phone = phoneRaw.replace(/[^\d+]/g, "");
  const { apiId, apiHash } = creds();
  const client = newClient();
  await client.connect();
  try {
    const send = () => client.invoke(new Api.auth.SendCode({ phoneNumber: phone, apiId, apiHash, settings: new Api.CodeSettings({}) }));
    const sent = await send().catch((e: any) => (e?.errorMessage === "AUTH_RESTART" ? send() : Promise.reject(e)));
    return await savePendingCode(client, phone, sent);
  } catch (e) {
    throw friendly(e);
  } finally {
    await client.destroy();
  }
}

// Код не пришёл: Telegram отправляет его следующим способом (обычно SMS или звонок)
export async function resendLoginCode() {
  const row = await readRow();
  if (!row?.pending) throw new Error("Сначала запросите код");
  const p = JSON.parse(decrypt(row.pending));
  if (p.step !== "code") throw new Error("Код уже введён");
  const client = newClient(p.session);
  await client.connect();
  try {
    const sent = await client.invoke(new Api.auth.ResendCode({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash }));
    return await savePendingCode(client, p.phone, sent);
  } catch (e) {
    throw friendly(e);
  } finally {
    await client.destroy();
  }
}

// Вход по QR-коду, когда код не доходит. Сайт показывает ссылку tg://login как QR, владелец аккаунта
// сканирует её в приложении (Настройки → Устройства → Подключить устройство). Сервер не держит соединение,
// поэтому страница раз в несколько секунд спрашивает checkQrLogin: Telegram отвечает новым токеном,
// пока QR не отсканирован, и успехом после.
// При обрыве связи GramJS переподключается минутами, а страница ждёт ответа. Ограничиваем ожидание.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Telegram не ответил вовремя. Проверьте интернет и нажмите «Начать заново»")), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

function qrUrl(token: Buffer) {
  return `tg://login?token=${token.toString("base64url")}`;
}

async function exportQr(client: TelegramClient) {
  const { apiId, apiHash } = creds();
  let res = await client.invoke(new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] }));
  if (res instanceof Api.auth.LoginTokenMigrateTo) {
    await (client as any)._switchDC(res.dcId);
    res = await client.invoke(new Api.auth.ImportLoginToken({ token: res.token }));
  }
  return res;
}

async function finishAuthorized(client: TelegramClient) {
  const me = (await client.getMe()) as Api.User;
  const userName = [me.firstName, me.lastName].filter(Boolean).join(" ") + (me.username ? ` (@${me.username})` : "");
  await writeRow({ data: encrypt(saveSession(client)), pending: null, phone: me.phone ? maskPhone(`+${me.phone}`) : null, user_name: userName });
  return { ok: true as const, userName };
}

export async function startQrLogin() {
  const client = newClient();
  try {
    await withTimeout(client.connect(), 20000);
    const res = await withTimeout(exportQr(client), 25000);
    if (!(res instanceof Api.auth.LoginToken)) throw new Error("Telegram не выдал QR-код, попробуйте ещё раз");
    const url = qrUrl(res.token);
    await writeRow({ pending: encrypt(JSON.stringify({ session: saveSession(client), step: "qr", url })) });
    return { url };
  } catch (e) {
    throw friendly(e);
  } finally {
    await withTimeout(client.destroy(), 5000).catch(() => null);
  }
}

export async function checkQrLogin(): Promise<{ url: string } | { ok: true; userName: string } | { needPassword: true }> {
  const row = await readRow();
  if (!row?.pending) throw new Error("Сначала нажмите «Войти по QR-коду»");
  const p = JSON.parse(decrypt(row.pending));
  if (p.step !== "qr") throw new Error("Вход по QR уже завершён");
  const client = newClient(p.session);
  try {
    await withTimeout(client.connect(), 20000);
    let res;
    try {
      res = await withTimeout(exportQr(client), 25000);
    } catch (e: any) {
      if (e?.errorMessage === "SESSION_PASSWORD_NEEDED") {
        await writeRow({ pending: encrypt(JSON.stringify({ session: saveSession(client), step: "password" })) });
        return { needPassword: true };
      }
      throw e;
    }
    if (res instanceof Api.auth.LoginTokenSuccess) return await finishAuthorized(client);
    if (res instanceof Api.auth.LoginToken) {
      const url = qrUrl(res.token);
      if (url !== p.url) await writeRow({ pending: encrypt(JSON.stringify({ ...p, session: saveSession(client), url })) });
      return { url };
    }
    throw new Error("Telegram ответил неожиданно, начните заново");
  } catch (e) {
    throw friendly(e);
  } finally {
    await withTimeout(client.destroy(), 5000).catch(() => null);
  }
}

// Шаг 2: код из Telegram. Шаг 3 (если включён облачный пароль): пароль.
export async function finishLogin(input: { code?: string; password?: string }) {
  const row = await readRow();
  if (!row?.pending) throw new Error("Сначала запросите код");
  const p = JSON.parse(decrypt(row.pending));
  const client = newClient(p.session);
  await client.connect();
  try {
    if (p.step === "code") {
      try {
        const res = await client.invoke(
          new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash, phoneCode: String(input.code || "").trim() })
        );
        if (res instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error("На этот номер нет аккаунта Telegram");
        }
      } catch (e: any) {
        if (e?.errorMessage === "SESSION_PASSWORD_NEEDED") {
          p.step = "password";
          p.session = saveSession(client);
          await writeRow({ pending: encrypt(JSON.stringify(p)) });
          return { needPassword: true as const };
        }
        throw e;
      }
    } else {
      const pwd = await client.invoke(new Api.account.GetPassword());
      await client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(pwd, String(input.password || "")) }));
    }
    return await finishAuthorized(client);
  } catch (e) {
    throw friendly(e);
  } finally {
    await client.destroy();
  }
}

export async function logout() {
  const row = await readRow();
  if (row?.data) {
    try {
      await withClient((c) => c.invoke(new Api.auth.LogOut()));
    } catch {
      // сессию могли уже завершить в самом Telegram
    }
  }
  await writeRow({ data: null, pending: null, phone: null, user_name: null });
}

// Открывает соединение с сохранённой сессией, выполняет fn и закрывает соединение
export async function withClient<T>(fn: (client: TelegramClient) => Promise<T>): Promise<T> {
  const row = await readRow();
  if (!row?.data) throw new Error("Telegram не подключён: войдите в аккаунт в разделе «Настройки»");
  const client = newClient(decrypt(row.data));
  await client.connect();
  try {
    return await fn(client);
  } catch (e: any) {
    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED/.test(e?.errorMessage || "")) {
      await writeRow({ data: null });
    }
    throw friendly(e);
  } finally {
    await client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Каналы
// ---------------------------------------------------------------------------

// "https://t.me/name", "t.me/s/name/123", "@name", "name" -> "name"
export function parseChannelRef(input: string): string {
  const s = input.trim();
  if (/t\.me\/(\+|joinchat)/i.test(s)) {
    throw new Error("Ссылки-приглашения в закрытые каналы не поддерживаются: добавьте публичный @username");
  }
  const m = s.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})/i) || s.match(/^@?([A-Za-z0-9_]{4,})$/);
  if (!m) throw new Error("Не похоже на ссылку на канал. Пример: https://t.me/durov или @durov");
  return m[1];
}

export type ChannelInfo = {
  id: string;
  accessHash: string;
  username: string | null;
  title: string;
  about: string | null;
  subscribers: number | null;
  statsAvailable: boolean;
  statsDc: number | null;
};

export function inputChannel(id: string, accessHash: string) {
  return new Api.InputChannel({ channelId: returnBigInt(id), accessHash: returnBigInt(accessHash) });
}

async function fullInfo(client: TelegramClient, channel: Api.TypeInputChannel): Promise<{ info: ChannelInfo; entity: Api.Channel }> {
  const full = await client.invoke(new Api.channels.GetFullChannel({ channel }));
  const fc = full.fullChat as Api.ChannelFull;
  const entity = full.chats.find((c) => c instanceof Api.Channel && c.id.toString() === fc.id.toString()) as Api.Channel;
  return {
    entity,
    info: {
      id: entity.id.toString(),
      accessHash: entity.accessHash?.toString() || "",
      username: entity.username || entity.usernames?.[0]?.username || null,
      title: entity.title,
      about: fc.about || null,
      subscribers: fc.participantsCount ?? null,
      statsAvailable: !!fc.canViewStats,
      statsDc: fc.statsDc ?? null,
    },
  };
}

export async function resolveChannel(client: TelegramClient, username: string) {
  const entity = await client.getEntity(username);
  if (!(entity instanceof Api.Channel) || !entity.broadcast) {
    throw new Error("Это не канал. Добавить можно только Telegram-каналы");
  }
  return fullInfo(client, new Api.InputChannel({ channelId: entity.id, accessHash: entity.accessHash! }));
}

export async function channelInfo(client: TelegramClient, id: string, accessHash: string) {
  return fullInfo(client, inputChannel(id, accessHash));
}

export async function channelAvatar(client: TelegramClient, entity: Api.Channel): Promise<Buffer | null> {
  try {
    const buf = await client.downloadProfilePhoto(entity, { isBig: false });
    return Buffer.isBuffer(buf) && buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Посты
// ---------------------------------------------------------------------------

export type ChannelPost = {
  msgId: number;
  postedAt: string;
  text: string;
  mediaType: string;
  views: number | null;
  forwards: number | null;
  reactions: number | null;
  comments: number | null;
};

function mediaType(m: Api.Message): string {
  const media = m.media;
  if (!media || media instanceof Api.MessageMediaWebPage) return "text";
  if (media instanceof Api.MessageMediaPhoto) return "photo";
  if (media instanceof Api.MessageMediaPoll) return "poll";
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      if (doc.mimeType?.startsWith("video/")) return "video";
      if (doc.mimeType?.startsWith("audio/")) return "audio";
    }
    return "file";
  }
  return "other";
}

// Страница истории: до 100 сообщений старше offsetId (0 = самые новые).
// Альбом из нескольких сообщений склеивается в один пост.
export async function fetchPosts(
  client: TelegramClient,
  channel: Api.TypeInputChannel,
  offsetId = 0,
  limit = 100
): Promise<{ posts: ChannelPost[]; nextOffset: number | null }> {
  const messages = await client.getMessages(channel, { limit, offsetId });
  const groups = new Map<string, Api.Message[]>();
  for (const m of messages) {
    if (!(m instanceof Api.Message) || m.views == null) continue;
    const key = m.groupedId ? `g${m.groupedId.toString()}` : `m${m.id}`;
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  const posts: ChannelPost[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.id - b.id);
    const max = (f: (m: Api.Message) => number | null | undefined) => {
      const vals = list.map(f).filter((v): v is number => typeof v === "number");
      return vals.length ? Math.max(...vals) : null;
    };
    posts.push({
      msgId: list[0].id,
      postedAt: new Date(list[0].date * 1000).toISOString(),
      text: list.find((m) => m.message)?.message || "",
      mediaType: key.startsWith("g") ? "album" : mediaType(list[0]),
      views: max((m) => m.views),
      forwards: max((m) => m.forwards),
      reactions: max((m) => m.reactions?.results?.reduce((a, r) => a + r.count, 0) ?? null),
      comments: max((m) => m.replies?.replies ?? null),
    });
  }
  const last = messages[messages.length - 1];
  return { posts, nextOffset: messages.length === limit && last ? last.id : null };
}

// ---------------------------------------------------------------------------
// Встроенная статистика канала (только админам своих каналов)
// ---------------------------------------------------------------------------

export type Graph = { names: Record<string, string>; x: number[]; series: Record<string, number[]> };

function parseGraph(raw: string): Graph | null {
  try {
    const j = JSON.parse(raw);
    const columns: any[][] = j.columns || [];
    const xCol = columns.find((c) => c[0] === "x");
    const series: Record<string, number[]> = {};
    for (const c of columns) if (c[0] !== "x") series[c[0]] = c.slice(1).map(Number);
    return { names: j.names || {}, x: xCol ? xCol.slice(1).map(Number) : [], series };
  } catch {
    return null;
  }
}

export type BroadcastStats = {
  period: { from: string; to: string };
  followers: { current: number; previous: number };
  viewsPerPost: { current: number; previous: number };
  sharesPerPost: { current: number; previous: number };
  reactionsPerPost: { current: number; previous: number };
  notificationsPercent: number | null;
  graphs: Record<string, Graph | null>;
};

export async function fetchBroadcastStats(client: TelegramClient, channel: Api.TypeInputChannel, statsDc: number | null) {
  const dc = statsDc || undefined;
  const stats = (await client.invoke(new Api.stats.GetBroadcastStats({ channel }), dc)) as Api.stats.BroadcastStats;
  const load = async (g: Api.TypeStatsGraph | undefined): Promise<Graph | null> => {
    try {
      let graph = g;
      if (graph instanceof Api.StatsGraphAsync) {
        graph = await client.invoke(new Api.stats.LoadAsyncGraph({ token: graph.token }), dc);
      }
      return graph instanceof Api.StatsGraph ? parseGraph(graph.json.data) : null;
    } catch {
      return null;
    }
  };
  const abs = (v: Api.TypeStatsAbsValueAndPrev) => ({ current: v.current, previous: v.previous });
  const [growth, followers, interactions, viewsBySource, followersBySource, languages, topHours] = await Promise.all([
    load(stats.growthGraph),
    load(stats.followersGraph),
    load(stats.interactionsGraph),
    load(stats.viewsBySourceGraph),
    load(stats.newFollowersBySourceGraph),
    load(stats.languagesGraph),
    load(stats.topHoursGraph),
  ]);
  const n = stats.enabledNotifications;
  const result: BroadcastStats = {
    period: {
      from: new Date(stats.period.minDate * 1000).toISOString().slice(0, 10),
      to: new Date(stats.period.maxDate * 1000).toISOString().slice(0, 10),
    },
    followers: abs(stats.followers),
    viewsPerPost: abs(stats.viewsPerPost),
    sharesPerPost: abs(stats.sharesPerPost),
    reactionsPerPost: abs(stats.reactionsPerPost),
    notificationsPercent: n && n.total > 0 ? (n.part / n.total) * 100 : null,
    graphs: { growth, followers, interactions, viewsBySource, followersBySource, languages, topHours },
  };
  return result;
}
