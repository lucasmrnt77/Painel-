import Link from "next/link";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi } from "@/components/ui";
import { GraficoBarras } from "@/components/grafico-barras";
import { Ranking } from "@/components/ranking";
import { StatusMonitor } from "@/components/status-monitor";
import type { DadosCampanhaGrupo } from "@/lib/visao-grupo";
import type { SituacaoMonitor } from "@/lib/dados";
import { tradutor } from "@/lib/i18n/servidor";

const filtro = (chave: string) => (v: string | null) => (v ? `/grupo?periodo=7d&${chave}=${encodeURIComponent(v)}` : "/grupo?periodo=7d");

/** Visão geral da campanha do grupo gratuito (OP Futuros). */
export async function VisaoGrupo({ d, monitor }: { d: DadosCampanhaGrupo; monitor: SituacaoMonitor | null }) {
  const t = await tradutor();
  const media = d.mediaSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Inscrições hoje")} valor={numero(d.hoje)} detalhe={t("desde 00h do Uruguai")} destaque="verde" />
        <Kpi rotulo={t("Inscrições · 7 dias")} valor={numero(d.semana)} detalhe={t("média de {m} por dia", { m: media })} />
        <Kpi
          rotulo={t("Cliques no link do grupo · 7 dias")}
          valor={d.cliques7 != null ? numero(d.cliques7) : "—"}
          detalhe={d.cliquesHoje != null ? t("{n} hoje · redirecionador", { n: numero(d.cliquesHoje) }) : t("redirecionador")}
        />
        {d.entradas7 != null ? (
          <Kpi rotulo={t("Entradas no grupo · 7 dias")} valor={numero(d.entradas7)} detalhe={t("segundo o Sendflow")} destaque="verde" />
        ) : (
          <Kpi rotulo={t("Inscrições desde o início")} valor={numero(d.total)} detalhe={d.primeira ? t("desde {d}", { d: dataHora(d.primeira).split(",")[0] }) : undefined} />
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <StatusMonitor nome={t("Monitor de leads (alerta sem leads)")} s={monitor} porLeads />
        {d.entradas7 == null ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-400">
            <span className="font-medium text-amber-300">{t("Entradas no grupo ainda não aparecem.")}</span>{" "}
            {t("Falta ligar o webhook do Sendflow da campanha OP - FUTUROS para o painel; com ele, esta tela mostra quem entrou e quem saiu do grupo.")}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
            {t("{n} pessoa(s) se inscreveram mais de 1 vez nos últimos 7 dias.", { n: numero(d.repetidas7) })}
          </div>
        )}
      </section>

      <Cartao titulo={t("Inscrições por dia — últimos 30 dias (horário do Uruguai)")}>
        <GraficoBarras pontos={d.serie} titulo={t("Inscrições por dia")} unidade={t("inscrições")} />
      </Cartao>

      <div className="grid gap-3 lg:grid-cols-3">
        <Ranking titulo={t("Anúncio (utm_content) · 7 dias")} itens={d.porAnuncio} total={d.semana} href={filtro("content")} />
        <Ranking titulo={t("Público / conjunto (utm_source) · 7 dias")} itens={d.porOrigem} total={d.semana} href={filtro("source")} />
        <Ranking titulo={t("País · 7 dias")} itens={d.porPais} total={d.semana} href={filtro("pais")} />
      </div>

      <p className="text-sm">
        <Link href="/grupo" className="text-emerald-700 hover:underline dark:text-emerald-400">{t("Ver todos os inscritos, filtrar e exportar CSV")} →</Link>
      </p>
    </>
  );
}
