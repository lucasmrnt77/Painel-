import "server-only";
import { casaFiltro, type CampanhaMeta, type LeituraConta } from "./meta-conta-regras";

/**
 * Leitura direta da conta de anúncios na API de Marketing da Meta (só leitura).
 * Variáveis na Vercel: META_ADS_TOKEN (token do usuário do sistema, permissão ads_read) e
 * META_AD_ACCOUNT_ID (só os números, sem "act_"). META_GRAPH_VERSION é opcional.
 * O token vai no cabeçalho Authorization — nunca na URL nem nos logs.
 */
const VERSAO = () => process.env.META_GRAPH_VERSION?.trim() || "v23.0";

export function metaContaConfigurada(): boolean {
  return Boolean(process.env.META_ADS_TOKEN?.trim() && process.env.META_AD_ACCOUNT_ID?.trim());
}

export class ErroMeta extends Error {
  constructor(msg: string, public codigo?: number) { super(msg); }
}

type Pagina<T> = { data?: T[]; paging?: { next?: string } };

async function chamar<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.META_ADS_TOKEN!.trim()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!r.ok || j.error) throw new ErroMeta(j.error?.message ?? `HTTP ${r.status}`, j.error?.code);
  return j;
}

function url(caminho: string, params: Record<string, string>): string {
  const u = new URL(`https://graph.facebook.com/${VERSAO()}/${caminho}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function todas<T>(primeira: string, limite = 10): Promise<T[]> {
  const saida: T[] = [];
  let prox: string | undefined = primeira;
  for (let i = 0; prox && i < limite; i++) {
    const p: Pagina<T> = await chamar<Pagina<T>>(prox);
    saida.push(...(p.data ?? []));
    prox = p.paging?.next;
  }
  return saida;
}

type Conta = { name?: string; account_status: number; disable_reason?: number; currency?: string; adtrust_dsl?: number | string; timezone_name?: string };
type Camp = { id: string; name: string; daily_budget?: string; effective_status?: string };
type Conj = { campaign_id: string; daily_budget?: string };
type Ins = { campaign_id: string; campaign_name?: string; spend?: string };

export type ResultadoConta = LeituraConta & { nomeConta: string | null; fuso: string | null; limiteDisponivel: boolean; campanhasDaConta: number };

/** Lê a conta, as campanhas ativas cujo nome casa com o filtro do lançamento, os orçamentos e o gasto de hoje. */
export async function lerContaMeta(filtro: string): Promise<ResultadoConta> {
  const conta = `act_${process.env.META_AD_ACCOUNT_ID!.trim().replace(/^act_/, "")}`;
  // adtrust_dsl = limite de gasto diário definido pela Meta (campo pouco documentado: se a API recusar, segue sem ele)
  let c: Conta;
  let limiteDisponivel = true;
  try {
    c = await chamar<Conta>(url(conta, { fields: "name,account_status,disable_reason,currency,adtrust_dsl,timezone_name" }));
  } catch (e) {
    if (!(e instanceof ErroMeta) || e.codigo !== 100) throw e;
    limiteDisponivel = false;
    c = await chamar<Conta>(url(conta, { fields: "name,account_status,disable_reason,currency,timezone_name" }));
  }
  const ativas = JSON.stringify(["ACTIVE"]);
  const [camps, conjs, ins] = await Promise.all([
    todas<Camp>(url(`${conta}/campaigns`, { fields: "id,name,daily_budget,effective_status", effective_status: ativas, limit: "200" })),
    todas<Conj>(url(`${conta}/adsets`, { fields: "campaign_id,daily_budget", effective_status: ativas, limit: "500" })),
    todas<Ins>(url(`${conta}/insights`, { level: "campaign", date_preset: "today", fields: "campaign_id,campaign_name,spend", limit: "500" })),
  ]);
  // Orçamento em centavos (unidade mínima da moeda). CBO: orçamento na campanha; senão, soma dos conjuntos ativos.
  const porConj = new Map<string, number>();
  for (const s of conjs) if (s.daily_budget) porConj.set(s.campaign_id, (porConj.get(s.campaign_id) ?? 0) + Number(s.daily_budget) / 100);
  const gasto = new Map(ins.map((i) => [i.campaign_id, Number(i.spend) || 0]));
  const campanhas: CampanhaMeta[] = camps
    .filter((x) => casaFiltro(filtro, x.name))
    .map((x) => ({
      id: x.id, nome: x.name,
      orcamentoDia: x.daily_budget ? Number(x.daily_budget) / 100 : porConj.get(x.id) ?? 0,
      gastoHoje: gasto.get(x.id) ?? 0,
    }));
  const dsl = c.adtrust_dsl == null ? null : Number(c.adtrust_dsl);
  return {
    status: c.account_status, motivo: c.disable_reason ?? null,
    limiteDiario: dsl != null && Number.isFinite(dsl) && dsl > 0 ? dsl : null,
    moeda: c.currency ?? "USD", campanhas, lidoEm: new Date().toISOString(),
    nomeConta: c.name ?? null, fuso: c.timezone_name ?? null, limiteDisponivel, campanhasDaConta: camps.length,
  };
}
