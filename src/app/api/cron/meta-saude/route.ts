import { iguaisSeguro } from "@/lib/seguranca";
import { atualizarSaudeMeta } from "@/lib/meta-saude";

export const maxDuration = 60;

/** "Saúde na Meta" 1x por dia (vercel.json). A Vercel envia "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo || !iguaisSeguro(req.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const r = await atualizarSaudeMeta("agendado");
    return Response.json({ ok: r.ok, problemas: r.problemas, avisos: r.avisos });
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
