import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { siteDaVisita } from "@/lib/criativos";

/**
 * POST /api/visita — as landings avisam quando alguém abre a página (1 vez por sessão).
 * Corpo (text/plain ou JSON): { "landing": "/v1", "lancamento": "teste-paginas"?, "site": "trader"? }
 * Sem "site", o site sai do domínio de origem (eventotrader.* = Trader, eventojubilar.* = Jubilar).
 * Público de propósito (o navegador chama direto, sem token): só soma +1 num
 * contador por dia × landing × país. O país vem do cabeçalho da Vercel, não do corpo.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const LANDING = /^\/[A-Za-z0-9_/-]{0,60}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let b: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.length > 1000) return new NextResponse(null, { status: 413, headers: CORS });
    b = JSON.parse(t || "{}");
  } catch {
    return new NextResponse(null, { status: 400, headers: CORS });
  }
  const landing = typeof b.landing === "string" ? b.landing.trim() : "";
  const lancamento = typeof b.lancamento === "string" && SLUG.test(b.lancamento) ? b.lancamento : null;
  if (!LANDING.test(landing)) return new NextResponse(null, { status: 400, headers: CORS });

  // General e Trader usam os mesmos endereços (/v1, /v2…): o site vem do domínio que mandou a visita
  const origem = `${req.headers.get("origin") ?? ""} ${req.headers.get("referer") ?? ""}`.toLowerCase();
  const site = siteDaVisita(b.site, origem);
  const { error } = await db().rpc("registrar_visita", {
    p_lancamento_slug: lancamento,
    p_landing: landing,
    p_pais: req.headers.get("x-vercel-ip-country"),
    p_site: site,
  });
  if (error) console.error("[visita]", error.message);
  return new NextResponse(null, { status: 204, headers: CORS });
}
