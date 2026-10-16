/**
 * Tradução do painel (Português ⇄ Espanhol).
 *
 * O texto em português é a própria chave: `t("Base de leads")` devolve o texto em espanhol
 * quando o idioma é "es" e o mesmo texto quando é "pt". Texto sem tradução cai no português.
 *
 * Valores variáveis vão entre chaves: `t("{n} registros", { n: 10 })`.
 * Textos montados fora do nosso controle (ex.: motivos vindos do banco) usam PADROES (regex).
 *
 * Servidor: `const t = await tradutor()` (lib/i18n/servidor).  Navegador: `const t = useT()` (lib/i18n/cliente).
 * Componentes que não são async nem "use client": `<Tx>texto</Tx>`.
 */
import { DICIONARIO_ES, PADROES_ES } from "./es";

export type Idioma = "pt" | "es";
export const IDIOMAS: { valor: Idioma; rotulo: string; curto: string }[] = [
  { valor: "pt", rotulo: "Português", curto: "PT" },
  { valor: "es", rotulo: "Español", curto: "ES" },
];
export const COOKIE_IDIOMA = "painel_idioma";
export const IDIOMA_PADRAO: Idioma = "pt";

export type Vars = Record<string, string | number | null | undefined>;
export type T = (texto: string, vars?: Vars) => string;

export function idiomaValido(v: string | null | undefined): Idioma {
  return v === "es" ? "es" : "pt";
}

function preencher(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

export function traduzir(idioma: Idioma, texto: string, vars?: Vars): string {
  if (idioma === "pt" || !texto) return preencher(texto, vars);
  const exato = DICIONARIO_ES[texto];
  if (exato !== undefined) return preencher(exato, vars);
  for (const [re, troca] of PADROES_ES) {
    if (re.test(texto)) return preencher(texto.replace(re, troca), vars);
  }
  return preencher(texto, vars);
}

export function criarT(idioma: Idioma): T {
  return (texto, vars) => traduzir(idioma, texto, vars);
}

/** Locale para Intl (datas, números). */
export function localeDe(idioma: Idioma): string {
  return idioma === "es" ? "es-UY" : "pt-BR";
}
