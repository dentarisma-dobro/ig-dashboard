// Шифрование секретов в базе (AES-256-GCM). Ключ получается из переменной окружения,
// поэтому утечка одной базы не раскрывает токены.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function keyFrom(passphrase: string) {
  return createHash("sha256").update(`ig-dashboard:secretbox:${passphrase}`).digest();
}

export function seal(text: string, passphrase: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(passphrase), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function open(payload: string, passphrase: string): string {
  const [iv, tag, enc] = payload.split(".").map((b) => Buffer.from(b, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(passphrase), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// Подписанная строка для параметра state при входе через Google (защита от подмены запроса)
export function signState(passphrase: string): string {
  const payload = `${Date.now()}.${randomBytes(8).toString("hex")}`;
  const mac = createHmac("sha256", passphrase).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${mac}`;
}

export function verifyState(state: string, passphrase: string, maxAgeMs = 15 * 60 * 1000): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const mac = createHmac("sha256", passphrase).update(payload).digest("hex").slice(0, 32);
  const ok = mac.length === parts[2].length && timingSafeEqual(Buffer.from(mac), Buffer.from(parts[2]));
  return ok && Date.now() - Number(parts[0]) < maxAgeMs;
}
