import "server-only";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import { avaliarSaude, mensagemSaude, type RespostaSaude } from "./meta-saude-regras";
import { divergenciaCritica, divergenciaEventos } from "./meta-ads-regras";
import { modelosAlertas } from "./textos-alertas";
import { grupoConfigurado, rpcGrupo } from "./grupo";
import { compararQualificados, QUALIFICADOS, type FontesMeta, type LinhaComparacao } from "./comparacao-qualificados";

/**
 * "Saúde na Meta": o painel pede ao serviço de tracking (que guarda o token da Meta)
 * os números da Dataset Quality API e o volume das últimas 24 h, avalia e grava.
 * Variáveis: TRACKING_EVENTOS_URL (padrão https://tracking-eventos.vercel.app) e TESTES_TOKEN.
 */

export type RegistroSaude = {
  id: number; criado_em: string; disparo: string; ok: boolean;
  problemas: string[]; avisos: string[]; dados: RespostaSaude | Record<string, never>; envio_status: string | null;
};

const trackingUrl = () => (process.env.TRACKING_EVENTOS_URL?.trim() || "https://tracking-eventos.vercel.app").replace(/\/+$/, "");

async function buscar(): Promise<{ r: RespostaSaude | null; erro?: string }> {
  const token = process.env.TESTES_TOKEN?.trim();
  if (!token) return { r: null, erro: "TESTES_TOKEN não configurado no painel" };
  try {
    const res = await fetch(`${trackingUrl()}/api/meta-saude`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(25000) });
    if (res.status === 401) return { r: null, erro: "TESTES_TOKEN do serviço de tracking diferente (ou não configurado lá)" };
    if (res.status === 404) return { r: null, erro: "o serviço de tracking ainda não tem a consulta à Meta (publicar a versão nova)" };
    return { r: (await res.json()) as RespostaSaude };
  } catch (e) {
    return { r: null, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Consulta, grava e avisa no WhatsApp só se houver problema. */
/** Eventos de TESTE enviados nas últimas 24 h (a Meta conta junto no volume do pixel). */
async function testes24h(): Promise<Record<string, number>> {
  const { data } = await db().from("eventos_meta").select("event_name").eq("teste", true)
    .gte("criado_em", new Date(Date.now() - 86_400_000).toISOString()).limit(5000);
  const c: Record<string, number> = {};
  for (const x of (data ?? []) as { event_name: string }[]) c[x.event_name] = (c[x.event_name] ?? 0) + 1;
  // Cada execução dos testes (servidor e navegador) manda 1 "Lead" de teste da página do grupo
  const { count } = await db().from("testes_execucoes").select("id", { count: "exact", head: true })
    .gte("criado_em", new Date(Date.now() - 86_400_000).toISOString());
  if (count) c.Lead = (c.Lead ?? 0) + count;
  return c;
}

/**
 * Quantos eventos de lead NÓS registramos nas últimas 24 h (sem testes), para comparar com a Meta:
 * eventos dos lançamentos enviados pelo painel + "Lead" = inscrições da página do grupo gratuito.
 */
async function nossos24h(): Promise<Record<string, number> | null> {
  try {
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await db().from("eventos_meta").select("event_name").eq("teste", false).eq("status", "enviado").gte("criado_em", desde).limit(20000);
    if (error) throw error;
    const c: Record<string, number> = {};
    for (const x of (data ?? []) as { event_name: string }[]) c[x.event_name] = (c[x.event_name] ?? 0) + 1;
    if (grupoConfigurado()) {
      const g = await rpcGrupo<{ total: number }>("painel_resumo", { p_desde: desde, p_ate: null, p_pais: null, p_source: null, p_campaign: null, p_content: null });
      c.Lead = (c.Lead ?? 0) + (Number(g.total) || 0);
    }
    return c;
  } catch (e) {
    console.error("[meta-saude] contagem própria", e);
    return null;
  }
}

export async function atualizarSaudeMeta(disparo: "agendado" | "manual"): Promise<RegistroSaude> {
  const [{ r, erro }, testes, nossos] = await Promise.all([buscar(), testes24h(), nossos24h()]);
  const { problemas, avisos } = avaliarSaude(r, erro);
  // Meta × nosso (margem de 20%)
  // WhatsApp só com o que é crítico: os problemas de qualidade (consulta recusada, deduplicação baixa)
  // e a Meta recebendo MENOS do que enviamos. A diferença para mais fica só no painel.
  const criticos = [...problemas];
  // Leads qualificados: nós × Meta por origem (navegador e servidor). Meta com MAIS ou com MENOS = alerta.
  const fontes = r?.ok ? (r as { qualificados_24h?: FontesMeta[] }).qualificados_24h : undefined;
  let comparacao: LinhaComparacao[] | null = null;
  if (r?.ok && nossos && fontes) {
    comparacao = compararQualificados(fontes, nossos, testes);
    const p = comparacao.flatMap((l) => l.problemas);
    problemas.push(...p);
    criticos.push(...p);
  }
  if (r?.ok && r.volume_24h.ok && nossos) {
    // Os qualificados já foram comparados acima (com a origem); aqui ficam os demais eventos
    const outros = fontes ? Object.fromEntries(Object.entries(nossos).filter(([ev]) => !QUALIFICADOS.includes(ev))) : nossos;
    problemas.push(...divergenciaEventos(r.volume_24h.eventos, testes, outros));
    criticos.push(...divergenciaCritica(r.volume_24h.eventos, testes, outros));
  }
  const { data, error } = await db().from("meta_saude")
    .insert({ disparo, ok: problemas.length === 0, problemas, avisos, dados: r ? { ...r, testes_24h: testes, nossos_24h: nossos, comparacao_qualificados: comparacao } : {} })
    .select("*").single();
  if (error) throw new Error(`não consegui gravar a saúde na Meta: ${error.message}`);
  const salvo = data as RegistroSaude;
  if (criticos.length > 0) {
    const { data: g } = await db().from("lancamentos").select("alerta_telefones").eq("tipo", "grupo_gratuito").maybeSingle();
    const envio = await enviarWhatsapp(((g?.alerta_telefones as string[] | null) ?? []).filter(Boolean), mensagemSaude(criticos, await modelosAlertas()), "meta_saude");
    await db().from("meta_saude").update({ envio_status: envio.status }).eq("id", salvo.id);
    salvo.envio_status = envio.status;
  }
  // Guarda 120 dias
  await db().from("meta_saude").delete().lt("criado_em", new Date(Date.now() - 120 * 86_400_000).toISOString());
  return salvo;
}

export async function historicoSaude(limite = 14): Promise<RegistroSaude[]> {
  const { data, error } = await db().from("meta_saude").select("*").order("criado_em", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as RegistroSaude[];
}
