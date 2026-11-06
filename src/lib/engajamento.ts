/**
 * Comportamento na página (053): onde cada variação perde as pessoas — headline, página ou formulário.
 * Puro (sem banco) — tests/engajamento.test.ts.
 */

export type LinhaEngajamento = {
  site: string;
  landing: string;
  pais: string;
  visitas: number;
  comDado: number; // visitas com o aviso de saída ou inscritas (base das %)
  inscreveu: number;
  abandonouForm: number;
  saiuRapido: number; // menos de 5 s com a aba visível
  ficouSemForm: number;
  rolouMetade: number;
  medianaSegundos: number | null;
  medianaCarregamentoMs: number | null;
  medianaCarregamentoSaiuRapidoMs: number | null;
};

/** Mínimo de visitas com dado para mostrar o diagnóstico (abaixo disso pode ser acaso). */
export const MIN_VISITAS_ENGAJAMENTO = 100;
/** Página mais lenta que isso para quem saiu rápido: o problema provável é técnico, não a headline. */
export const CARREGAMENTO_LENTO_MS = 3000;

export type Diagnostico = "poucos_dados" | "lenta" | "headline" | "pagina" | "formulario" | "ok";

/**
 * A maior perda entre as três etapas decide:
 *  saiu rápido (< 5 s) → headline / primeira dobra (ou página lenta, se quem saiu rápido esperou > 3 s para abrir)
 *  ficou sem tocar no formulário → página (promessa, texto, prova)
 *  começou o formulário e não enviou → formulário
 * "ok" quando nenhuma etapa perde mais que a outra de forma clara (diferença < 5 pontos).
 */
export function diagnosticar(l: LinhaEngajamento): Diagnostico {
  if (l.comDado < MIN_VISITAS_ENGAJAMENTO) return "poucos_dados";
  const perdas: [Diagnostico, number][] = [
    ["headline", l.saiuRapido / l.comDado],
    ["pagina", l.ficouSemForm / l.comDado],
    ["formulario", l.abandonouForm / l.comDado],
  ];
  perdas.sort((a, b) => b[1] - a[1]);
  if (perdas[0][1] - perdas[1][1] < 0.05) return "ok";
  if (perdas[0][0] === "headline" && (l.medianaCarregamentoSaiuRapidoMs ?? 0) > CARREGAMENTO_LENTO_MS) return "lenta";
  return perdas[0][0];
}

export const TEXTO_DIAGNOSTICO: Record<Diagnostico, string> = {
  poucos_dados: "Poucos dados (mínimo de {n} visitas)",
  lenta: "Página lenta: quem sai rápido esperou mais de 3 s para abrir",
  headline: "Headline / primeira dobra: a maior perda é quem sai em menos de 5 s",
  pagina: "Página: leem, mas não tocam no formulário",
  formulario: "Formulário: começam a preencher e não enviam",
  ok: "Sem uma etapa claramente pior",
};

/** Ordem: General, Jubilar, Gen-Jubilados, Trader; dentro do site, "/", /v1, /v2…; país AR, UY, CL, Outros. */
export function ordenarEngajamento(ls: LinhaEngajamento[]): LinhaEngajamento[] {
  const os = (s: string) => (s === "General" ? 0 : s === "Jubilar" ? 1 : s === "Gen-Jubilados" ? 2 : s === "Trader" ? 3 : 4);
  const op = (p: string) => ["AR", "UY", "CL", "Outros"].indexOf(p);
  const ol = (s: string) => (s === "/" ? 0 : /^\/v\d+$/.test(s) ? 1 : 2);
  return [...ls].sort((a, b) => os(a.site) - os(b.site) || ol(a.landing) - ol(b.landing) || a.landing.localeCompare(b.landing, undefined, { numeric: true }) || op(a.pais) - op(b.pais));
}
