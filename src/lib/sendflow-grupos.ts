import "server-only"

/**
 * Grupos de uma campanha (release) do Sendflow e redefinição do link de convite.
 *   GET  {base}/sendapi/releases/{releaseId}/groups            → grupos com o código de convite atual
 *   POST {base}/sendapi/actions/update-group-invite-code        → pede link novo (ação assíncrona, 201)
 *        { releaseId, accountsFrom: "release", to: { type: "groups", ids: [...] } }
 * Limites conhecidos: consulta de grupos ~1 a cada 10 min por campanha;
 * no máximo 4 redefinições a cada 15 min por chave (controlado em redirecionador.ts).
 */

const env = (k: string) => process.env[k]?.trim() || ""
const base = () => (env("SENDFLOW_API_URL") || "https://southamerica-east1-whatsapp-ultimate.cloudfunctions.net").replace(/\/$/, "")
const auth = () => ({ authorization: `Bearer ${env("SENDFLOW_API_TOKEN")}` })

import { lerGruposSendflow, type GrupoSendflow } from "./sendflow-grupos-ler"
export type { GrupoSendflow }

export async function listarGruposCampanha(releaseId: string): Promise<{ grupos: GrupoSendflow[]; erro?: string; limitado?: boolean }> {
  if (!env("SENDFLOW_API_TOKEN")) return { grupos: [], erro: "SENDFLOW_API_TOKEN não configurado" }
  try {
    const r = await fetch(`${base()}/sendapi/releases/${encodeURIComponent(releaseId)}/groups`, {
      headers: auth(), cache: "no-store", signal: AbortSignal.timeout(20000),
    })
    const t = await r.text()
    if (r.status === 403 || /rate-limit/i.test(t)) return { grupos: [], erro: "O Sendflow limita essa consulta a 1 a cada 10 min por campanha. Tente de novo depois.", limitado: true }
    if (!r.ok) return { grupos: [], erro: `Sendflow HTTP ${r.status}: ${t.slice(0, 200)}` }
    return { grupos: lerGruposSendflow(JSON.parse(t)) }
  } catch (e) {
    return { grupos: [], erro: e instanceof Error ? e.message : String(e) }
  }
}

export async function pedirNovoConvite(releaseId: string, groupIds: string[]): Promise<{ ok: boolean; http?: number; resposta?: string }> {
  if (!env("SENDFLOW_API_TOKEN")) return { ok: false, resposta: "SENDFLOW_API_TOKEN não configurado" }
  try {
    const r = await fetch(`${base()}/sendapi/actions/update-group-invite-code`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({ releaseId, accountsFrom: "release", to: { type: "groups", ids: groupIds } }),
      signal: AbortSignal.timeout(20000),
    })
    const t = await r.text()
    return { ok: r.status === 201 || r.ok, http: r.status, resposta: t.slice(0, 300) }
  } catch (e) {
    return { ok: false, resposta: e instanceof Error ? e.message : String(e) }
  }
}
