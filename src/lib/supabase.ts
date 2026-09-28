import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cliente: SupabaseClient | null = null;

/** Cliente com service_role. SÓ no servidor — nunca importar em componente client. */
export function db(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
