import "server-only";
import { exigirLogin } from "./sessao";
import { escolherLancamento, listarResumos } from "./dados";

export type Busca = Record<string, string | string[] | undefined>;

export function param(sp: Busca, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

/** Autentica e resolve o lançamento selecionado (?l=slug, senão o ativo). */
export async function contexto(sp: Busca) {
  await exigirLogin();
  const resumos = await listarResumos();
  const atual = escolherLancamento(resumos, param(sp, "l"));
  return { resumos, atual };
}
