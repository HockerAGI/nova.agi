import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { Database } from "./supabase-types.js";

export type AdminSupabase = SupabaseClient<Database>;

export function createAdminSupabase(): AdminSupabase {
  return createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}