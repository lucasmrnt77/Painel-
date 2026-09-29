import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

/** POST { lancamento_id, linhas: LinhaPlanilha[] } — um lote (até 2000) da planilha. Requer login. */
export async function POST(req: Request) {
  if (!(await estaLogado())) return Response.json({ erro: "nao_autorizado" }, { status: 401 });
  let corpo: { lancamento_id?: unknown; linhas?: unknown; pagina_captura?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "json_invalido" }, { status: 400 });
  }
  const id = Number(corpo.lancamento_id);
  if (!Number.isInteger(id) || !Array.isArray(corpo.linhas) || corpo.linhas.length === 0 || corpo.linhas.length > 2000) {
    return Response.json({ erro: "parametros_invalidos" }, { status: 400 });
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
