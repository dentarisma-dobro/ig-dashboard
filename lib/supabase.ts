import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Используем service_role ключ (не anon): весь доступ к сайту закрыт паролем в middleware.ts,
// а таблицы закрыты от anon-ключа через Row Level Security (см. supabase/schema.sql).
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Хранилище для обложек постов, Stories и аватарок
export const MEDIA_BUCKET = "ig-media";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Не заданы SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в переменных окружения"
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      global: {
        // Next.js 14 кэширует fetch по умолчанию, а статистика должна быть свежей
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}

// Supabase отдаёт максимум 1000 строк за запрос. Эта функция дочитывает остальное.
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}
