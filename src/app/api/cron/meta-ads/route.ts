import { iguaisSeguro } from "@/lib/seguranca";
import { executarAlertasAds } from "@/lib/meta-ads";

export const maxDuration = 60;

/** Alertas de gasto e custo por lead na Meta, a cada 30 min (vercel.json). A Vercel envia "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo || !iguaisSeguro(req.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await executarAlertasAds()) });
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
