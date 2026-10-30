/**
 * Alertas das campanhas na Meta (gasto e custo por lead), com os dados que a Paola
 * sincroniza no banco do painel (tabela pc_ads_meta_anuncio_dia, ~2x por dia).
 * Puro — testado em tests/meta-ads.test.ts.
 *
 * Tudo vai para o WhatsApp (são problemas que pedem ajuste):
 *  - ads_sem_dados: a sincronização da Paola parou (sem ela as outras alertas não funcionam).
 *  - ads_sem_gasto: a Meta deixou de gastar (campanha travada, cartão, anúncio reprovado...).
 *  - ads_cpl_alto: investimento ÷ leads acima do limite (padrão US$ 8; dezembro/2026: US$ 6, todos os leads).
 *  (Conta bloqueada, limite diário reduzido e gasto abaixo do ritmo do orçamento: meta-conta-regras.ts.)
 * Para não dar falso alarme no começo do dia, a parcial do dia só é avaliada com dados
 * sincronizados a partir da hora de início configurada no lançamento (padrão 12h; dezembro: 6h)
 * e com pelo menos 1 limite inteiro já gasto.
 */

import { montar, type Modelos } from "./modelos-alertas";
export const FUSO_ADS_OFFSET = "-03:00"; // Brasil/Uruguai, sem horário de verão
export const HORAS_SEM_SYNC = 20;
export const HORA_PARCIAL = 12;

/** Ontem com menos de 30% da média dos 3 dias anteriores = gasto parado. */
export const FRACAO_GASTO_MINIMO = 0.3;
/** Média mínima (US$/dia) para o "gasto parado" valer (evita alerta em campanha quase sem verba). */
export const MEDIA_MINIMA = 2;

export type DiaAds = { data: string; investimento: number; ativos: number };
export type EntradaAds = {
  lancamentoId: number;
  nome: string;
  moeda: string;
  cplMaximo: number;
  dias: DiaAds[];
  ultimaSync: string | null;
  /** Leads (qualificados) por dia "YYYY-MM-DD"; o de hoje conta só até a última sincronização. */
  leads: Record<string, number>;
  /** Chaves de alertas que já existem (para não repetir a do dia inteiro depois da parcial). */
  jaExistem: Set<string>;
  agora: Date;
  /** Hora local (0–23) a partir da qual a parcial de hoje é avaliada. Padrão: HORA_PARCIAL. */
  horaInicio?: number;
};
export type AlertaAds = { tipo: "ads_sem_dados" | "ads_sem_gasto" | "ads_cpl_alto"; chave: string; mensagem: string; dados: Record<string, unknown> };

export function diaLocal(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}
export function horaLocal(d: Date): number {
  return new Date(d.getTime() - 3 * 3_600_000).getUTCHours();
}
export function somarDia(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const inicioDia = (dia: string) => new Date(`${dia}T00:00:00${FUSO_ADS_OFFSET}`);

const dinheiro = (v: number, moeda: string) => `${moeda === "USD" ? "US$" : moeda} ${v.toFixed(2)}`;
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const hhmm = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function mensagemAds(tipo: AlertaAds["tipo"], nome: string, d: Record<string, unknown>, modelos?: Modelos): string {
  const moeda = String(d.moeda ?? "USD");
  const parcial = d.parcial === true;
  if (tipo === "ads_sem_dados") {
    return montar(tipo, {
      nome, horas: String(d.horas ?? "?"),
      ultima_sync: d.ultima_sync ? `em ${dataBr(diaLocal(new Date(String(d.ultima_sync))))} às ${hhmm(String(d.ultima_sync))}` : "— nunca",
    }, modelos);
  }
  if (tipo === "ads_sem_gasto") {
    return montar(tipo, {
      nome, titulo: parcial ? "não gastou nada hoje" : "quase não gastou ontem",
      periodo: parcial ? `Até ${hhmm(String(d.ultima_sync))}` : dataBr(String(d.dia)),
      investimento: dinheiro(Number(d.investimento), moeda), ativos: d.ativos as number, media: dinheiro(Number(d.media), moeda),
    }, modelos);
  }
  const leads = Number(d.leads);
  return montar("ads_cpl_alto", {
    nome, limite: dinheiro(Number(d.limite), moeda),
    periodo: parcial ? `Hoje até ${hhmm(String(d.ultima_sync))}` : `Dia ${dataBr(String(d.dia))}`,
    investimento: dinheiro(Number(d.investimento), moeda), leads, qualificados: d.qualificados ? " qualificado(s)" : "",
    cpl: leads > 0 ? dinheiro(Number(d.investimento) / leads, moeda) : "sem leads",
  }, modelos);
}

function alerta(tipo: AlertaAds["tipo"], chave: string, nome: string, dados: Record<string, unknown>): AlertaAds {
  return { tipo, chave, mensagem: mensagemAds(tipo, nome, dados), dados };
}

export function avaliarAds(e: EntradaAds, qualificados: boolean): AlertaAds[] {
  const base = { moeda: e.moeda };
  const id = e.lancamentoId;
  if (!e.ultimaSync) return [];
  const sync = new Date(e.ultimaSync);
  const horas = Math.floor((e.agora.getTime() - sync.getTime()) / 3_600_000);
  if (horas >= HORAS_SEM_SYNC) {
    return [alerta("ads_sem_dados", `ads_sem_dados:${id}:${Math.floor(sync.getTime() / 1000)}`, e.nome, { ...base, ultima_sync: e.ultimaSync, horas })];
  }

  const hoje = diaLocal(e.agora);
  const ontem = somarDia(hoje, -1);
  const porDia = new Map(e.dias.map((d) => [d.data, d]));
  const dia = (x: string): DiaAds => porDia.get(x) ?? { data: x, investimento: 0, ativos: 0 };
  const saida: AlertaAds[] = [];
  // Dia inteiro de ontem: só com uma sincronização feita depois que o dia acabou
  const ontemFechado = sync >= inicioDia(hoje);
  // Parcial de hoje: só com dados sincronizados depois do meio-dia
  const parcialOk = diaLocal(sync) === hoje && horaLocal(sync) >= (e.horaInicio ?? HORA_PARCIAL);

  // ── Gasto parado
  const media = (ref: string) => {
    const ant = [1, 2, 3].map((n) => dia(somarDia(ref, -n)).investimento);
    return ant.reduce((a, b) => a + b, 0) / ant.length;
  };
  const chaveParcialGasto = `ads_sem_gasto:${id}:${hoje}:parcial`;
  if (parcialOk) {
    const h = dia(hoje);
    const ativos = h.ativos || dia(ontem).ativos;
    const m = media(hoje);
    if (ativos > 0 && h.investimento === 0 && dia(ontem).investimento > 0 && m >= MEDIA_MINIMA) {
      saida.push(alerta("ads_sem_gasto", chaveParcialGasto, e.nome, { ...base, parcial: true, dia: hoje, investimento: 0, ativos, media: m, ultima_sync: e.ultimaSync }));
    }
  }
  if (ontemFechado && !e.jaExistem.has(`ads_sem_gasto:${id}:${ontem}:parcial`)) {
    const o = dia(ontem);
    const m = media(ontem);
    if (o.ativos > 0 && m >= MEDIA_MINIMA && o.investimento < FRACAO_GASTO_MINIMO * m) {
      saida.push(alerta("ads_sem_gasto", `ads_sem_gasto:${id}:${ontem}`, e.nome, { ...base, dia: ontem, investimento: o.investimento, ativos: o.ativos, media: m }));
    }
  }

  // ── Custo por lead (qualificado) acima do limite
  const caro = (inv: number, leads: number) => inv >= e.cplMaximo && (leads === 0 || inv / leads > e.cplMaximo);
  if (parcialOk) {
    const inv = dia(hoje).investimento;
    const leads = e.leads[hoje] ?? 0;
    if (caro(inv, leads)) {
      saida.push(alerta("ads_cpl_alto", `ads_cpl_alto:${id}:${hoje}:parcial`, e.nome, { ...base, parcial: true, dia: hoje, investimento: inv, leads, limite: e.cplMaximo, qualificados, ultima_sync: e.ultimaSync }));
    }
  }
  if (ontemFechado && !e.jaExistem.has(`ads_cpl_alto:${id}:${ontem}:parcial`)) {
    const inv = dia(ontem).investimento;
    const leads = e.leads[ontem] ?? 0;
    if (caro(inv, leads)) {
      saida.push(alerta("ads_cpl_alto", `ads_cpl_alto:${id}:${ontem}`, e.nome, { ...base, dia: ontem, investimento: inv, leads, limite: e.cplMaximo, qualificados }));
    }
  }
  return saida;
}

/**
 * Meta × nosso: o perigo real é a Meta receber MENOS do que nós enviamos (evento perdido).
 * O volume da Meta (/stats) conta navegador + servidor antes de juntar os repetidos (cada lead
 * aparece ~2×) e parte dos eventos de teste — então a Meta ter MAIS é normal e não é problema.
 * Só vira problema quando a Meta tem menos de 80% do que nós registramos (a partir de 10 eventos).
 * `testes` fica só como referência: a Meta não conta a maioria dos eventos com código de teste,
 * e descontá-los zerava o número (ex.: 155 testes × 86 na Meta → "0").
 */
export const MARGEM_DIVERGENCIA = 0.2;
export const MINIMO_DIVERGENCIA = 10;

export function divergenciaEventos(
  meta: { evento: string; total: number }[],
  _testes: Record<string, number>,
  nossos: Record<string, number>,
): string[] {
  const problemas: string[] = [];
  for (const [evento, nosso] of Object.entries(nossos)) {
    if (nosso < MINIMO_DIVERGENCIA) continue;
    const naMeta = meta.find((m) => m.evento === evento)?.total ?? 0;
    if (naMeta >= nosso * (1 - MARGEM_DIVERGENCIA)) continue;
    const falta = Math.round(((nosso - naMeta) / nosso) * 100);
    problemas.push(`${evento}: nós enviamos ${nosso} nas últimas 24 h e a Meta só registrou ${naMeta} (faltam ${falta}%, limite 20%).`);
  }
  return problemas;
}

/** O que vai para o WhatsApp: hoje é o mesmo critério (só a Meta recebendo MENOS do que enviamos). */
export const divergenciaCritica = divergenciaEventos;
