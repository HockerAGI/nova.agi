import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn("ADVERTENCIA: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
}

// Inicializa el cliente con la llave maestra (Service Role)
export const sb = createClient(
  config.supabase.url || "https://dummy.supabase.co",
  config.supabase.serviceRoleKey || "dummy_key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

// Alias para mantener compatibilidad con tu código original de uso de tokens
export const sbAdmin = () => sb;