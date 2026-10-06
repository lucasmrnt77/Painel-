import { iguaisSeguro } from "@/lib/seguranca";
import { executarMonitor } from "@/lib/monitor";
import { executarRedirecionador } from "@/lib/redirecionador";

export const maxDuration = 60;

const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Chamado pelo Cron da Vercel (vercel.json) a cada 2 minutos.
 * A Vercel envia "Authorization: Bearer <CRON_SECRET>".
 * Roda o monitor de entradas e o redirecionador de grupos; um não derruba o outro.
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!segredo || !iguaisSeguro(auth, `Bearer ${segredo}`)) {
    return new Response("Não autorizado", { status: 401 });
  }
  const [monitor, redirecionador] = await Promise.allSettled([executarMonitor(), executarRedirecionador()]);
  if (monitor.status === "rejected") console.error("[cron] monitor", monitor.reason);
  if (redirecionador.status === "rejected") console.error("[cron] redirecionador", redirecionador.reason);
  const ok = monitor.status === "fulfilled" && redirecionador.status === "fulfilled";
  return Response.json(
    {
      ok,
      ...(monitor.status === "fulfilled" ? monitor.value : { erro: erroTexto(monitor.reason) }),
      redirecionador: redirecionador.status === "fulfilled" ? redirecionador.value : { erro: erroTexto(redirecionador.reason) },
    },
    { status: ok ? 200 : 500 },
  );
}
