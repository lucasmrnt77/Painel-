import "server-only";
import { db } from "./supabase";
import { rpcGrupo } from "./grupo";
import { argsResumoGrupo, hojeUY, lerFiltrosGrupo, somarDias, diaCurto } from "./grupo-filtros";
import type { Ponto } from "@/components/grafico-barras";
import type { SituacaoMonitor } from "./dados";

/**
 * Campanha do grupo gratuito (OP Futuros) na Visão geral.
 * Inscrições: Supabase da página captura-grupo. Cliques: funil "grupo" do redirecionador.
 * Entradas no grupo: webhook do Sendflow no lançamento tipo grupo_gratuito (quando estiver ligado).
 */
export const SLUG_CAMPANHA_GRUPO = "op-futuros";
export const NOME_CAMPANHA_GRUPO = "OP Futuros — grupo gratuito";
export const FUNIL_GRUPO = "grupo";

type Item = { valor: string; n: number };
type ResumoG = {
  total: number; repetidas: number; hoje: number; primeira: string | null;
  por_dia: { dia: string; n: number }[]; por_pais: Item[]; por_source: Item[]; por_campaign: Item[]; por_content: Item[];
};

export type DadosCampanhaGrupo = {
  hoje: number;
  semana: number;
  mediaSemana: number;
  total: number;
  primeira: string | null;
  repetidas7: number;
  cliquesHoje: number | null;
  cliques7: number | null;
  entradas7: number | null; // null = webhook do Sendflow ainda sem dados para esta campanha
  serie: Ponto[];
  porAnuncio: Item[];
  porOrigem: Item[];
  porPais: Item[];
};

async function contar(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    console.error("[visao-grupo]", e);
    return null;
  }
}

const desdeDe = (periodo: "hoje" | "7d" | "30d") => lerFiltrosGrupo({ periodo }).desde!;

/** O lançamento só aparece por padrão na Visão geral depois do botão "Ligar lançamento". */
export async function captacaoIniciada(lancamentoId: number | null): Promise<boolean> {
  if (lancamentoId == null) return false;
  const { data, error } = await db().from("lancamentos").select("captacao_iniciada").eq("id", lancamentoId).maybeSingle();
  if (error) return true; // antes da migração 019: comportamento antigo (mostra o lançamento)
  return !!(data as { captacao_iniciada?: boolean } | null)?.captacao_iniciada;
}

export async function dadosCampanhaGrupo(lancamentoGrupoId: number | null): Promise<DadosCampanhaGrupo> {
  const desde7 = desdeDe("7d");
  const desdeHoje = desdeDe("hoje");
  const [r7, r30, rTudo, cliques7, cliquesHoje, entradas7] = await Promise.all([
    rpcGrupo<ResumoG>("painel_resumo", argsResumoGrupo(lerFiltrosGrupo({ periodo: "7d" }))),
    rpcGrupo<ResumoG>("painel_resumo", argsResumoGrupo(lerFiltrosGrupo({ periodo: "30d" }))),
    rpcGrupo<ResumoG>("painel_resumo", argsResumoGrupo(lerFiltrosGrupo({ periodo: "tudo" }))),
    contar(db().from("redir_cliques").select("id", { count: "exact", head: true }).eq("funil", FUNIL_GRUPO).gte("criado_em", desde7)),
    contar(db().from("redir_cliques").select("id", { count: "exact", head: true }).eq("funil", FUNIL_GRUPO).gte("criado_em", desdeHoje)),
    lancamentoGrupoId == null
      ? Promise.resolve(null)
      : contar(db().from("eventos_sendflow").select("id", { count: "exact", head: true }).eq("lancamento_id", lancamentoGrupoId).eq("tipo", "entrou").gte("recebido_em", desde7)),
  ]);

  // Últimos 30 dias, dias sem inscrição = 0 (horário do Uruguai)
  const m = new Map(r30.por_dia.map((d) => [d.dia, d.n]));
  const fim = hojeUY();
  const serie: Ponto[] = [];
  for (let d = somarDias(fim, -29); d <= fim; d = somarDias(d, 1)) serie.push({ chave: d, rotulo: diaCurto(d), rotuloLongo: diaCurto(d, true), n: m.get(d) ?? 0 });

  return {
    hoje: r7.hoje,
    semana: r7.total,
    mediaSemana: r7.total / 7,
    total: rTudo.total,
    primeira: rTudo.primeira,
    repetidas7: r7.repetidas,
    cliquesHoje,
    cliques7,
    entradas7: entradas7 ? entradas7 : null,
    serie,
    porAnuncio: r7.por_content,
    porOrigem: r7.por_source,
    porPais: r7.por_pais,
  };
}

/** Situação do monitor do grupo gratuito contada pelos LEADS da página (o alerta também usa leads). */
export function situacaoPorLeads(s: SituacaoMonitor, ultimoLead: string | null, agora = new Date()): SituacaoMonitor {
  return {
    ...s,
    ultima_entrada_em: ultimoLead,
    minutos_desde_ultima_entrada: ultimoLead ? Math.floor((agora.getTime() - new Date(ultimoLead).getTime()) / 60000) : null,
  };
}
