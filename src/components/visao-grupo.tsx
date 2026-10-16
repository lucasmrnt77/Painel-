import Link from "next/link";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi } from "@/components/ui";
import { GraficoBarras } from "@/components/grafico-barras";
import { Ranking } from "@/components/ranking";
import { StatusMonitor } from "@/components/status-monitor";
import type { DadosCampanhaGrupo } from "@/lib/visao-grupo";
import type { DadosOp } from "@/lib/op-futuros";
import { montarHref } from "@/components/ui";
import type { SituacaoMonitor } from "@/lib/dados";
import { tradutor } from "@/lib/i18n/servidor";

const filtro = (chave: string) => (v: string | null) => (v ? `/grupo?periodo=7d&${chave}=${encodeURIComponent(v)}` : "/grupo?periodo=7d");

/** Visão geral da campanha do grupo gratuito (OP Futuros). */
export async function VisaoGrupo({ d, monitor, op }: { d: DadosCampanhaGrupo; monitor: SituacaoMonitor | null; op: DadosOp }) {
  const t = await tradutor();
  const r = op.resumo;
  const pctBase = (n: number) => (r.base ? t("{p}% dos inscritos", { p: Math.round((100 * n) / r.base) }) : undefined);
  const lk = (status?: string) => montarHref("/inscricoes", { l: "op-futuros", status });
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
        <Kpi rotulo={t("Entradas no grupo · 7 dias")} valor={op.webhookLigado ? numero(r.entradas_7d) : "—"}
          detalhe={op.webhookLigado ? t("{n} hoje · segundo o Sendflow", { n: numero(r.entradas_hoje) }) : t("aguardando o webhook do Sendflow")} destaque="verde" />
      </section>

      {op.webhookLigado && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi rotulo={t("Inscritos que entraram")} valor={numero(r.no_grupo + r.saiu)} detalhe={r.pct_no_grupo != null ? t("{p}% dos inscritos", { p: r.pct_no_grupo }) : undefined} destaque="verde" />
          <Kpi rotulo={t("Fora do grupo (> {n} min)", { n: op.minutosReenvio })} valor={numero(r.fora_do_grupo)} detalhe={pctBase(r.fora_do_grupo)} destaque="ambar" />
          <Kpi rotulo={t("Saíram do grupo")} valor={numero(r.saiu)} detalhe={pctBase(r.saiu)} destaque="vermelho" />
          <Kpi rotulo={t("Mediana até entrar")} valor={r.mediana_minutos_ate_entrar != null ? `${Math.round(r.mediana_minutos_ate_entrar)} min` : "—"} detalhe={t("da inscrição à entrada")} />
          <Kpi rotulo={t("Membros no grupo")} valor={numero(r.membros_no_grupo)} detalhe={t("{n} sem inscrição na página", { n: numero(r.membros_sem_inscricao) })} />
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <StatusMonitor nome={t("Monitor de leads (alerta sem leads)")} s={monitor} porLeads />
        {!op.ok ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-zinc-400">
            <span className="font-medium text-rose-300">{t("Não consegui cruzar inscrições e grupo.")}</span> {op.erro}
          </div>
        ) : !op.webhookLigado ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-400">
            <span className="font-medium text-amber-300">{t("Entradas no grupo ainda não aparecem.")}</span>{" "}
            {t("O painel ainda não recebeu nenhum evento da campanha OP - FUTUROS pelo webhook do Sendflow. Assim que a primeira pessoa entrar, esta tela mostra quem entrou e quem saiu.")}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400 space-y-1">
            {op.corte && (
              <p>{t("As taxas contam só a página de captura nova, a partir de {d}, quando o webhook começou a mandar entradas ({n} inscritos). Quem se inscreveu antes aparece como \"Antes do webhook\" e fica fora das taxas.", { d: dataHora(op.corte), n: numero(r.base) })}</p>
            )}
            <p>{t("{n} pessoa(s) se inscreveram mais de 1 vez nos últimos 7 dias.", { n: numero(d.repetidas7) })}</p>
            <p>
              <Link className="text-emerald-400 hover:underline" href={lk("fora_do_grupo")}>{t("Ver quem está fora do grupo")} →</Link>{" "}·{" "}
              <Link className="text-emerald-400 hover:underline" href={lk()}>{t("Inscritos x grupo")} →</Link>
            </p>
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
