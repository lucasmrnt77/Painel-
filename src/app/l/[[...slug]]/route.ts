import { db } from "@/lib/supabase";
import { ehRobo } from "@/lib/convite";
import { montarDestino, paginaLinkNaoEncontrado } from "@/lib/links";
import { atenderFunil } from "@/lib/redir-clique";

/**
 * Links curtos: link.traderdelite.net/<slug> chega aqui como /l/<slug>
 * (rewrite por domínio em next.config.ts). Também dá para testar pelo
 * domínio do painel: /l/<slug>.
 * Se não existir link curto com esse nome mas existir um funil do redirecionador
 * (ex.: link.traderdelite.net/grupo), o clique vai para o grupo da vez do funil.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SEM_CACHE = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex" };

function naoEncontrado() {
  return new Response(paginaLinkNaoEncontrado(), { status: 404, headers: { ...SEM_CACHE, "content-type": "text/html; charset=utf-8" } });
}

async function atender(req: Request, partes: string[] | undefined, contar: boolean) {
  const slug = (partes ?? []).join("/");
  if (!slug) {
    const raiz = process.env.LINKS_RAIZ?.trim();
    return raiz ? new Response(null, { status: 302, headers: { ...SEM_CACHE, location: raiz } }) : naoEncontrado();
  }
  if (slug.length > 80) return naoEncontrado();

  const { data, error } = await db().rpc("link_clique", {
    p_slug: slug,
    p_contar: contar,
    p_pais: req.headers.get("x-vercel-ip-country"),
    p_referer: req.headers.get("referer"),
  });
  if (error) {
    console.error("[links] clique", error);
    return new Response("Erro temporário. Tente de novo em instantes.", { status: 503, headers: SEM_CACHE });
  }
  const r = data as { ok: boolean; url?: string; repassar_parametros?: boolean };
  if (!r.ok || !r.url) {
    if (!slug.includes("/")) {
      const funil = await atenderFunil(req, slug, contar);
      if (funil) return funil;
    }
    return naoEncontrado();
  }

  const destino = montarDestino(r.url, new URL(req.url).searchParams, r.repassar_parametros !== false);
  return new Response(null, { status: 302, headers: { ...SEM_CACHE, location: destino } });
}

export async function GET(req: Request, ctx: RouteContext<"/l/[[...slug]]">) {
  const { slug } = await ctx.params;
  return atender(req, slug, !ehRobo(req.headers.get("user-agent")));
}

export async function HEAD(req: Request, ctx: RouteContext<"/l/[[...slug]]">) {
  const { slug } = await ctx.params;
  return atender(req, slug, false);
}
