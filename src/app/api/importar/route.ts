import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * POST { lancamento_id, tipo, linhas, pagina_captura } — um lote (até 2000). Requer login.
 *   tipo "leads"    → importar_planilha (exige pagina_captura)
 *   tipo "entradas" → importar_entradas_grupo (lista de quem entrou nos grupos)
 *   tipo "finalizar" → atualizar_estatisticas (ANALYZE depois da importação)
 */
export async function POST(req: Request) {
  if (!(await estaLogado())) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: { lancamento_id?: unknown; linhas?: unknown; pagina_captura?: unknown; tipo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "json_invalido" }, { status: 400 });
  }
  if (corpo.tipo === "finalizar") {
    const { error } = await db().rpc("atualizar_estatisticas");
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }
  const id = Number(corpo.lancamento_id);
  if (!Number.isInteger(id) || !Array.isArray(corpo.linhas) || corpo.linhas.length === 0 || corpo.linhas.length > 2000) {
    return Response.json({ erro: "parametros_invalidos" }, { status: 400 });
  }
  if (corpo.tipo === "entradas") {
    const { data, error } = await db().rpc("importar_entradas_grupo", { p_lancamento_id: id, p_linhas: corpo.linhas });
    if (error) return Response.json({ erro: error.message }, { status: 500 });
    return Response.json(data);
  }
  const pagina = corpo.pagina_captura;
  if (pagina !== "trader" && pagina !== "nunca_operou") {
    return Response.json({ erro: "escolha a página de captura" }, { status: 400 });
  }
  const { data, error } = await db().rpc("importar_planilha", {
    p_lancamento_id: id, p_linhas: corpo.linhas, p_pagina_captura: pagina,
  });
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  return Response.json(data);
}
