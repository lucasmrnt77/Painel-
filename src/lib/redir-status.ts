/**
 * Estado de um funil do redirecionador, para o cartão da tela principal.
 * Puro (sem banco): recebe o funil e os grupos e diz se está funcionando.
 * Os textos são chaves de tradução (português) com parâmetros.
 */
export type NivelFunil = "ok" | "atencao" | "parado" | "vazio";

export type EstadoFunil = {
  nivel: NivelFunil;
  rotulo: string;
  detalhe: string;
  params?: Record<string, string | number>;
  naFila: number;
  total: number;
  vagas: number;
  aguardandoLink: number;
};

type FunilBase = { limite_cliques: number; link_reserva: string | null };
type GrupoBase = { status: string; cliques: number };

export function estadoFunil(f: FunilBase, grupos: GrupoBase[], cliquesSemGrupoHoje = 0): EstadoFunil {
  const fila = grupos.filter((g) => g.status === "ativo");
  const vagas = fila.reduce((s, g) => s + Math.max(0, f.limite_cliques - g.cliques), 0);
  const aguardandoLink = grupos.filter((g) => g.status === "invalido" || g.status === "redefinindo").length;
  const base = { naFila: fila.length, total: grupos.length, vagas, aguardandoLink };

  if (grupos.length === 0) {
    return { ...base, nivel: "vazio", rotulo: "Sem grupos", detalhe: "Nenhum grupo cadastrado. Adicione ou importe grupos." };
  }
  if (fila.length === 0) {
    return f.link_reserva
      ? { ...base, nivel: "parado", rotulo: "Sem grupo na fila", detalhe: "Os cliques estão indo para o link reserva." }
      : { ...base, nivel: "parado", rotulo: "Parado", detalhe: "Nenhum grupo na fila: quem clica vê a página de grupos completos." };
  }
  if (fila.length === 1) {
    return { ...base, nivel: "atencao", rotulo: "Atenção", detalhe: "Só 1 grupo na fila ({n} vagas). Adicione mais grupos.", params: { n: vagas } };
  }
  if (vagas < f.limite_cliques) {
    return { ...base, nivel: "atencao", rotulo: "Atenção", detalhe: "Restam só {n} vagas na fila.", params: { n: vagas } };
  }
  if (cliquesSemGrupoHoje > 0) {
    return { ...base, nivel: "atencao", rotulo: "Atenção", detalhe: "Funcionando agora, mas {n} clique(s) hoje ficaram sem grupo.", params: { n: cliquesSemGrupoHoje } };
  }
  if (aguardandoLink > 0) {
    return { ...base, nivel: "ok", rotulo: "Funcionando", detalhe: "{n} grupo(s) aguardando link novo do Sendflow.", params: { n: aguardandoLink } };
  }
  return { ...base, nivel: "ok", rotulo: "Funcionando", detalhe: "{n} grupos na fila, {v} vagas.", params: { n: fila.length, v: vagas } };
}

/** Final do link a partir do nome: "Trader Dezembro" → "trader-dezembro". */
export function slugDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

export const SLUG_FUNIL = /^[a-z0-9-]{2,30}$/;
