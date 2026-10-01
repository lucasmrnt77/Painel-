import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { tokenValido } from "@/lib/seguranca";
import { lerCorpo, CorpoGrandeDemais } from "@/lib/corpo";
import { extrairCaptura } from "@/lib/captura";

/**
 * POST /api/captura/perfil?token=CAPTURA_TOKEN[&lancamento=slug]
 * Respostas da página de obrigado (depois do cadastro): idade, gênero e
 * capacidade de investimento. Grava na inscrição mais recente do telefone
 * no lançamento indicado (ou no ativo). Campos aceitos: telefono/telefone,
 * age_range/edad, gender/genero, respuesta/capital_amount/respuesta_dinero.
 */
const STATUS_ERRO: Record<string, number> = {
  telefone_invalido: 400,
  lancamento_inexistente: 404,
  sem_lancamento_ativo: 409,
  inscricao_nao_encontrada: 404,
};

export async function POST(req: Request) {
  if (!tokenValido(req, env.capturaToken())) {
    return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  }
  let bruto: unknown;
  try {
    bruto = await lerCorpo(req);
  } catch (e) {
    const grande = e instanceof CorpoGrandeDemais;
    return NextResponse.json({ ok: false, erro: grande ? "corpo_grande_demais" : "corpo_invalido" }, { status: grande ? 413 : 400 });
  }

  const d = extrairCaptura(bruto, new URL(req.url).searchParams);
  if (!d.telefone) return NextResponse.json({ ok: false, erro: "telefone_obrigatorio" }, { status: 400 });
  if (!d.faixa_etaria && !d.genero && !d.resposta_dinheiro) {
    return NextResponse.json({ ok: false, erro: "sem_respostas" }, { status: 400 });
  }

  const { data, error } = await db().rpc("registrar_perfil", {
    p_lancamento_slug: d.lancamento,
    p_telefone: d.telefone,
    p_faixa_etaria: d.faixa_etaria,
    p_genero: d.genero,
    p_resposta_dinheiro: d.resposta_dinheiro,
  });
  if (error) {
    console.error("[captura/perfil] erro no banco", error);
    return NextResponse.json({ ok: false, erro: "erro_interno" }, { status: 500 });
  }
  const r = data as { ok: boolean; erro?: string; inscricao_id?: number };
  if (!r.ok) return NextResponse.json(r, { status: STATUS_ERRO[r.erro ?? ""] ?? 400 });
  return NextResponse.json(r, { status: 200 });
}
