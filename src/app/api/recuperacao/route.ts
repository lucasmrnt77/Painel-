import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";
import { lerEnvios } from "@/lib/recuperacao";

/**
 * POST /api/recuperacao?token=PLANILHA_TOKEN — o Apps Script do chequeo avisa cada mensagem de recuperação
 * enviada ao Unnichat. Corpo: { "lancamento": "dez-26"?, "envios": [{ telefone, enviado_em?, conta?, http?, origem? }] }
 * Sem "lancamento", vale o lançamento ativo. Repetir o mesmo envio não duplica (telefone + horário).
 */
export async function POST(req: Request) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  let corpo: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.length > 300_000) return NextResponse.json({ ok: false, erro: "grande_demais" }, { status: 413 });
    corpo = JSON.parse(t || "{}");
  } catch {
    return NextResponse.json({ ok: false, erro: "json_invalido" }, { status: 400 });
  }
  const slug = typeof corpo.lancamento === "string" ? corpo.lancamento : null;
  const q = db().from("lancamentos").select("id");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });
  const envios = lerEnvios(corpo);
  if (envios.length === 0) return NextResponse.json({ ok: true, gravados: 0 });

  // telefone_chave é calculada no banco (trigger), igual à das inscrições
  const linhas = envios.map((e) => ({ ...e, lancamento_id: (lanc as { id: number }).id, telefone_chave: e.telefone }));
  const { error } = await db().from("recuperacao_envios").upsert(linhas, { onConflict: "lancamento_id,telefone_chave,enviado_em", ignoreDuplicates: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gravados: linhas.length });
}
