/**
 * Recuperação por WhatsApp (28/10/2026): quantas pessoas o fluxo do Unnichat contatou e quantas
 * entraram no grupo depois do envio. Puro — tests/recuperacao.test.ts.
 */
export type LinhaRecuperacao = {
  telefone_chave: string;
  primeiro_envio: string;
  envios: number;
  conta: number | null;
  historico: boolean;
  site: string;
  entrou_depois: boolean;
  minutos_ate_entrar: number | null;
};

export type Grupo = { chave: string; pessoas: number; entraram: number; taxa: number | null };
export type ResumoRecuperacao = {
  pessoas: number;
  mensagens: number;
  entraram: number;
  taxa: number | null;
  medianaMinutos: number | null;
  em1h: number;
  em24h: number;
  porDia: Grupo[];
  porSite: Grupo[];
  porConta: Grupo[];
  temHistorico: boolean;
};

/** Dia do Uruguai (AAAA-MM-DD). */
export function diaUY(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
}

function mediana(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function agrupar(linhas: LinhaRecuperacao[], chave: (l: LinhaRecuperacao) => string): Grupo[] {
  const m = new Map<string, { pessoas: number; entraram: number }>();
  for (const l of linhas) {
    const k = chave(l);
    const g = m.get(k) ?? { pessoas: 0, entraram: 0 };
    g.pessoas++;
    if (l.entrou_depois) g.entraram++;
    m.set(k, g);
  }
  return [...m.entries()].map(([k, g]) => ({ chave: k, ...g, taxa: g.pessoas ? g.entraram / g.pessoas : null }));
}

export function resumoRecuperacao(linhas: LinhaRecuperacao[]): ResumoRecuperacao {
  const entraram = linhas.filter((l) => l.entrou_depois);
  const minutos = entraram.map((l) => Number(l.minutos_ate_entrar)).filter((n) => Number.isFinite(n));
  // Tempo até entrar só faz sentido com a hora do envio (o histórico da Hoja 4 só tem o dia)
  const comHora = entraram.filter((l) => !l.historico).map((l) => Number(l.minutos_ate_entrar)).filter((n) => Number.isFinite(n));
  return {
    pessoas: linhas.length,
    mensagens: linhas.reduce((t, l) => t + (Number(l.envios) || 0), 0),
    entraram: entraram.length,
    taxa: linhas.length ? entraram.length / linhas.length : null,
    medianaMinutos: mediana(comHora),
    em1h: comHora.filter((n) => n <= 60).length,
    em24h: minutos.filter((n) => n <= 1440).length,
    porDia: agrupar(linhas, (l) => diaUY(l.primeiro_envio)).sort((a, b) => b.chave.localeCompare(a.chave)),
    porSite: agrupar(linhas, (l) => l.site || "—").sort((a, b) => b.pessoas - a.pessoas),
    porConta: agrupar(linhas, (l) => (l.conta == null ? "—" : `Conta ${l.conta}`)).sort((a, b) => a.chave.localeCompare(b.chave)),
    temHistorico: linhas.some((l) => l.historico),
  };
}

/** Lê o corpo do POST /api/recuperacao. Telefone só com dígitos; data inválida = agora. */
export function lerEnvios(corpo: unknown, agora = new Date()): { telefone: string; enviado_em: string; conta: number | null; http: number | null; origem: "script" | "historico" }[] {
  const b = (corpo ?? {}) as { envios?: unknown };
  const lista = Array.isArray(b.envios) ? b.envios.slice(0, 1000) : [];
  const saida = [];
  for (const x of lista as Record<string, unknown>[]) {
    const telefone = String(x?.telefone ?? "").replace(/\D/g, "");
    if (telefone.length < 8 || telefone.length > 15) continue;
    const d = x?.enviado_em ? new Date(String(x.enviado_em)) : agora;
    const conta = Number(x?.conta);
    const http = Number(x?.http);
    saida.push({
      telefone,
      enviado_em: (Number.isNaN(d.getTime()) ? agora : d).toISOString(),
      conta: Number.isInteger(conta) && conta > 0 && conta < 100 ? conta : null,
      http: Number.isInteger(http) && http >= 100 && http < 600 ? http : null,
      origem: x?.origem === "historico" ? ("historico" as const) : ("script" as const),
    });
  }
  return saida;
}

// ── Funil, período e série do gráfico (30/10/2026) ─────────────────────────────

/** General = páginas General, Jubilados e General/Jubilados (mesmo grupo); Trader = página Trader. */
export function funilDe(site: string): "General" | "Trader" {
  return site === "Trader" ? "Trader" : "General";
}

export type PeriodoRec = "hoje" | "3d" | "7d" | "tudo";
export const PERIODOS_REC: PeriodoRec[] = ["hoje", "3d", "7d", "tudo"];

/** Primeiro dia (AAAA-MM-DD, Uruguai) do período: hoje = só hoje; 3d = hoje e os 2 dias anteriores. */
export function inicioPeriodo(p: PeriodoRec, agora: Date = new Date()): string | null {
  if (p === "tudo") return null;
  const dias = p === "hoje" ? 0 : p === "3d" ? 2 : 6;
  return diaUY(new Date(agora.getTime() - dias * 86_400_000).toISOString());
}

export function filtrarPeriodo(linhas: LinhaRecuperacao[], p: PeriodoRec, agora: Date = new Date()): LinhaRecuperacao[] {
  const ini = inicioPeriodo(p, agora);
  return ini ? linhas.filter((l) => diaUY(l.primeiro_envio) >= ini) : linhas;
}

export type PontoRec = { chave: string; rotulo: string; recebidos: number; entraram: number; taxa: number | null };

/** Série do gráfico: por hora (hoje) ou por dia (demais), com os buracos preenchidos com zero. */
export function serieRecuperacao(linhas: LinhaRecuperacao[], p: PeriodoRec, agora: Date = new Date()): PontoRec[] {
  const porHora = p === "hoje";
  const chave = (iso: string) => {
    if (!porHora) return diaUY(iso);
    const h = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Montevideo", hour: "2-digit", hour12: false });
    return h.slice(0, 2);
  };
  const m = new Map<string, { recebidos: number; entraram: number }>();
  for (const l of linhas) {
    const k = chave(l.primeiro_envio);
    const g = m.get(k) ?? { recebidos: 0, entraram: 0 };
    g.recebidos++;
    if (l.entrou_depois) g.entraram++;
    m.set(k, g);
  }
  let chaves: string[];
  if (porHora) {
    const agoraH = Number(chave(agora.toISOString()));
    chaves = Array.from({ length: agoraH + 1 }, (_, i) => String(i).padStart(2, "0"));
  } else {
    const ini = inicioPeriodo(p, agora) ?? [...m.keys()].sort()[0];
    chaves = [];
    if (ini) {
      const fim = diaUY(agora.toISOString());
      for (let d = new Date(`${ini}T12:00:00Z`); diaUY(d.toISOString()) <= fim; d = new Date(d.getTime() + 86_400_000)) chaves.push(diaUY(d.toISOString()));
    }
  }
  return chaves.map((k) => {
    const g = m.get(k) ?? { recebidos: 0, entraram: 0 };
    const rotulo = porHora ? `${k}h` : `${k.slice(8, 10)}/${k.slice(5, 7)}`;
    return { chave: k, rotulo, ...g, taxa: g.recebidos ? g.entraram / g.recebidos : null };
  });
}
