import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { corrigirTelefonesAutomatico } from "@/lib/base-leads";

export const maxDuration = 120;

/**
 * POST { tipo: "leads" | "compras", edicao?: codigo, linhas: [...] } — um lote (até 2000). Requer login.
 * POST { tipo: "atualizar" } — recalcula as estatísticas (no fim da importação).
 * Cada linha: leads   → edicao, fonte, data, telefone, pais, email
 *             compras → edicao, produto (ET|TPP), fonte, data, telefone, telefone_alt, pais, email,
 *                       email_compra, estado, conta_compra (sim|nao), valor_usd
 * "edicao" na linha tem prioridade; senão vale a escolhida na tela.
 */
export async function POST(req: Request) {
  if (!(await estaLogado())) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: { tipo?: unknown; edicao?: unknown; linhas?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "json_invalido" }, { status: 400 });
  }
  if (corpo.tipo === "atualizar") {
    // Fim da importação: recalcula as estatísticas
    await corrigirTelefonesAutomatico();
    const { data, error } = await db().rpc("bd_atualizar_base");
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    return Response.json(data);
  }
  if (!Array.isArray(corpo.linhas) || corpo.linhas.length === 0 || corpo.linhas.length > 2000) {
    return Response.json({ erro: "parametros_invalidos" }, { status: 400 });
  }
  const edicao = typeof corpo.edicao === "string" && corpo.edicao ? corpo.edicao : null;
  const fn = corpo.tipo === "compras" ? "bd_importar_compras" : corpo.tipo === "leads" ? "bd_importar_leads" : null;
  if (!fn) return Response.json({ erro: "tipo_invalido" }, { status: 400 });
  const { data, error } = await db().rpc(fn, { p_linhas: corpo.linhas, p_edicao: edicao });
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  return Response.json(data);
}
