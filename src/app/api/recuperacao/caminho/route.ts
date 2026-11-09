import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";
import { lerAviso } from "@/lib/recuperacao-caminhos";

/**
 * POST (ou GET) /api/recuperacao/caminho?token=PLANILHA_TOKEN — bloco "Requisição HTTP" do fluxo de recuperação
 * no Unnichat (056). Corpo JSON (ou ?query): { "telefone": "<variável do telefone>", "caminho": "A", "tipo": "botao"|"link",
 * "etapa": "enviado"|"clicou", "fluxo"?: "general"|"trader", "lancamento"?: slug }.
 * Repetir o mesmo aviso não duplica. Sem "lancamento", vale o lançamento ativo.
 */
async function registrar(req: Request, dados: Record<string, unknown>) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  const a = lerAviso(dados);
  if ("erro" in a) return NextResponse.json({ ok: false, erro: a.erro }, { status: 400 });
  const slug = typeof dados.lancamento === "string" && dados.lancamento.trim() ? dados.lancamento.trim() : null;
  const q = db().from("lancamentos").select("id");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });
  const { error } = await db().from("recuperacao_caminhos").upsert(
    { lancamento_id: (lanc as { id: number }).id, telefone: a.telefone, telefone_chave: a.telefone, caminho: a.caminho, tipo: a.tipo, etapa: a.etapa, fluxo: a.fluxo },
    { onConflict: "lancamento_id,telefone_chave,caminho,etapa", ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, caminho: a.caminho, tipo: a.tipo, etapa: a.etapa });
}

export async function POST(req: Request) {
  let dados: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.length > 5000) return NextResponse.json({ ok: false, erro: "grande_demais" }, { status: 413 });
    if (t.trim().startsWith("{")) dados = JSON.parse(t);
    else if (t.trim()) dados = Object.fromEntries(new URLSearchParams(t));
  } catch {
    return NextResponse.json({ ok: false, erro: "json_invalido" }, { status: 400 });
  }
  const url = new URL(req.url);
  for (const [k, v] of url.searchParams) if (k !== "token" && dados[k] == null) dados[k] = v;
  return registrar(req, dados);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dados = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "token"));
  return registrar(req, dados);
}
