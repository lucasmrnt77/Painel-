import { iguaisSeguro } from "@/lib/seguranca";
import { executarMonitor } from "@/lib/monitor";
import { executarRedirecionador } from "@/lib/redirecionador";
import { drenarFilaWhatsapp } from "@/lib/whatsapp";

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
  // Alertas que ficaram na fila (limite de 2 a cada 2 min) saem aqui
  const fila = await drenarFilaWhatsapp().then((m) => m.size).catch((e) => { console.error("[cron] fila whatsapp", e); return 0; });
  const ok = monitor.status === "fulfilled" && redirecionador.status === "fulfilled";
  return Response.json(
    {
      ok,
      ...(monitor.status === "fulfilled" ? monitor.value : { erro: erroTexto(monitor.reason) }),
      redirecionador: redirecionador.status === "fulfilled" ? redirecionador.value : { erro: erroTexto(redirecionador.reason) },
      fila_whatsapp: fila,
    },
    { status: ok ? 200 : 500 },
  );
}
