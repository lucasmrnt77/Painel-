import { db } from "@/lib/supabase";
import { ehRobo } from "@/lib/convite";
import { montarDestino, paginaLinkNaoEncontrado } from "@/lib/links";
import { chavesDoClique } from "@/lib/criativos";
import { atenderFunil } from "@/lib/redir-clique";

/**
 * Links curtos: link.traderdelite.net/<slug> chega aqui como /l/<slug>
 * (rewrite por domínio em next.config.ts). Também dá para testar pelo
 * domínio do painel: /l/<slug>.
 * Se não existir link curto com esse nome mas existir um funil do redirecionador
 * (ex.: link.traderdelite.net/grupo), o clique vai para o grupo da vez do funil.
 * Link "por criativo" (ex.: /Lanzamiento): o nome do anúncio / utm_content escolhe a página na aba Criativos
 * (Trader, General ou Jubilar, numa variação fixa ou na divisão normal da página).
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

  const entrada = new URL(req.url).searchParams;
  const porCriativo = await destinoPorCriativo(slug, entrada, contar);
  if (porCriativo) return new Response(null, { status: 302, headers: { ...SEM_CACHE, location: porCriativo } });

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

  const destino = montarDestino(r.url, entrada, r.repassar_parametros !== false);
  return new Response(null, { status: 302, headers: { ...SEM_CACHE, location: destino } });
}

type RespostaCriativo = { usar: boolean; variacao?: string | null; url_base?: string; link_divisao?: string | null; repassar_parametros?: boolean };

/** Endereço pela tabela de criativos, ou null para seguir o link normal (link comum, criativo sem página, erro). */
async function destinoPorCriativo(slug: string, entrada: URLSearchParams, contar: boolean): Promise<string | null> {
  const chaves = chavesDoClique(entrada);
  const { data, error } = await db().rpc("criativo_destino", { p_slug: slug, p_chaves: chaves, p_contar: contar });
  if (error) {
    if (error.code !== "PGRST202") console.error("[links] criativo", error.message); // PGRST202 = antes da migração 030
    return null;
  }
  const r = data as RespostaCriativo;
  if (!r?.usar || !r.url_base) return null;
  const repassar = r.repassar_parametros !== false;
  if (r.variacao) return montarDestino(`${r.url_base}${r.variacao}`, entrada, repassar);
  // Divisão normal da página: sorteia pelo link da aba Links (/v1, /v2…) e conta o clique nele
  if (r.link_divisao) {
    const div = await db().rpc("link_clique", { p_slug: r.link_divisao, p_contar: contar, p_pais: null, p_referer: null });
    const d = div.data as { ok: boolean; url?: string } | null;
    if (!div.error && d?.ok && d.url) return montarDestino(d.url, entrada, repassar);
  }
  return montarDestino(`${r.url_base}/`, entrada, repassar);
}

export async function GET(req: Request, ctx: RouteContext<"/l/[[...slug]]">) {
  const { slug } = await ctx.params;
  return atender(req, slug, !ehRobo(req.headers.get("user-agent")));
}

export async function HEAD(req: Request, ctx: RouteContext<"/l/[[...slug]]">) {
  const { slug } = await ctx.params;
  return atender(req, slug, false);
}
