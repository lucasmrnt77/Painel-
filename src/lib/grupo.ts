import "server-only";

/**
 * Leitura das inscrições da página do grupo gratuito (captura-grupo).
 * Os dados ficam no Supabase próprio da página ("Captura Leads Evengreen"); o painel só lê.
 * Variáveis: GRUPO_SUPABASE_URL e GRUPO_SUPABASE_SERVICE_ROLE_KEY (as mesmas do projeto captura-grupo).
 */
function cfg() {
  const url = process.env.GRUPO_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const chave = process.env.GRUPO_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && chave ? { url, chave } : null;
}

export const grupoConfigurado = () => cfg() !== null;

function exigirCfg() {
  const c = cfg();
  if (!c) throw new Error("Faltam GRUPO_SUPABASE_URL / GRUPO_SUPABASE_SERVICE_ROLE_KEY");
  return c;
}

function cabecalhos(chave: string, extra: Record<string, string> = {}) {
  return { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json", ...extra };
}

export async function rpcGrupo<T>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { url, chave } = exigirCfg();
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, { method: "POST", headers: cabecalhos(chave), body: JSON.stringify(args), cache: "no-store" });
  if (!r.ok) throw new Error(`Supabase do grupo (${nome}): ${r.status} ${await r.text()}`);
  return r.json();
}

/** GET na tabela com filtros do PostgREST; devolve linhas + total (Prefer: count=exact). */
export async function listarGrupo<T>(tabela: string, query: URLSearchParams, inicio: number, fim: number): Promise<{ linhas: T[]; total: number }> {
  const { url, chave } = exigirCfg();
  const r = await fetch(`${url}/rest/v1/${tabela}?${query.toString()}`, {
    headers: cabecalhos(chave, { Prefer: "count=exact", Range: `${inicio}-${fim}`, "Range-Unit": "items" }),
    cache: "no-store",
  });
  if (!r.ok && r.status !== 206) throw new Error(`Supabase do grupo (${tabela}): ${r.status} ${await r.text()}`);
  const total = Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
  return { linhas: await r.json(), total: Number.isFinite(total) ? total : 0 };
}
