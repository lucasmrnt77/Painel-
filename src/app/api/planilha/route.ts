import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";

/**
 * GET /api/planilha?token=PLANILHA_TOKEN[&l=slug]
 * Dados do lançamento (o ativo, se não vier ?l=) para o Apps Script da planilha
 * espelho (planilha/espelho.gs), no MESMO formato da planilha "Pagina de Captura General":
 *  - "Hoja 1"      → leads da página General (colunas A–Q iguais às de antes + Calificado e Email)
 *  - "Traders"     → leads da página Trader (mesmas colunas + Experiencia)
 *  - "Leads Grupo" → entradas nos grupos de WhatsApp (Fecha, Hora, Telefono, Grupo)
 * Só leitura.
 */
export const maxDuration = 60;

const PAIS_ES: Record<string, string> = {
  Uruguai: "Uruguay", "Colômbia": "Colombia", Espanha: "España", "EUA/Canadá": "Estados Unidos", Peru: "Perú",
  "México": "México", Chile: "Chile", Paraguai: "Paraguay", Equador: "Ecuador", "Sem DDI": "Desconocido",
};

const COLUNAS_LEADS = ["Fecha", "Hora", "Telefono", "Pais", "Edad", "Genero", "Respuesta_dinero", "Pagina_captura", "Campaign",
  "Anuncio", "Utm_source", "Utm_medium", "Utm_term", "Landing", "Video", "Pag.Gracias", "Chequeo Grupo"];
const COLUNAS_EXTRA = ["Calificado", "Email"];

function dataHora(iso: unknown): [string, string] {
  if (typeof iso !== "string") return ["", ""];
  const p = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return [`${v("day")}/${v("month")}/${v("year")}`, `${v("hour")}:${v("minute")}:${v("second")}`];
}

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Lead = Record<string, string | null | boolean>;

export async function GET(req: Request) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  const slug = new URL(req.url).searchParams.get("l");

  const q = db().from("lancamentos").select("id, slug, nome");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });

  try {
    const leads = await todas<Lead>((de, ate) =>
      db().from("v_leads_analise")
        .select("inscrito_em, nome, email, telefone, telefone_chave, pais, pagina_captura, experiencia, landing, pagina_obrigado, faixa_etaria, genero, resposta_dinheiro, no_grupo, utm_campaign, utm_content, utm_source, utm_medium, utm_term")
        .eq("lancamento_id", lanc.id).order("inscrito_em").range(de, ate));

    // Respostas e qualificação por pessoa (podem ter ficado numa inscrição repetida)
    const perfis = await todas<Lead>((de, ate) =>
      db().from("inscricoes")
        .select("telefone_chave, qualificado, faixa_etaria, genero, resposta_dinheiro")
        .eq("lancamento_id", lanc.id)
        .or("qualificado.not.is.null,faixa_etaria.not.is.null,genero.not.is.null,resposta_dinheiro.not.is.null")
        .order("id").range(de, ate));
    const perfil = new Map<string, { q: boolean | null; f: string | null; g: string | null; r: string | null }>();
    for (const p of perfis) {
      const k = String(p.telefone_chave ?? "");
      if (!k) continue;
      const a = perfil.get(k) ?? { q: null, f: null, g: null, r: null };
      perfil.set(k, {
        q: a.q === true || p.qualificado === true ? true : ((p.qualificado as boolean | null) ?? a.q),
        f: (p.faixa_etaria as string) ?? a.f, g: (p.genero as string) ?? a.g, r: (p.resposta_dinheiro as string) ?? a.r,
      });
    }

    const linha = (l: Lead, trader: boolean) => {
      const p = perfil.get(String(l.telefone_chave ?? "")) ?? { q: null, f: null, g: null, r: null };
      const [fecha, hora] = dataHora(l.inscrito_em);
      const pais = PAIS_ES[String(l.pais ?? "")] ?? String(l.pais ?? "");
      const base = [
        fecha, hora, String(l.telefone ?? ""), pais,
        p.f ?? l.faixa_etaria ?? "", p.g ?? l.genero ?? "", p.r ?? l.resposta_dinheiro ?? "",
        `${trader ? "Trader" : "Gen"}-${pais || "Desconocido"}`,
        l.utm_campaign ?? "", l.utm_content ?? "", l.utm_source ?? "", l.utm_medium ?? "", l.utm_term ?? "",
        l.landing ?? "", "Video1", l.pagina_obrigado ?? "", l.no_grupo ? "OK" : "",
      ].map((v) => String(v ?? ""));
      const extra = [p.q === true ? "Sí" : p.q === false ? "No" : "", String(l.email ?? "")];
      return trader ? [...base, ...extra, String(l.experiencia ?? "")] : [...base, ...extra];
    };

    const general = leads.filter((l) => l.pagina_captura !== "trader").map((l) => linha(l, false));
    const traders = leads.filter((l) => l.pagina_captura === "trader").map((l) => linha(l, true));

    const membros = await todas<Lead>((de, ate) =>
      db().from("membros_grupo").select("telefone, grupo_nome, primeira_entrada_em")
        .eq("lancamento_id", lanc.id).not("primeira_entrada_em", "is", null)
        .order("primeira_entrada_em").range(de, ate));
    const grupo = membros.map((m) => {
      const [fecha, hora] = dataHora(m.primeira_entrada_em);
      return [fecha, hora, String(m.telefone ?? ""), String(m.grupo_nome ?? "")];
    });

    return NextResponse.json(
      {
        ok: true, lancamento: lanc.slug, nome: lanc.nome, gerado_em: new Date().toISOString(),
        abas: {
          "Hoja 1": { colunas: COLUNAS_LEADS, extra: COLUNAS_EXTRA, linhas: general },
          Traders: { colunas: COLUNAS_LEADS, extra: [...COLUNAS_EXTRA, "Experiencia"], linhas: traders },
          "Leads Grupo": { colunas: ["Fecha", "Hora", "Telefono", "Grupo"], extra: [], linhas: grupo },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
