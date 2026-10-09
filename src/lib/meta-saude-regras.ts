/**
 * Regras da "Saúde na Meta" (puras — testadas em tests/meta-saude.test.ts).
 * PROBLEMA = vai para o grupo de alertas: a Meta está recebendo eventos sem event_id
 * (não deduplica → conta em dobro) ou não deu para consultar a Meta.
 * AVISO = só no painel: cobertura da API de Conversões abaixo da meta, sem dados ainda etc.
 */

export const EVENTOS_MONITORADOS = ["Lead", "Lead General", "Lead Qualificado", "Lead Trader", "Lead Trader Qualificado"];
/** % mínimo de eventos (navegador e servidor) com event_id para a deduplicação funcionar. */
export const LIMITE_DEDUP = 80;

export type Dedup = { chave: string; navegador: number | null; servidor: number | null; cobertura_navegador: number | null };
export type EventoQualidade = { evento: string; emq: number | null; cobertura: number | null; cobertura_meta: number | null; frequencia: string | null; dedup: Dedup[] };
type Falha = { ok: false; http?: number | null; erro: string };
export type RespostaSaude =
  | { ok: true; pixel: string; consultado_em: string; qualidade: { ok: true; eventos: EventoQualidade[] } | Falha; volume_24h: { ok: true; eventos: { evento: string; total: number }[] } | Falha }
  | Falha;

const fmt = (n: number) => `${Math.round(n)}%`;

/** A Meta só calcula deduplicação/cobertura para eventos padrão; nos personalizados vem tudo vazio. */
export function semCalculoDaMeta(e: EventoQualidade): boolean {
  return e.dedup.length === 0 && e.cobertura == null;
}

export function dedupEventId(e: EventoQualidade): Dedup | null {
  return e.dedup.find((d) => /event_?id/i.test(d.chave)) ?? null;
}

export function avaliarSaude(r: RespostaSaude | null, erroConsulta?: string): { problemas: string[]; avisos: string[] } {
  if (!r || !r.ok) return { problemas: [`Não consegui consultar a Meta: ${erroConsulta ?? (r && !r.ok ? r.erro : "sem resposta")}`], avisos: [] };
  const problemas: string[] = [];
  const avisos: string[] = [];
  if (!r.qualidade.ok) {
    problemas.push(`A Meta recusou a consulta de qualidade: ${r.qualidade.erro}`);
  } else {
    const monitorados = r.qualidade.eventos.filter((e) => EVENTOS_MONITORADOS.includes(e.evento));
    if (monitorados.length === 0) avisos.push("A Meta ainda não tem dados de qualidade dos eventos de lead (últimos 7 dias).");
    for (const e of monitorados) {
      const d = dedupEventId(e);
      // Eventos personalizados (Lead General, Lead Qualificado...): a Meta não calcula deduplicação nem cobertura.
      // Para eles quem garante o event_id são os testes diários (Alertas → Testes diários).
      if (!d && semCalculoDaMeta(e)) continue;
      if (!d) { avisos.push(`${e.evento}: a Meta não informou dados de deduplicação por event_id.`); continue; }
      if (d.navegador != null && d.navegador < LIMITE_DEDUP) problemas.push(`${e.evento}: só ${fmt(d.navegador)} dos eventos do pixel (navegador) chegam com event_id — a Meta pode contar em dobro.`);
      if (d.servidor != null && d.servidor < LIMITE_DEDUP) problemas.push(`${e.evento}: só ${fmt(d.servidor)} dos eventos do servidor chegam com event_id — a Meta pode contar em dobro.`);
      if (e.cobertura != null && e.cobertura_meta != null && e.cobertura < e.cobertura_meta) {
        avisos.push(`${e.evento}: cobertura da API de Conversões em ${fmt(e.cobertura)} (meta da Meta: ${fmt(e.cobertura_meta)}).`);
      }
    }
  }
  if (!r.volume_24h.ok) avisos.push(`Volume das últimas 24 h indisponível: ${r.volume_24h.erro}`);
  return { problemas, avisos };
}

export function mensagemSaude(problemas: string[]): string {
  const linhas = problemas.slice(0, 8).map((p) => `• ${p}`);
  const resto = problemas.length > 8 ? `\n… e mais ${problemas.length - 8}` : "";
  return `🚨 *Problema nos eventos da Meta (dados da própria Meta)*\n${linhas.join("\n")}${resto}\n\nDetalhes no painel → Saúde na Meta.`;
}
