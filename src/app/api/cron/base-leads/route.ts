import { iguaisSeguro } from "@/lib/seguranca";
import { db } from "@/lib/supabase";

export const maxDuration = 120;

/**
 * Base de leads: recalcula as estatísticas 1x por hora (vercel.json), para as inscrições novas do
 * lançamento atual entrarem nos números. A Vercel envia "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo || !iguaisSeguro(req.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  await db().rpc("bd_cruzar_telefones"); // telefones com erro que aparecem completos em outro registro (027)
  const { data, error } = await db().rpc("bd_atualizar_base");
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  return Response.json(data);
}
