import "server-only";
import { exigirLogin } from "./sessao";
import { escolherLancamento, grupoGratuito, listarResumos } from "./dados";

export type Busca = Record<string, string | string[] | undefined>;

export function param(sp: Busca, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

/** Lançamentos de teste (nome começando com "Teste"/"Test"): somem dos seletores com `semTestes`. */
export const ehTeste = (r: { nome: string }) => /^\s*test/i.test(r.nome);

/** Autentica e resolve o lançamento selecionado (?l=slug, senão o ativo). */
export async function contexto(sp: Busca, opts: { semTestes?: boolean } = {}) {
  await exigirLogin();
  // O grupo gratuito tem página própria (Alertas / Grupo gratuito): fica fora do seletor de lançamentos
  const [todos, grupo] = await Promise.all([listarResumos(), grupoGratuito()]);
  const resumos = (grupo ? todos.filter((r) => r.lancamento_id !== grupo.id) : todos).filter((r) => !opts.semTestes || !ehTeste(r));
  const atual = escolherLancamento(resumos, param(sp, "l"));
  return { resumos, atual };
}
