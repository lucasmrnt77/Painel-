import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { tokenValido } from "@/lib/seguranca";
import { abasEntrouLead, type Envio } from "@/lib/entrou-lead";

/**
 * Formato 3 (atual, planilha/unificada.gs): igual ao 2, mas uma aba por página no layout da planilha modelo
 * (General e Trader + "Leads Grupo" de cada uma). Ver formato3().
 *
 * Formato 2 (planilha unificada numa aba só — versão anterior do script):
 * GET /api/planilha?formato=2&pagina=todas[&desde=ISO][&nome=unificada][&l=slug]
 *  - sem "desde": tudo; com "desde": só os leads novos ou que mudaram depois dessa data
 *    (respostas, qualificação, entrada no grupo). Cada linha termina com o ID (chave do telefone),
 *    para a planilha atualizar a linha certa sem reescrever tudo. "cursor" = o "desde" da próxima vez.
 *  - registra em planilha_sync que a planilha buscou dados (o monitor avisa se ela parar).
 *
 * Formato antigo (planilha/espelho.gs, uma planilha por página), mantido igual:
 * GET /api/planilha?token=PLANILHA_TOKEN&pagina=general|trader[&l=slug]
 * Dados do lançamento (o ativo, se não vier ?l=) para o Apps Script da planilha
 * espelho (planilha/espelho.gs), no MESMO formato da planilha "Pagina de Captura General".
 * Uma planilha por página: ?pagina=general (padrão) ou ?pagina=trader.
 *  - "Hoja 1"      → leads da página (colunas A–Q iguais às de antes + Calificado e Email; Trader + Experiencia)
 *  - "Leads Grupo" → entradas nos grupos de WhatsApp das pessoas dessa página (Fecha, Hora, Telefono, Grupo)
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

const EXTRA_V2 = ["Calificado", "Email", "Experiencia", "Página", "ID"];
const COLUNAS_GRUPO_V2 = ["Fecha", "Hora", "Telefono", "Grupo", "Página", "ID"];
const SOBREPOSICAO_MS = 90_000; // o cursor volta 90 s para não perder nada que gravou "no meio"

type Perfil = { q: boolean | null; f: string | null; g: string | null; r: string | null };

function juntarPerfis(perfis: Lead[]): Map<string, Perfil> {
  const perfil = new Map<string, Perfil>();
  for (const p of perfis) {
    const k = String(p.telefone_chave ?? "");
    if (!k) continue;
    const a = perfil.get(k) ?? { q: null, f: null, g: null, r: null };
    perfil.set(k, {
      q: a.q === true || p.qualificado === true ? true : ((p.qualificado as boolean | null) ?? a.q),
      f: (p.faixa_etaria as string) ?? a.f, g: (p.genero as string) ?? a.g, r: (p.resposta_dinheiro as string) ?? a.r,
    });
  }
  return perfil;
}

function linhaBase(l: Lead, p: Perfil): string[] {
  const trader = l.pagina_captura === "trader";
  const [fecha, hora] = dataHora(l.inscrito_em);
  const pais = PAIS_ES[String(l.pais ?? "")] ?? String(l.pais ?? "");
  return [
    fecha, hora, String(l.telefone ?? ""), pais,
    p.f ?? l.faixa_etaria ?? "", p.g ?? l.genero ?? "", p.r ?? l.resposta_dinheiro ?? "",
    `${trader ? "Trader" : "Gen"}-${pais || "Desconocido"}`,
    l.utm_campaign ?? "", l.utm_content ?? "", l.utm_source ?? "", l.utm_medium ?? "", l.utm_term ?? "",
    l.landing ?? "", "Video1", l.pagina_obrigado ?? "", l.no_grupo ? "OK" : "",
  ].map((v) => String(v ?? ""));
}

/** Regra do Trader (igual à do serviço de tracking): só "Nunca hice" não qualifica. */
const qualificaTraderPlanilha = (exp: unknown) => !String(exp ?? "").trim().toLowerCase().startsWith("nunca");
const calificado = (p: Perfil) => (p.q === true ? "Sí" : p.q === false ? "No" : "");
const nomePagina = (l: Lead) => (l.pagina_captura === "trader" ? "Trader" : "General");

const SELECT_LEAD = "inscrito_em, nome, email, telefone, telefone_chave, pais, pagina_captura, experiencia, landing, pagina_obrigado, faixa_etaria, genero, resposta_dinheiro, no_grupo, utm_campaign, utm_content, utm_source, utm_medium, utm_term";
const SELECT_PERFIL = "telefone_chave, qualificado, faixa_etaria, genero, resposta_dinheiro";
const COM_PERFIL = "qualificado.not.is.null,faixa_etaria.not.is.null,genero.not.is.null,resposta_dinheiro.not.is.null";

/** .in() em pedaços (a URL do PostgREST tem limite de tamanho). */
async function porChaves<T>(chaves: string[], consulta: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < chaves.length; i += 200) {
    const { data, error } = await consulta(chaves.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

async function formato2(lanc: { id: number; slug: string; nome: string }, pagina: string, desde: string | null, nome: string, versao: 2 | 3 = 2) {
  const cursor = new Date(Date.now() - SOBREPOSICAO_MS).toISOString();
  let leads: Lead[];
  let perfis: Lead[];
  let membros: Lead[];

  if (!desde) {
    leads = await todas<Lead>((de, ate) =>
      db().from("v_leads_analise").select(SELECT_LEAD).eq("lancamento_id", lanc.id).order("inscrito_em").range(de, ate));
    perfis = await todas<Lead>((de, ate) =>
      db().from("inscricoes").select(SELECT_PERFIL).eq("lancamento_id", lanc.id).or(COM_PERFIL).order("id").range(de, ate));
    membros = await todas<Lead>((de, ate) =>
      db().from("membros_grupo").select("id, telefone, telefone_chave, grupo_nome, primeira_entrada_em")
        .eq("lancamento_id", lanc.id).not("primeira_entrada_em", "is", null).order("primeira_entrada_em").range(de, ate));
  } else {
    // Quem mudou: inscrição nova ou alterada (respostas/qualificação) e movimentação no grupo
    const [insc, mov] = await Promise.all([
      todas<Lead>((de, ate) =>
        db().from("inscricoes").select("id, telefone_chave").eq("lancamento_id", lanc.id)
          .or(`criado_em.gt.${desde},atualizado_em.gt.${desde}`).order("id").range(de, ate)),
      todas<Lead>((de, ate) =>
        db().from("membros_grupo").select("id, telefone, telefone_chave, grupo_nome, primeira_entrada_em")
          .eq("lancamento_id", lanc.id).gt("atualizado_em", desde).order("id").range(de, ate)),
    ]);
    const chaves = [...new Set([...insc, ...mov].map((x) => String(x.telefone_chave ?? "")).filter(Boolean))];
    leads = chaves.length
      ? await porChaves<Lead>(chaves, (lote) => db().from("v_leads_analise").select(SELECT_LEAD).eq("lancamento_id", lanc.id).in("telefone_chave", lote))
      : [];
    perfis = chaves.length
      ? await porChaves<Lead>(chaves, (lote) => db().from("inscricoes").select(SELECT_PERFIL).eq("lancamento_id", lanc.id).or(COM_PERFIL).in("telefone_chave", lote))
      : [];
    membros = mov.filter((m) => m.primeira_entrada_em);
  }

  if (pagina !== "todas") leads = leads.filter((l) => (l.pagina_captura === "trader") === (pagina === "trader"));
  leads.sort((a, b) => String(a.inscrito_em).localeCompare(String(b.inscrito_em)));
  const perfil = juntarPerfis(perfis);
  const vazio: Perfil = { q: null, f: null, g: null, r: null };

  if (versao === 3) {
    const r = await formato3(lanc, leads, perfil, membros, desde);
    // Abas "👤 Entrou Lead" (modelo da gestora de tráfego): uma linha por envio, das pessoas que mudaram
    const chavesEnvios = desde ? [...new Set(leads.map((l) => String(l.telefone_chave ?? "")).filter(Boolean))] : null;
    Object.assign(r.abas, await entrouLead(lanc.id, chavesEnvios));
    await baterPonto(nome, lanc.id, r.total, !desde);
    return { ok: true, formato: 3, lancamento: lanc.slug, nome: lanc.nome, completo: !desde, cursor, gerado_em: new Date().toISOString(), abas: r.abas };
  }

  const linhas = leads.map((l) => {
    const p = perfil.get(String(l.telefone_chave ?? "")) ?? vazio;
    return [...linhaBase(l, p), calificado(p), String(l.email ?? ""), String(l.experiencia ?? ""), nomePagina(l), String(l.telefone_chave ?? "")];
  });

  // "Leads Grupo": entradas no grupo de quem se inscreveu neste lançamento (na página pedida)
  let paginaDe = new Map(leads.map((l) => [String(l.telefone_chave ?? ""), nomePagina(l)]));
  if (desde && membros.length) {
    const faltam = [...new Set(membros.map((m) => String(m.telefone_chave ?? "")))].filter((k) => k && !paginaDe.has(k));
    const extras = await porChaves<Lead>(faltam, (lote) =>
      db().from("v_leads_analise").select("telefone_chave, pagina_captura").eq("lancamento_id", lanc.id).in("telefone_chave", lote));
    const filtrados = pagina === "todas" ? extras : extras.filter((l) => (l.pagina_captura === "trader") === (pagina === "trader"));
    paginaDe = new Map([...paginaDe, ...filtrados.map((l) => [String(l.telefone_chave ?? ""), nomePagina(l)] as [string, string])]);
  }
  const grupo = membros
    .filter((m) => paginaDe.has(String(m.telefone_chave ?? "")))
    .sort((a, b) => String(a.primeira_entrada_em).localeCompare(String(b.primeira_entrada_em)))
    .map((m) => {
      const [fecha, hora] = dataHora(m.primeira_entrada_em);
      return [fecha, hora, String(m.telefone ?? ""), String(m.grupo_nome ?? ""), paginaDe.get(String(m.telefone_chave ?? "")) ?? "", `g${m.id}`];
    });

  await baterPonto(nome, lanc.id, linhas.length, !desde);

  return {
    ok: true, formato: 2, lancamento: lanc.slug, nome: lanc.nome, pagina, completo: !desde, cursor, gerado_em: new Date().toISOString(),
    abas: {
      "Hoja 1": { colunas: COLUNAS_LEADS, extra: EXTRA_V2, linhas },
      "Leads Grupo": { colunas: COLUNAS_GRUPO_V2, extra: [], linhas: grupo },
    },
  };
}

const SELECT_ENVIO = "id, criado_em, telefone, telefone_chave, email, pagina_captura, pc:payload->>pagina_captura, experiencia, landing, pagina_obrigado, faixa_etaria, genero, resposta_dinheiro, qualificado, clicou_grupo_em, utm_source, utm_medium, utm_campaign, utm_content, utm_term";

/** Envios (todos, ou só das pessoas em `chaves`) + quem entrou no grupo → as três abas "Entrou Lead". */
async function entrouLead(lancamentoId: number, chaves: string[] | null) {
  if (chaves && !chaves.length) return abasEntrouLead([], new Set());
  const envios = chaves
    ? await porChaves<Envio>(chaves, (lote) => db().from("inscricoes").select(SELECT_ENVIO).eq("lancamento_id", lancamentoId).in("telefone_chave", lote) as unknown as PromiseLike<{ data: Envio[] | null; error: { message: string } | null }>)
    : await todas<Envio>((de, ate) => db().from("inscricoes").select(SELECT_ENVIO).eq("lancamento_id", lancamentoId).order("id").range(de, ate) as unknown as PromiseLike<{ data: Envio[] | null; error: { message: string } | null }>);
  const membros = chaves
    ? await porChaves<Lead>(chaves, (lote) => db().from("membros_grupo").select("telefone_chave").eq("lancamento_id", lancamentoId).not("primeira_entrada_em", "is", null).in("telefone_chave", lote))
    : await todas<Lead>((de, ate) => db().from("membros_grupo").select("telefone_chave").eq("lancamento_id", lancamentoId).not("primeira_entrada_em", "is", null).order("id").range(de, ate));
  return abasEntrouLead(envios, new Set(membros.map((m) => String(m.telefone_chave ?? "")).filter(Boolean)));
}

/** Batimento: a planilha buscou dados agora (não derruba a resposta se falhar). */
async function baterPonto(nome: string, lancamentoId: number, linhas: number, completo: boolean) {
  const reg = await db().from("planilha_sync").upsert(
    { nome, lancamento_id: lancamentoId, ultima_em: new Date().toISOString(), linhas, completo, ativo: true },
    { onConflict: "nome" },
  );
  if (reg.error) console.error("[planilha] planilha_sync", reg.error.message);
}

/**
 * Formato 3: uma aba por página de captura, cada uma no layout da planilha modelo do lançamento passado.
 *  - "General" = "Hoja 1" da "Pagina de Captura General" (A–Q) + R/S/T livres + U Calificado, V Email, W ID
 *  - "Trader"  = "Leads" da "Pagina de Traders" (A–L) + M CHEQUEO livre + N Pais, O Calificado, P ID
 *  - "Leads Grupo General" / "Leads Grupo Trader" = Fecha, Hora, Telefono, Grupo, ID
 * Cada aba descreve seus blocos de colunas: a planilha escreve só neles e nunca mexe nas colunas livres.
 */
type Bloco = { col: number; cab: string[] };
type AbaV3 = { blocos: Bloco[]; fixos?: { col: number; valores: string[] }[]; formula?: { celula: string; f: string }; linhas: (string | boolean)[][] };

const CAB_TRADER = ["Fecha", "Hora", "Experiencia", "Telefono", "Campana", "Anuncio", "utm_source", "utm_medium", "utm_term", "Landing", "Pagina de gracias", "Grupo"];
const CAB_GRUPO = ["Fecha", "Hora", "Telefono", "Grupo", "ID"];

async function formato3(
  lanc: { id: number }, leads: Lead[], perfil: Map<string, Perfil>, membros: Lead[], desde: string | null,
): Promise<{ abas: Record<string, AbaV3>; total: number }> {
  const vazio: Perfil = { q: null, f: null, g: null, r: null };
  const general: (string | boolean)[][] = [];
  const trader: (string | boolean)[][] = [];
  const paginaDe = new Map<string, "General" | "Trader">();
  for (const l of leads) {
    const k = String(l.telefone_chave ?? "");
    const p = perfil.get(k) ?? vazio;
    if (l.pagina_captura === "trader") {
      paginaDe.set(k, "Trader");
      const [fecha, hora] = dataHora(l.inscrito_em);
      const pais = PAIS_ES[String(l.pais ?? "")] ?? String(l.pais ?? "");
      trader.push([
        fecha, hora, String(l.experiencia ?? ""), String(l.telefone ?? ""),
        String(l.utm_campaign ?? ""), String(l.utm_content ?? ""), String(l.utm_source ?? ""), String(l.utm_medium ?? ""), String(l.utm_term ?? ""),
        String(l.landing ?? ""), String(l.pagina_obrigado ?? ""), l.no_grupo === true,
        // 28/10/2026: sem qualificado gravado (o clique se perdia ao abrir o WhatsApp), vale a regra do Trader pela experiência
        pais, calificado(p.q === null && l.experiencia ? { ...p, q: qualificaTraderPlanilha(l.experiencia) } : p), k,
      ]);
    } else {
      paginaDe.set(k, "General");
      general.push([...linhaBase(l, p), calificado(p), String(l.email ?? ""), k]);
    }
  }

  // Entradas no grupo: precisa saber de que página é a pessoa (no incremental, pode não estar entre os leads alterados)
  if (desde && membros.length) {
    const faltam = [...new Set(membros.map((m) => String(m.telefone_chave ?? "")))].filter((k) => k && !paginaDe.has(k));
    const extras = await porChaves<Lead>(faltam, (lote) =>
      db().from("v_leads_analise").select("telefone_chave, pagina_captura").eq("lancamento_id", lanc.id).in("telefone_chave", lote));
    for (const l of extras) paginaDe.set(String(l.telefone_chave ?? ""), l.pagina_captura === "trader" ? "Trader" : "General");
  }
  const grupoG: string[][] = [];
  const grupoT: string[][] = [];
  [...membros]
    .sort((a, b) => String(a.primeira_entrada_em).localeCompare(String(b.primeira_entrada_em)))
    .forEach((m) => {
      const pag = paginaDe.get(String(m.telefone_chave ?? ""));
      if (!pag) return; // entrou no grupo sem ter se inscrito neste lançamento
      const [fecha, hora] = dataHora(m.primeira_entrada_em);
      (pag === "Trader" ? grupoT : grupoG).push([fecha, hora, String(m.telefone ?? ""), String(m.grupo_nome ?? ""), `g${m.id}`]);
    });

  return {
    total: general.length + trader.length,
    abas: {
      General: {
        blocos: [{ col: 1, cab: COLUNAS_LEADS }, { col: 21, cab: ["Calificado", "Email", "ID"] }],
        fixos: [{ col: 18, valores: ["Demografico", "VIDEO", "3 PREGUNTAS"] }],
        formula: { celula: "R2", f: '=ARRAYFORMULA(IF(F2:F="","",F2:F&" "&E2:E))' },
        linhas: general,
      },
      Trader: {
        blocos: [{ col: 1, cab: CAB_TRADER }, { col: 14, cab: ["Pais", "Calificado", "ID"] }],
        fixos: [{ col: 13, valores: ["CHEQUEO"] }],
        linhas: trader,
      },
      "Leads Grupo General": { blocos: [{ col: 1, cab: CAB_GRUPO }], linhas: grupoG },
      "Leads Grupo Trader": { blocos: [{ col: 1, cab: CAB_GRUPO }], linhas: grupoT },
    },
  };
}

export async function GET(req: Request) {
  if (!tokenValido(req, env.planilhaToken())) return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const slug = sp.get("l");
  const versao = sp.get("formato") === "3" ? 3 : sp.get("formato") === "2" ? 2 : 0;
  const v2 = versao > 0;
  const paginaPedida = sp.get("pagina");
  const pagina = paginaPedida === "trader" ? "trader" : v2 && paginaPedida !== "general" ? "todas" : "general";

  const q = db().from("lancamentos").select("id, slug, nome");
  const { data: lanc } = await (slug ? q.eq("slug", slug) : q.eq("ativo", true).eq("tipo", "lancamento")).limit(1).maybeSingle();
  if (!lanc) return NextResponse.json({ ok: false, erro: "lancamento_nao_encontrado" }, { status: 404 });

  if (v2) {
    const desdeBruto = sp.get("desde");
    const desde = desdeBruto && !Number.isNaN(Date.parse(desdeBruto)) ? new Date(desdeBruto).toISOString() : null;
    const nome = (sp.get("nome") || "unificada").replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 60) || "unificada";
    try {
      const pag = versao === 3 ? "todas" : pagina;
      return NextResponse.json(await formato2(lanc, pag, desde, nome, versao === 3 ? 3 : 2), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

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

    const trader = pagina === "trader";
    const daPagina = leads.filter((l) => (l.pagina_captura === "trader") === trader);
    const chaves = new Set(daPagina.map((l) => String(l.telefone_chave ?? "")).filter(Boolean));
    const linhas = daPagina.map((l) => linha(l, trader));

    const membros = await todas<Lead>((de, ate) =>
      db().from("membros_grupo").select("telefone, telefone_chave, grupo_nome, primeira_entrada_em")
        .eq("lancamento_id", lanc.id).not("primeira_entrada_em", "is", null)
        .order("primeira_entrada_em").range(de, ate));
    const grupo = membros.filter((m) => chaves.has(String(m.telefone_chave ?? ""))).map((m) => {
      const [fecha, hora] = dataHora(m.primeira_entrada_em);
      return [fecha, hora, String(m.telefone ?? ""), String(m.grupo_nome ?? "")];
    });

    return NextResponse.json(
      {
        ok: true, lancamento: lanc.slug, nome: lanc.nome, pagina, gerado_em: new Date().toISOString(),
        abas: {
          "Hoja 1": { colunas: COLUNAS_LEADS, extra: trader ? [...COLUNAS_EXTRA, "Experiencia"] : COLUNAS_EXTRA, linhas },
          "Leads Grupo": { colunas: ["Fecha", "Hora", "Telefono", "Grupo"], extra: [], linhas: grupo },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
