import { iguaisSeguro } from "@/lib/seguranca";
import { executarTestesServidor } from "@/lib/testes-eventos";

export const maxDuration = 120;

/**
 * Testes diários dos eventos da Meta (vercel.json → 1x por dia).
 * A Vercel envia "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo || !iguaisSeguro(req.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const r = await executarTestesServidor("agendado");
    return Response.json({ ok: r.ok, total: r.total, falhas: r.falhas, resumo: r.resumo, detalhes: r.detalhes });
  } catch (e) {
    console.error("[cron-testes]", e);
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
