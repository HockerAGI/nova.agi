import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { Database } from "./supabase-types.js";

export type AdminSupabase = SupabaseClient<Database>;

let singleton: AdminSupabase | null = null;

export function createAdminSupabase(): AdminSupabase {
  return createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "nova.agi/2.2.0",
      },
    },
  });
}

export function sbAdmin(): AdminSupabase {
  if (!singleton) {
    singleton = createAdminSupabase();
  }
  return singleton;
}