import { createClient } from '@supabase/supabase-js';

// 直接内置 Supabase 前端配置：这样腾讯云从 Git 拉取代码后无需配置环境变量。
// 这里使用的是 Supabase Publishable Key，仅用于浏览器端访问。
const url = 'https://xomxxxlebpalxvxdkbpt.supabase.co';
const key = 'sb_publishable_MK74DFKee8DjlsxoGfeCnQ_XplmSUfH';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
