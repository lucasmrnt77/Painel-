import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";
import { lerTelefonesConsulta } from "@/lib/recuperacao";

/**
 * POST /api/recuperacao/no-grupo?token=PLANILHA_TOKEN — o Apps Script do chequeo pergunta, ANTES de mandar a
 * recuperação, quem já entrou num grupo do lançamento (entradas do Sendflow gravadas no painel).
 * Corpo: { "lancamento"?: "dez-26", "telefones": ["5989...", ...] }. Resposta: { ok, no_grupo: [telefones que já entraram] }.
 * Sem "lancamento", vale o lançamento ativo. Se o painel falhar, o script segue mandando como antes.
 */
export async function POST(req: Request) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  let corpo: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.length > 100_000) return NextResponse.json({ ok: false, erro: "grande_demais" }, { status: 413 });
    corpo = JSON.parse(t || "{}");
  } catch {
    return NextResponse.json({ ok: false, erro: "json_invalido" }, { status: 400 });
  }
  const slug = typeof corpo.lancamento === "string" && corpo.lancamento.trim() ? corpo.lancamento.trim() : null;
  const q = db().from("lancamentos").select("id");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });

  const tels = lerTelefonesConsulta(corpo);
  if (tels.length === 0) return NextResponse.json({ ok: true, no_grupo: [] });
  const { data, error } = await db().from("membros_grupo").select("telefone_chave")
    .eq("lancamento_id", (lanc as { id: number }).id).in("telefone_chave", [...new Set(tels.map((t) => t.chave))]);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const dentro = new Set(((data ?? []) as { telefone_chave: string }[]).map((m) => m.telefone_chave));
  return NextResponse.json({ ok: true, consultados: tels.length, no_grupo: tels.filter((t) => dentro.has(t.chave)).map((t) => t.telefone) });
}
