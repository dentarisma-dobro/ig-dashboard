// Картинки (обложки постов, Stories, аватарки): Instagram и Telegram отдают временные ссылки,
// поэтому файлы копируются в Supabase Storage, в публичный бакет ig-media.

import { getSupabase, MEDIA_BUCKET } from "./supabase";

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(MEDIA_BUCKET);
  if (!data) await sb.storage.createBucket(MEDIA_BUCKET, { public: true });
  bucketReady = true;
}

export async function storeBuffer(path: string, body: Uint8Array, contentType: string): Promise<string | null> {
  try {
    await ensureBucket();
    const sb = getSupabase();
    const { error } = await sb.storage
      .from(MEDIA_BUCKET)
      .upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) return null;
    return sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function storeImage(path: string, src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return storeBuffer(path, new Uint8Array(await res.arrayBuffer()), type);
  } catch {
    return null;
  }
}
