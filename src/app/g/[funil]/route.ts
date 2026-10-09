import { ehRobo } from "@/lib/convite"
import { atenderFunil } from "@/lib/redir-clique"

/**
 * Link público do redirecionador: /g/<funil> (ex.: /g/trader, /g/geral, /g/grupo).
 * No domínio de links também funciona direto: link.traderdelite.net/<funil>.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 30

const naoEncontrado = () => new Response("Link não encontrado", { status: 404, headers: { "cache-control": "no-store, max-age=0" } })

export async function GET(req: Request, ctx: RouteContext<"/g/[funil]">) {
  const { funil } = await ctx.params
  return (await atenderFunil(req, funil, !ehRobo(req.headers.get("user-agent")))) ?? naoEncontrado()
}

export async function HEAD(req: Request, ctx: RouteContext<"/g/[funil]">) {
  const { funil } = await ctx.params
  return (await atenderFunil(req, funil, false)) ?? naoEncontrado()
}
