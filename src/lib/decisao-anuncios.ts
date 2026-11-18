/**
 * Decisão por anúncio (18/11/2026): escalar, manter ou pausar com base em TODOS os dias de cada anúncio,
 * e não em um dia isolado (com 2 leads, um lead a mais ou a menos muda tudo).
 *
 * Métrica: custo por lead qualificado (o mesmo evento que vai para a Meta), comparado ao custo previsto nas
 * premissas do lançamento (pc_lancamento_funil_pais.cpl_base; Jubilados usa o da General).
 * Faixa provável: intervalo de 95% do número de qualificados (Poisson, aproximação de Wilson–Hilferty),
 * convertido em custo: verba ÷ limite superior … verba ÷ limite inferior.
 * Regras:
 *   - sem qualificado e verba ≥ 3× o alvo → Pausar (a chance de ser azar é de ~5%);
 *   - faixa inteira acima do alvo → Pausar;  faixa inteira abaixo do alvo → Escalar;
 *   - qualquer outro caso → Manter (dados insuficientes).
 * Puro — tests/decisao-anuncios.test.ts.
 */
export type LinhaAnuncio = {
  ad_id: string; funil: string; pais: string; campanha: string | null; publico: string | null; criativo: string | null; ad_status: string | null;
  investimento: number; visitas: number; primeiro_dia: string; ultimo_dia: string;
  leads: number; qualificados: number; no_grupo: number; qualificados_no_grupo: number;
};
export type Decisao = "escalar" | "manter" | "pausar";
export type Premissa = { funil: string; pais: string; cpl_base: number | null };

const Z = 1.96;
export const MULTIPLO_SEM_LEAD = 3;

/** Intervalo de 95% para uma contagem k (Poisson). */
export function intervaloContagem(k: number): [number, number] {
  const sup = (k + 1) * Math.pow(1 - 1 / (9 * (k + 1)) + Z / (3 * Math.sqrt(k + 1)), 3);
  if (k <= 0) return [0, sup];
  const inf = k * Math.pow(1 - 1 / (9 * k) - Z / (3 * Math.sqrt(k)), 3);
  return [Math.max(inf, 0), sup];
}

/** Custo por qualificado e faixa provável (máximo = Infinity quando ainda não há qualificado). */
export function faixaCusto(verba: number, k: number): { custo: number | null; min: number; max: number } {
  const [inf, sup] = intervaloContagem(k);
  return { custo: k > 0 ? verba / k : null, min: verba / sup, max: inf > 0 ? verba / inf : Infinity };
}

export function decidir(verba: number, k: number, alvo: number | null): { decisao: Decisao; motivo: string; vezesAlvo: number | null } {
  if (!alvo || alvo <= 0) return { decisao: "manter", motivo: "sem_alvo", vezesAlvo: null };
  const vezes = verba / alvo;
  if (k === 0) return vezes >= MULTIPLO_SEM_LEAD ? { decisao: "pausar", motivo: "sem_qualificado", vezesAlvo: vezes } : { decisao: "manter", motivo: "pouca_verba", vezesAlvo: vezes };
  const f = faixaCusto(verba, k);
  if (f.min > alvo) return { decisao: "pausar", motivo: "acima_do_alvo", vezesAlvo: vezes };
  if (f.max < alvo) return { decisao: "escalar", motivo: "abaixo_do_alvo", vezesAlvo: vezes };
  return { decisao: "manter", motivo: "faixa_inclui_alvo", vezesAlvo: vezes };
}

/** Código do criativo no nome da Meta: "[T] Anuncio130v2_(set26)" → "130v2". */
export function codigoCriativo(criativo: string | null | undefined): string {
  const c = criativo ?? "";
  const m = c.match(/Anuncio\s*([0-9]+[a-z0-9]*)/i);
  return m ? m[1] : c || "—";
}

export const ATIVO = (s: string | null | undefined) => s === "ACTIVE";

export type Grupo = LinhaAnuncio & { chave: string; codigo: string; anuncios: number; ativos: number };

/** Junta os anúncios do mesmo criativo no mesmo funil e país (somando públicos e campanhas). */
export function agrupar(ls: LinhaAnuncio[], por: "criativo" | "anuncio"): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const l of ls) {
    const codigo = codigoCriativo(l.criativo);
    const chave = por === "anuncio" ? l.ad_id : `${l.funil}|${l.pais}|${codigo}`;
    const g = m.get(chave);
    if (!g) {
      m.set(chave, { ...l, chave, codigo, anuncios: 1, ativos: ATIVO(l.ad_status) ? 1 : 0 });
      continue;
    }
    g.investimento += l.investimento; g.visitas += l.visitas; g.leads += l.leads; g.qualificados += l.qualificados;
    g.no_grupo += l.no_grupo; g.qualificados_no_grupo += l.qualificados_no_grupo;
    g.anuncios += 1; g.ativos += ATIVO(l.ad_status) ? 1 : 0;
    if (l.primeiro_dia < g.primeiro_dia) g.primeiro_dia = l.primeiro_dia;
    if (l.ultimo_dia > g.ultimo_dia) g.ultimo_dia = l.ultimo_dia;
    if (g.publico !== l.publico) g.publico = null;
    if (g.campanha !== l.campanha) g.campanha = null;
  }
  return [...m.values()];
}

/** Alvo (custo previsto por lead qualificado) do funil e país; Jubilados usa o da General. */
export function alvoDe(premissas: Premissa[], funil: string, pais: string): number | null {
  const f = funil === "jubilados" ? "general" : funil;
  const p = premissas.find((x) => x.funil === f && x.pais === pais);
  return p?.cpl_base != null && Number(p.cpl_base) > 0 ? Number(p.cpl_base) : null;
}
