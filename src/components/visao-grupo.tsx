import Link from "next/link";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi } from "@/components/ui";
import { GraficoBarras } from "@/components/grafico-barras";
import { Ranking } from "@/components/ranking";
import { StatusMonitor } from "@/components/status-monitor";
import type { DadosCampanhaGrupo } from "@/lib/visao-grupo";
import type { SituacaoMonitor } from "@/lib/dados";

const filtro = (chave: string) => (v: string | null) => (v ? `/grupo?periodo=7d&${chave}=${encodeURIComponent(v)}` : "/grupo?periodo=7d");

/** Visão geral da campanha do grupo gratuito (OP Futuros). */
export function VisaoGrupo({ d, monitor }: { d: DadosCampanhaGrupo; monitor: SituacaoMonitor | null }) {
  const media = d.mediaSemana.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Inscrições hoje" valor={numero(d.hoje)} detalhe="desde 00h do Uruguai" destaque="verde" />
        <Kpi rotulo="Inscrições · 7 dias" valor={numero(d.semana)} detalhe={`média de ${media} por dia`} />
        <Kpi
          rotulo="Cliques no link do grupo · 7 dias"
          valor={d.cliques7 != null ? numero(d.cliques7) : "—"}
          detalhe={d.cliquesHoje != null ? `${numero(d.cliquesHoje)} hoje · redirecionador` : "redirecionador"}
        />
        {d.entradas7 != null ? (
          <Kpi rotulo="Entradas no grupo · 7 dias" valor={numero(d.entradas7)} detalhe="segundo o Sendflow" destaque="verde" />
        ) : (
          <Kpi rotulo="Inscrições desde o início" valor={numero(d.total)} detalhe={d.primeira ? `desde ${dataHora(d.primeira).split(",")[0]}` : undefined} />
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <StatusMonitor nome="Monitor de leads (alerta sem leads)" s={monitor} porLeads />
        {d.entradas7 == null ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-400">
            <span className="font-medium text-amber-300">Entradas no grupo ainda não aparecem.</span> Falta ligar o webhook do Sendflow da campanha
            OP - FUTUROS para o painel; com ele, esta tela mostra quem entrou e quem saiu do grupo.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400">
            {numero(d.repetidas7)} pessoa(s) se inscreveram mais de 1 vez nos últimos 7 dias.
          </div>
        )}
      </section>

      <Cartao titulo="Inscrições por dia — últimos 30 dias (horário do Uruguai)">
        <GraficoBarras pontos={d.serie} titulo="Inscrições por dia" unidade="inscrições" />
      </Cartao>

      <div className="grid gap-3 lg:grid-cols-3">
        <Ranking titulo="Anúncio (utm_content) · 7 dias" itens={d.porAnuncio} total={d.semana} href={filtro("content")} />
        <Ranking titulo="Público / conjunto (utm_source) · 7 dias" itens={d.porOrigem} total={d.semana} href={filtro("source")} />
        <Ranking titulo="País · 7 dias" itens={d.porPais} total={d.semana} href={filtro("pais")} />
      </div>

      <p className="text-sm">
        <Link href="/grupo" className="text-emerald-700 hover:underline dark:text-emerald-400">Ver todos os inscritos, filtrar e exportar CSV →</Link>
      </p>
    </>
  );
}
