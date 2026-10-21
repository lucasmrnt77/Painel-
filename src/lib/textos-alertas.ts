import "server-only";
import { db } from "./supabase";
import type { Modelos } from "./modelos-alertas";

/** Textos do catálogo de alertas editados no painel (tabela alertas_textos). Vazio = usa o padrão. */
export type TextoAlerta = {
  tipo: string;
  mensagem: string | null;
  diagnostico_pt: string | null;
  diagnostico_es: string | null;
  verificar_pt: string[] | null;
  verificar_es: string[] | null;
  atualizado_em: string;
};

// Cache curto: os alertas consultam a cada envio e o texto muda raramente
let cache: { em: number; linhas: TextoAlerta[] } | null = null;
const VALIDADE_MS = 60_000;

export async function textosAlertas(): Promise<TextoAlerta[]> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.linhas;
  const { data, error } = await db().from("alertas_textos").select("*");
  if (error) {
    // Nunca deixa de enviar um alerta por causa disso: usa os textos padrão
    console.error("[textos-alertas]", error.message);
    return cache?.linhas ?? [];
  }
  cache = { em: Date.now(), linhas: (data ?? []) as TextoAlerta[] };
  return cache.linhas;
}

export async function modelosAlertas(): Promise<Modelos> {
  const m: Modelos = {};
  for (const t of await textosAlertas()) if (t.mensagem?.trim()) m[t.tipo] = t.mensagem;
  return m;
}

export function limparCacheTextos() {
  cache = null;
}
