import "server-only";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import { grupoConfigurado, rpcGrupo } from "./grupo";
import { avaliarAds, diaLocal, inicioDia, somarDia, type DiaAds } from "./meta-ads-regras";

/**
 * Alertas de gasto e custo por lead das campanhas na Meta.
 * Investimento: tabela pc_ads_meta_anuncio_dia (sincronizada pela Paola), filtrada pelo nome da
 * campanha configurado no lançamento (lancamentos.ads_campanha_filtro, ILIKE).
 * Leads: grupo gratuito = inscrições da página do grupo; lançamento = inscrições qualificadas.
 */

type Lanc = { id: number; nome: string; tipo: string | null; alerta_telefones: string[] | null; ads_campanha_filtro: string; ads_cpl_maximo: number | null };
type Linha = { data: string; investimento: number | string | null; ad_status: string | null; moeda: string | null; atualizado_em: string | null };

async function leadsNoPeriodo(l: Lanc, de: Date, ate: Date): Promise<number> {
  if (l.tipo === "grupo_gratuito") {
    if (!grupoConfigurado()) throw new Error("banco da página do grupo não configurado");
    const r = await rpcGrupo<{ total: number }>("painel_resumo", {
      p_desde: de.toISOString(), p_ate: ate.toISOString(), p_pais: null, p_source: null, p_campaign: null, p_content: null,
    });
    return Number(r.total) || 0;
  }
  const { count, error } = await db().from("inscricoes").select("id", { count: "exact", head: true })
    .eq("lancamento_id", l.id).eq("qualificado", true).gte("criado_em", de.toISOString()).lt("criado_em", ate.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function avaliarLancamento(l: Lanc, agora: Date) {
  const hoje = diaLocal(agora);
  const { data, error } = await db().from("pc_ads_meta_anuncio_dia")
    .select("data, investimento, ad_status, moeda, atualizado_em")
    .ilike("campanha", l.ads_campanha_filtro)
    .gte("data", somarDia(hoje, -5));
  if (error) throw new Error(`[meta-ads] ${error.message}`);
  const linhas = (data ?? []) as Linha[];

  // Última sincronização desta campanha (em qualquer data)
  const { data: u } = await db().from("pc_ads_meta_anuncio_dia").select("atualizado_em")
    .ilike("campanha", l.ads_campanha_filtro).order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
  const ultimaSync = (u as { atualizado_em: string | null } | null)?.atualizado_em ?? null;

  const porDia = new Map<string, DiaAds>();
  for (const x of linhas) {
    const d = porDia.get(x.data) ?? { data: x.data, investimento: 0, ativos: 0 };
    d.investimento += Number(x.investimento) || 0;
    if (x.ad_status === "ACTIVE") d.ativos += 1;
    porDia.set(x.data, d);
  }
  const ontem = somarDia(hoje, -1);
  const fimHoje = ultimaSync && new Date(ultimaSync) > inicioDia(hoje) ? new Date(ultimaSync) : agora;
  const [leadsOntem, leadsHoje] = await Promise.all([
    leadsNoPeriodo(l, inicioDia(ontem), inicioDia(hoje)),
    leadsNoPeriodo(l, inicioDia(hoje), fimHoje),
  ]);

  const chaves = [`ads_sem_gasto:${l.id}:${ontem}:parcial`, `ads_cpl_alto:${l.id}:${ontem}:parcial`];
  const { data: existentes } = await db().from("alertas").select("chave").in("chave", chaves);

  return avaliarAds(
    {
      lancamentoId: l.id, nome: l.nome, moeda: linhas.find((x) => x.moeda)?.moeda ?? "USD",
      cplMaximo: Number(l.ads_cpl_maximo) || 8,
      dias: [...porDia.values()], ultimaSync,
      leads: { [ontem]: leadsOntem, [hoje]: leadsHoje },
      jaExistem: new Set(((existentes ?? []) as { chave: string }[]).map((x) => x.chave)),
      agora,
    },
    l.tipo !== "grupo_gratuito",
  );
}

/** Uma rodada (cron de hora em hora). Só lançamentos com monitor ligado e campanha configurada. */
export async function executarAlertasAds(agora = new Date()) {
  const { data, error } = await db().from("lancamentos")
    .select("id, nome, tipo, alerta_telefones, ads_campanha_filtro, ads_cpl_maximo")
    .eq("monitor_ativo", true).not("ads_campanha_filtro", "is", null);
  if (error) {
    if (error.code === "42703") return { lancamentos: 0, alertas: [], aviso: "migração 028 ainda não aplicada" };
    throw new Error(`[meta-ads] lançamentos: ${error.message}`);
  }
  const criados: unknown[] = [];
  const erros: string[] = [];
  for (const l of (data ?? []) as Lanc[]) {
    let alertas;
    try {
      alertas = await avaliarLancamento(l, agora);
    } catch (e) {
      erros.push(`${l.nome}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const a of alertas) {
      const { data: id, error: e2 } = await db().rpc("monitor_registrar_alerta", {
        p_lancamento_id: l.id, p_tipo: a.tipo, p_chave: a.chave, p_mensagem: a.mensagem, p_dados: a.dados,
      });
      if (e2) { erros.push(`${l.nome}: ${e2.message}`); continue; }
      if (id == null) continue; // já registrado em outra rodada
      const envio = await enviarWhatsapp(l.alerta_telefones ?? [], a.mensagem, a.tipo);
      await db().from("alertas").update({ envio_status: envio.status, envio_detalhe: envio.detalhe, enviado_em: new Date().toISOString() }).eq("id", id);
      criados.push({ id, tipo: a.tipo, envio: envio.status });
    }
  }
  return { lancamentos: (data ?? []).length, alertas: criados, erros };
}
