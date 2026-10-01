import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";

const STATUS = new Set(["fora_do_grupo", "aguardando", "no_grupo", "saiu", "telefone_invalido"]);

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutraliza fórmulas ao abrir no Excel/Sheets
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** GET /api/exportar?l=slug[&status=fora_do_grupo] — CSV de inscrições (precisa estar logado). */
export async function GET(req: Request) {
  if (!(await estaLogado())) return new Response("Não autorizado", { status: 401 });
  const url = new URL(req.url);
  const slug = url.searchParams.get("l");
  const status = url.searchParams.get("status");
  if (!slug) return new Response("Informe ?l=slug", { status: 400 });

  const linhas: Record<string, unknown>[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = db()
      .from("v_leads")
      .select("nome, email, telefone, pagina_captura, experiencia, faixa_etaria, genero, resposta_dinheiro, status, inscrito_em, entrou_em, saiu_em, n_envios, utm_source, utm_medium, utm_campaign, utm_content")
      .eq("lancamento_slug", slug)
      .order("inscrito_em")
      .range(de, de + passo - 1);
    if (status && STATUS.has(status)) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return new Response(error.message, { status: 500 });
    linhas.push(...(data ?? []));
    if (!data || data.length < passo) break;
  }

  const colunas = ["nome", "email", "telefone", "pagina_captura", "experiencia", "faixa_etaria", "genero", "resposta_dinheiro", "status", "inscrito_em", "entrou_em", "saiu_em", "n_envios", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const corpo = [colunas.join(","), ...linhas.map((l) => colunas.map((c) => csv(l[c])).join(","))].join("\n");
  const nome = `inscricoes-${slug}${status ? `-${status}` : ""}.csv`;
  return new Response("﻿" + corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
