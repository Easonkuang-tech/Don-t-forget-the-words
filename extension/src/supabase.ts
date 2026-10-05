import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tsurlxnhadfibpyizuoj.supabase.co";
const SUPABASE_KEY = "sb_publishable_aX2tWkUy8lJGjvjZRPD4rw_DKKaPRpM";
export const REPLOOP_ORIGIN = "https://reploop-production.up.railway.app";

const storage = {
  async getItem(key: string) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    await chrome.storage.local.remove(key);
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
