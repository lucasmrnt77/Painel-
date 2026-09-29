import { iguaisSeguro } from "@/lib/seguranca";
import { executarMonitor } from "@/lib/monitor";

export const maxDuration = 60;

/**
 * Chamado pelo Cron da Vercel (vercel.json) a cada 2 minutos.
 * A Vercel envia "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!segredo || !iguaisSeguro(auth, `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const r = await executarMonitor();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
