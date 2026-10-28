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
