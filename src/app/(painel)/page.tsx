import Link from "next/link";
import { contexto } from "@/lib/contexto";
import { resumoPaginas, serieDiaria, serieHoraria, situacaoMonitor, ultimosAlertas } from "@/lib/dados";
import { CartaoPaginas } from "@/components/paginas";
import { modoEnvio } from "@/lib/whatsapp";
import { CartaoMonitor, GraficoHoras } from "@/components/monitor";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { dia, numero } from "@/lib/formato";
import { Cartao, Kpi, montarHref } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";

export default async function VisaoGeral({ searchParams }: PageProps<"/">) {
  const { resumos, atual } = await contexto(await searchParams);
  if (!atual) {
    return (<><CabecalhoPagina titulo="Visão geral" resumos={resumos} atual={null} /><SemLancamento /></>);
  }
  const [serie, horas, situacao, alertas, paginas] = await Promise.all([
    serieDiaria(atual.lancamento_id),
    serieHoraria(atual.lancamento_id, 24),
    situacaoMonitor(atual.lancamento_id),
    ultimosAlertas(atual.lancamento_id),
    resumoPaginas(atual.lancamento_id),
  ]);
  const maximo = Math.max(1, ...serie.map((s) => s.inscricoes));
  const pct = (n: number) => (atual.inscritos ? `${Math.round((100 * n) / atual.inscritos)}% dos inscritos` : undefined);
  const lk = (status: string) => montarHref("/inscricoes", { l: atual.slug, status });

  return (
    <>
      <AutoAtualizar segundos={60} />
      <CabecalhoPagina titulo="Visão geral" resumos={resumos} atual={atual} />

      <CartaoMonitor s={situacao} alertas={alertas} modo={modoEnvio()} />

      <Cartao titulo="Inscrições x entradas por hora (últimas 24h, horário UY)">
        <div className="mb-2 flex gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-zinc-400" />Inscrições</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />Entradas no grupo</span>
        </div>
        <GraficoHoras serie={horas} />
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Inscritos (únicos)" valor={numero(atual.inscritos)} detalhe={`${numero(atual.envios_total)} envios do formulário`} />
        <Kpi rotulo="Inscritos no grupo" valor={numero(atual.no_grupo)} detalhe={atual.pct_inscritos_no_grupo != null ? `${atual.pct_inscritos_no_grupo}% dos inscritos` : undefined} destaque="verde" />
        <Kpi rotulo={`Fora do grupo (> ${atual.minutos_reenvio} min)`} valor={numero(atual.fora_do_grupo)} detalhe={pct(atual.fora_do_grupo) ?? "candidatos a reenvio"} destaque="ambar" />
        <Kpi rotulo="Saíram do grupo" valor={numero(atual.saiu)} detalhe={pct(atual.saiu)} destaque="vermelho" />
        <Kpi rotulo={`Aguardando (< ${atual.minutos_reenvio} min)`} valor={numero(atual.aguardando)} />
        <Kpi rotulo="Membros no grupo (total)" valor={numero(atual.membros_no_grupo)} detalhe="segundo o Sendflow" />
        <Kpi rotulo="No grupo sem inscrição" valor={numero(atual.membros_sem_inscricao)} detalhe="entraram sem passar pela captura" />
        <Kpi rotulo="Mediana até entrar" valor={atual.mediana_minutos_ate_entrar != null ? `${Math.round(atual.mediana_minutos_ate_entrar)} min` : "—"} detalhe="da inscrição à entrada" />
      </div>

      <CartaoPaginas linhas={paginas} slug={atual.slug} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Por dia — últimos 21 dias com movimento (horário UY)" className="lg:col-span-2">
          {serie.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Sem movimento ainda.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-zinc-400" />Inscrições</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />Desses, no grupo</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-rose-400" />Saídas do grupo</span>
              </div>
              {serie.map((s) => (
                <div key={s.dia} className="grid grid-cols-[3rem_1fr_7rem] items-center gap-3 text-xs">
                  <span className="tabular text-zinc-500">{dia(s.dia)}</span>
                  <div className="space-y-0.5">
                    <div className="h-2 rounded-sm bg-zinc-400" style={{ width: `${(100 * s.inscricoes) / maximo}%` }} />
                    <div className="h-2 rounded-sm bg-emerald-500" style={{ width: `${(100 * s.inscritos_no_grupo) / maximo}%` }} />
                    {s.saidas > 0 && <div className="h-2 rounded-sm bg-rose-400" style={{ width: `${(100 * s.saidas) / maximo}%` }} />}
                  </div>
                  <span className="tabular text-right text-zinc-600 dark:text-zinc-400">{s.inscricoes} · {s.inscritos_no_grupo} · {s.saidas}</span>
                </div>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Atalhos">
          <ul className="space-y-2 text-sm">
            <li><Link className="text-emerald-700 hover:underline dark:text-emerald-400" href={lk("fora_do_grupo")}>Ver quem está fora do grupo →</Link></li>
            <li><a className="text-emerald-700 hover:underline dark:text-emerald-400" href={`/api/exportar?l=${atual.slug}&status=fora_do_grupo`}>Baixar CSV de quem está fora do grupo</a></li>
            <li><Link className="text-emerald-700 hover:underline dark:text-emerald-400" href={lk("saiu")}>Ver quem saiu →</Link></li>
            <li><Link className="text-emerald-700 hover:underline dark:text-emerald-400" href={montarHref("/membros", { l: atual.slug, filtro: "sem_inscricao" })}>Membros sem inscrição →</Link></li>
          </ul>
          <div className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
            <p>Link do grupo: {atual.link_grupo ? <a className="break-all text-zinc-700 underline dark:text-zinc-300" href={atual.link_grupo} target="_blank" rel="noreferrer">{atual.link_grupo}</a> : "não cadastrado"}</p>
            <p className="mt-1">Referência Sendflow: {atual.sendflow_ref ?? "—"}</p>
            {atual.telefone_invalido > 0 && <p className="mt-1 text-amber-700 dark:text-amber-400">{atual.telefone_invalido} inscrição(ões) com telefone inválido</p>}
          </div>
        </Cartao>
      </div>
    </>
  );
}
