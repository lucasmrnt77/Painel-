import "server-only";
import { db } from "./supabase";
import { grupoConfigurado, rpcGrupo } from "./grupo";
import { argsResumoGrupo, lerFiltrosGrupo } from "./grupo-filtros";
import { dominioLinks } from "./links";
import type { Funil, Grupo } from "./redirecionador";

/**
 * Resumo da captação para a Visão geral: redirecionador, grupo gratuito e links.
 * Cada parte é independente — se uma falhar (migração não aplicada, variável
 * faltando), ela volta null e o resto da página aparece normalmente.
 */

export type ResumoFunil = { slug: string; nome: string; limite: number; grupo: string | null; cliques: number | null; naFila: number; hoje: number; ultimaHora: number };
export type ResumoGrupoGratuito = { hoje: number; semana: number; pais: string | null };
export type ResumoLinks = { dominio: string; ativos: number; cliques24h: number; top: { slug: string; cliques24h: number; total: number }[] };

async function seguro<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    console.error("[visao-geral]", e);
    return null;
  }
}

export async function resumoFunis(): Promise<ResumoFunil[] | null> {
  return seguro(async () => {
    const { data, error } = await db().rpc("redir_resumo");
    if (error) throw error;
    return ((data ?? []) as { funil: Funil; grupos: Grupo[]; cliques_hoje: number; cliques_1h: number }[]).map(({ funil, grupos, cliques_hoje, cliques_1h }) => {
      const daVez = grupos.find((g) => g.status === "ativo");
      return {
        slug: funil.slug, nome: funil.nome, limite: funil.limite_cliques,
        grupo: daVez ? daVez.nome || daVez.titulo_whatsapp || `#${daVez.id}` : null,
        cliques: daVez?.cliques ?? null,
        naFila: grupos.filter((g) => g.status === "ativo").length,
        hoje: cliques_hoje, ultimaHora: cliques_1h,
      };
    });
  });
}

export async function resumoGrupoGratuito(): Promise<ResumoGrupoGratuito | null> {
  if (!grupoConfigurado()) return null;
  return seguro(async () => {
    const r = await rpcGrupo<{ total: number; hoje: number; por_pais: { valor: string; n: number }[] }>(
      "painel_resumo", argsResumoGrupo(lerFiltrosGrupo({ periodo: "7d" })),
    );
    return { hoje: r.hoje, semana: r.total, pais: r.por_pais[0]?.valor ?? null };
  });
}

export async function resumoLinks(): Promise<ResumoLinks | null> {
  return seguro(async () => {
    const { data, error } = await db().rpc("links_resumo");
    if (error) throw error;
    const itens = (data ?? []) as { link: { slug: string; ativo: boolean; cliques: number }; cliques_24h: number }[];
    return {
      dominio: dominioLinks(),
      ativos: itens.filter((i) => i.link.ativo).length,
      cliques24h: itens.reduce((s, i) => s + i.cliques_24h, 0),
      top: itens
        .filter((i) => i.cliques_24h > 0)
        .sort((a, b) => b.cliques_24h - a.cliques_24h)
        .slice(0, 5)
        .map((i) => ({ slug: i.link.slug, cliques24h: i.cliques_24h, total: i.link.cliques })),
    };
  });
}
