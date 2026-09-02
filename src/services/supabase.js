import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('缺少 Supabase 配置：请创建 .env.local 并填写 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
