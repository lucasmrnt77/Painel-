import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";

/**
 * GET /api/planilha?token=PLANILHA_TOKEN[&l=slug]
 * Foto completa dos leads de um lançamento (o ativo, se não vier ?l=) para o
 * Apps Script da planilha espelho (planilha/espelho.gs). Uma linha por pessoa,
 * já com respostas, qualificação e situação no grupo. Só leitura.
 */
export const maxDuration = 60;

const GRUPO: Record<string, string> = {
  no_grupo: "Sí", saiu: "Salió", fora_do_grupo: "No", aguardando: "Esperando", telefone_invalido: "Tel. inválido",
};

export async function GET(req: Request) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  const slug = new URL(req.url).searchParams.get("l");

  const q = db().from("lancamentos").select("id, slug, nome");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });

  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db()
      .from("v_leads_analise")
      .select("inscrito_em, nome, email, telefone, telefone_chave, pais, pagina_captura, landing, pagina_obrigado, faixa_etaria, genero, resposta_dinheiro, status, entrou_em, utm_campaign, utm_content, utm_source, utm_medium, utm_term")
      .eq("lancamento_id", lanc.id)
      .order("inscrito_em")
      .range(de, de + 999);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Qualificação e respostas por pessoa (a resposta pode ter ficado numa inscrição repetida)
  const perfil = new Map<string, { q: boolean | null; f: string | null; g: string | null; r: string | null }>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db()
      .from("inscricoes")
      .select("telefone_chave, qualificado, faixa_etaria, genero, resposta_dinheiro")
      .eq("lancamento_id", lanc.id)
      .or("qualificado.not.is.null,faixa_etaria.not.is.null,genero.not.is.null,resposta_dinheiro.not.is.null")
      .order("id")
      .range(de, de + 999);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    for (const p of data ?? []) {
      if (!p.telefone_chave) continue;
      const a = perfil.get(p.telefone_chave) ?? { q: null, f: null, g: null, r: null };
      perfil.set(p.telefone_chave, {
        q: a.q === true || p.qualificado === true ? true : (p.qualificado ?? a.q),
        f: p.faixa_etaria ?? a.f, g: p.genero ?? a.g, r: p.resposta_dinheiro ?? a.r,
      });
    }
    if (!data || data.length < 1000) break;
  }

  const fmt = (iso: unknown) => {
    if (typeof iso !== "string") return ["", ""];
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    return [`${v("day")}/${v("month")}/${v("year")}`, `${v("hour")}:${v("minute")}:${v("second")}`];
  };

  const colunas = ["Fecha", "Hora", "Nombre", "Email", "Telefono", "Pais", "Persona", "Landing", "Pagina gracias", "Edad", "Genero",
    "Respuesta", "Calificado", "Grupo", "Entro al grupo", "utm_campaign", "utm_content", "utm_source", "utm_medium", "utm_term"];
  const valores = linhas.map((l) => {
    const p = perfil.get(String(l.telefone_chave ?? "")) ?? { q: null, f: null, g: null, r: null };
    const [fecha, hora] = fmt(l.inscrito_em);
    const [fe, he] = fmt(l.entrou_em);
    return [
      fecha, hora, l.nome ?? "", l.email ?? "", l.telefone ?? "", l.pais ?? "",
      l.pagina_captura === "trader" ? "Trader" : l.pagina_captura === "nunca_operou" ? "General" : "",
      l.landing ?? "", l.pagina_obrigado ?? "", p.f ?? l.faixa_etaria ?? "", p.g ?? l.genero ?? "", p.r ?? l.resposta_dinheiro ?? "",
      p.q === true ? "Sí" : p.q === false ? "No" : "", GRUPO[String(l.status)] ?? String(l.status ?? ""), fe ? `${fe} ${he}` : "",
      l.utm_campaign ?? "", l.utm_content ?? "", l.utm_source ?? "", l.utm_medium ?? "", l.utm_term ?? "",
    ].map((v) => String(v));
  });

  return NextResponse.json(
    { ok: true, lancamento: lanc.slug, nome: lanc.nome, gerado_em: new Date().toISOString(), colunas, linhas: valores },
    { headers: { "Cache-Control": "no-store" } },
  );
}
