/** Casos de entrada das mensagens de alerta (cobrem os ramos de cada texto). */
const H = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 7, h + 3, m)).toISOString();
const J = (o: Partial<Record<string, unknown>> = {}) => ({ inscricoes: 14, entradas: 0, saidas: 0, inscritos_no_grupo: 0, de: H(10), ate: H(11), ...o });
const det = (n: number) => Array.from({ length: n }, (_, i) => ({ teste: `caso ${i + 1}`, motivo: `motivo ${i + 1}` }));
const exec = (o: Record<string, unknown>) => ({ origem: "servidor", disparo: "agendado", ok: false, total: 42, falhas: 2, duracao_ms: 10, resumo: [], detalhes: det(2), ...o });

export const ALERTA: [string, string, Record<string, unknown>][] = [
  ["sem_entradas", "Lanç", { minutos_sem_entrada: 75, ultima_entrada_em: H(10, 5), janela: J() }],
  ["sem_entradas", "Lanç", { minutos_sem_entrada: 200, ultima_entrada_em: null, janela: J({ inscricoes: 0 }) }],
  ["sem_leads", "OP", { minutos_sem_lead: 1500, ultimo_lead_em: H(9, 12) }],
  ["sem_leads", "OP", { minutos_sem_lead: 30, ultimo_lead_em: null }],
  ["planilha_parada", "Planilha X", { minutos_parada: 22, ultima_em: H(14, 3) }],
  ["leads_retomados", "OP", { retomada_em: H(15, 30), minutos_sem_lead: 1700 }],
  ["entradas_retomadas", "Lanç", { retomada_em: H(12, 40), minutos_sem_entrada: 155 }],
  ["resumo", "Lanç", { janela: J({ inscricoes: 52, entradas: 41, saidas: 3, inscritos_no_grupo: 39 }) }],
  ["resumo", "Lanç", { janela: J({ inscricoes: 0, entradas: 2 }), inscricoes_externas: true }],
  ["teste", "Lanç", {}],
  ["desconhecido", "Lanç", {}],
];
export const REDIR: [string, string, Record<string, unknown>][] = [
  ["cheio", "Geral", { grupo: "G36", cliques: 600, proximo: "G37 (0 cliques)", restantes: 5 }],
  ["cheio", "Geral", { grupo: "G36", cliques: 600, proximo: null }],
  ["invalido", "Trader", { grupo: "G2", proximo: null, restantes: 0 }],
  ["link_novo", "Geral", { grupo: "G38", origem: "sendflow" }],
  ["link_novo", "Geral", { grupo: "G38", origem: "manual" }],
  ["sem_grupos", "Geral", { reserva: null }],
  ["sem_grupos", "Geral", { reserva: "https://x.y" }],
  ["redefinicao_sem_retorno", "Geral", { grupo: "G39", minutos: 31 }],
  ["redefinicao_falhou", "Trader", { grupo: "G3", http: 429 }],
  ["redefinicao_falhou", "Trader", { grupo: "G3" }],
];
export const ADS: [string, string, Record<string, unknown>][] = [
  ["ads_sem_dados", "OP", { ultima_sync: "2026-12-06T09:00:00Z", horas: 22 }],
  ["ads_sem_dados", "OP", { ultima_sync: null }],
  ["ads_sem_gasto", "OP", { moeda: "USD", dia: "2026-12-06", investimento: 0.4, ativos: 4, media: 10.2 }],
  ["ads_sem_gasto", "OP", { moeda: "BRL", parcial: true, ultima_sync: "2026-12-07T16:10:00Z", investimento: 0, ativos: 2, media: 9 }],
  ["ads_cpl_alto", "OP", { moeda: "USD", dia: "2026-12-06", investimento: 11.3, leads: 1, limite: 8 }],
  ["ads_cpl_alto", "Dez", { moeda: "USD", parcial: true, ultima_sync: "2026-12-07T16:10:00Z", investimento: 20, leads: 0, limite: 8, qualificados: true }],
];
export const SAUDE: string[][] = [["p1", "p2"], Array.from({ length: 10 }, (_, i) => `problema ${i}`)];
export const TESTES: [Record<string, unknown>, boolean][] = [
  [exec({}), false],
  [exec({ origem: "navegador", falhas: 10, detalhes: det(10) }), false],
  [exec({ ok: true, falhas: 0, detalhes: [] }), true],
];
