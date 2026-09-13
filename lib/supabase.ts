import { createClient } from "@supabase/supabase-js";

// Используем service_role ключ (не anon), потому что весь доступ к сайту
// уже защищён паролем в middleware.ts — Supabase Row Level Security нам
// не нужен для этого личного инструмента.
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
  });
}
