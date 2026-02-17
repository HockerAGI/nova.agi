import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let _admin: SupabaseClient | null = null;

export function sbAdmin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { "x-client-info": "nova.agi" } }
  });
  return _admin;
}

// Alias clásico (algunos módulos ya lo importan como `supabase`)
export const supabase = sbAdmin();

// Alias por nombre (para compat con archivos legacy)
export const supabaseAdmin = supabase;