import { estaLogado } from "@/lib/sessao";
import { grupoConfigurado, listarGrupo } from "@/lib/grupo";
import { lerFiltrosGrupo, queryListaGrupo } from "@/lib/grupo-filtros";

const COLUNAS = ["creado_en", "email", "telefono", "pais", "pais_ip", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "url", "envios", "actualizado_en"];

function celula(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutraliza fórmulas ao abrir no Excel/Sheets
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** GET /api/exportar-grupo?periodo=7d[&pais=...] — CSV das inscrições do grupo gratuito (precisa estar logado). */
export async function GET(req: Request) {
  if (!(await estaLogado())) return new Response("Não autorizado", { status: 401 });
  if (!grupoConfigurado()) return new Response("Faltam GRUPO_SUPABASE_URL / GRUPO_SUPABASE_SERVICE_ROLE_KEY", { status: 500 });

  const f = lerFiltrosGrupo(Object.fromEntries(new URL(req.url).searchParams));
  const q = queryListaGrupo(f, COLUNAS.join(","));
  const linhas: Record<string, unknown>[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { linhas: lote } = await listarGrupo<Record<string, unknown>>("inscripciones", q, inicio, inicio + 999);
    linhas.push(...lote);
    if (lote.length < 1000 || inicio > 200_000) break;
  }

  const corpo = [COLUNAS.join(","), ...linhas.map((l) => COLUNAS.map((c) => celula(l[c])).join(","))].join("\n");
  const nome = `inscricoes-grupo-${f.periodo}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
