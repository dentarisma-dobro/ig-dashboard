import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Не заданы SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в переменных окружения"
    );
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    global: {
      // Next.js кеширует fetch-запросы даже внутри динамических роутов —
      // явно запрещаем кеш, иначе дашборд будет показывать устаревшие данные.
      fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
    },
  });
}
