import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";

function csv(v: unknown): string {
  const s = v == null ? "" : typeof v === "boolean" ? (v ? "sim" : "nao") : String(v);
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s; // neutraliza fórmulas no Excel/Sheets
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

const COLUNAS = [
  "telefone", "pais", "email", "n_lancamentos", "lancamentos", "primeiro", "ultimo",
  "comprou_et", "compras_et", "comprou_tpp", "compras_tpp", "comprou_et_na_participacao", "valor_usd",
];

/**
 * GET /api/base-leads/exportar?n=todos|1|2|3|4+&compra=todos|nao|et|tpp|tpp-sem-et&pais=Argentina&edicao=mar-2026
 *     &combo=mar-2026, mai-2026 (combinação exata de lançamentos)
 * CSV de pessoas (uma linha por telefone). Precisa estar logado.
 */
export async function GET(req: Request) {
  if (!(await estaLogado())) return new Response("Não autorizado", { status: 401 });
  const url = new URL(req.url);
  const n = url.searchParams.get("n") ?? "todos";
  const compra = url.searchParams.get("compra") ?? "todos";
  const pais = url.searchParams.get("pais") ?? "";
  const edicao = url.searchParams.get("edicao") ?? "";
  // combinação exata de lançamentos (ex.: "mar-2026, mai-2026"), vinda da tabela de repetidos
  const combo = url.searchParams.get("combo") ?? "";

  const linhas: Record<string, unknown>[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = db().from("v_bd_pessoas").select(COLUNAS.join(", ")).order("telefone").range(de, de + passo - 1);
    if (n === "1" || n === "2" || n === "3") q = q.eq("n_lancamentos", Number(n));
    else if (n === "4+") q = q.gte("n_lancamentos", 4);
    if (compra === "nao") q = q.eq("comprou_et", false).eq("comprou_tpp", false);
    else if (compra === "et") q = q.eq("comprou_et", true);
    else if (compra === "tpp") q = q.eq("comprou_tpp", true);
    else if (compra === "tpp-sem-et") q = q.eq("comprou_tpp", true).eq("comprou_et", false);
    if (pais) q = q.eq("pais", pais);
    if (/^[a-z0-9-]+$/.test(edicao)) q = q.like("lancamentos", `%${edicao}%`);
    if (/^[a-z0-9, -]+$/.test(combo)) q = q.eq("lancamentos", combo);
    const { data, error } = await q;
    if (error) return new Response(error.message, { status: 500 });
    linhas.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < passo) break;
  }

  const corpo = [COLUNAS.join(","), ...linhas.map((l) => COLUNAS.map((c) => csv(l[c])).join(","))].join("\n");
  const nome = combo
    ? `base-leads-${combo.replace(/, /g, "+")}.csv`
    : `base-leads-${n}${compra !== "todos" ? `-${compra}` : ""}${edicao ? `-${edicao}` : ""}${pais ? `-${pais.toLowerCase()}` : ""}.csv`;
  return new Response("﻿" + corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
