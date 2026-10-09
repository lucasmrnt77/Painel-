import "server-only"
import { after } from "next/server"
import { db } from "./supabase"
import { verificarGrupo, despacharAlertas } from "./redirecionador"

/**
 * Clique num funil do redirecionador. Usado em /g/<funil> e no domínio de links
 * (link.traderdelite.net/<funil>, quando não existe link curto com esse nome).
 * Devolve null se o funil não existe.
 */
const SEM_CACHE = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex" }

function paginaSemGrupo() {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Grupo completo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}p{color:#bbb}</style></head>
<body><main><h1>Los grupos están completos 🙌</h1><p>Estamos abriendo un nuevo grupo. Probá de nuevo en unos minutos.</p></main></body></html>`
  return new Response(html, { status: 503, headers: { ...SEM_CACHE, "content-type": "text/html; charset=utf-8", "retry-after": "300" } })
}

export async function atenderFunil(req: Request, funil: string, contar: boolean): Promise<Response | null> {
  const url = new URL(req.url)
  const origem = [url.searchParams.get("utm_source"), url.searchParams.get("utm_campaign"), url.searchParams.get("src")].filter(Boolean).join(" | ") || null
  const { data, error } = await db().rpc("redir_clique", { p_funil: funil.toLowerCase(), p_origem: origem, p_contar: contar })
  if (error) {
    console.error("[redir] clique", error)
    return paginaSemGrupo()
  }
  const r = data as { ok: boolean; link: string | null; grupo_id: number | null; verificar: boolean; reserva: boolean; erro?: string }
  if (!r.ok) return null

  if (contar) {
    after(async () => {
      try {
        if (r.verificar && r.grupo_id) await verificarGrupo(r.grupo_id)
        await despacharAlertas()
      } catch (e) {
        console.error("[redir] pós-clique", e)
      }
    })
  }
  if (!r.link) return paginaSemGrupo()
  return new Response(null, { status: 302, headers: { ...SEM_CACHE, location: r.link } })
}

