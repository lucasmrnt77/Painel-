import { tokenValido } from "@/lib/seguranca";
import { lerResultadoNavegador } from "@/lib/testes-casos";
import { registrarExecucao } from "@/lib/testes-eventos";

/**
 * Recebe o resultado do teste no navegador (GitHub Actions → .github/workflows/testes-eventos.yml).
 * Authorization: Bearer <TESTES_TOKEN>
 */
export async function POST(req: Request) {
  const token = process.env.TESTES_TOKEN?.trim();
  if (!token || !tokenValido(req, token)) return Response.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  let corpo: unknown;
  try {
    const bruto = await req.text();
    if (bruto.length > 100_000) return Response.json({ ok: false, erro: "corpo grande demais" }, { status: 413 });
    corpo = JSON.parse(bruto);
  } catch {
    return Response.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const exec = lerResultadoNavegador(corpo);
  if (!exec) return Response.json({ ok: false, erro: "resultado inválido" }, { status: 400 });
  try {
    const salvo = await registrarExecucao(exec);
    return Response.json({ ok: true, id: salvo.id, envio: salvo.envio_status ?? null });
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
