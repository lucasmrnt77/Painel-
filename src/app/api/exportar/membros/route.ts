import { estaLogado } from "@/lib/sessao";
import { db } from "@/lib/supabase";

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutraliza fórmulas ao abrir no Excel/Sheets
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso)).replace(",", "");

/**
 * GET /api/exportar/membros?gid=120363…[&nome=…] — CSV com e-mail, telefone, página e hora de entrada de todos
 * os membros de um grupo (precisa estar logado). Serve para resgatar a base quando um grupo cai.
 */
export async function GET(req: Request) {
  if (!(await estaLogado())) return new Response("Não autorizado", { status: 401 });
  const url = new URL(req.url);
  const gid = (url.searchParams.get("gid") ?? "").replace(/@g\.us$/, "");
  if (!/^\d{10,30}$/.test(gid)) return new Response("Informe ?gid= (identificador do grupo no WhatsApp)", { status: 400 });
  const { data, error } = await db().rpc("membros_grupo_contatos", { p_grupo_id: gid });
  if (error) return new Response(`Erro: ${error.message}`, { status: 500 });
  const linhas = (data ?? []) as { email: string; telefone: string; pagina: string; entrou_em: string }[];
  const corpo = [
    "email,telefone,pagina,entrou_no_grupo",
    ...linhas.map((l) => [l.email, l.telefone, l.pagina, dataHora(l.entrou_em)].map(csv).join(",")),
  ].join("\n");
  const nome = (url.searchParams.get("nome") ?? gid).replace(/[^\w#-]+/g, "-").replace(/^-+|-+$/g, "") || gid;
  return new Response("﻿" + corpo + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="membros-${nome.replace("#", "")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
