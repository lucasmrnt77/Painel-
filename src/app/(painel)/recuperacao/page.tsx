import { contexto, param, type Busca as Sp } from "@/lib/contexto";
import { db } from "@/lib/supabase";
import { numero } from "@/lib/formato";
import { Cartao, Chips, Kpi, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { GraficoRecuperacao } from "@/components/grafico-recuperacao";
import { tradutor } from "@/lib/i18n/servidor";
import {
  PERIODOS_REC, filtrarPeriodo, funilDe, resumoRecuperacao, serieRecuperacao,
  type Grupo, type LinhaRecuperacao, type PeriodoRec, type ResumoRecuperacao,
} from "@/lib/recuperacao";

const pctN = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);

/**
 * Recuperação por WhatsApp: pessoas que receberam a mensagem do fluxo do Unnichat (chequeo de grupo)
 * e quantas entraram no grupo DEPOIS do envio. Por funil (General / Trader) e somado.
 * Filtros: ?periodo=hoje|3d|7d|tudo · ?funil=general|trader. Dados: POST /api/recuperacao → v_recuperacao.
 */
export default async function Recuperacao({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos, atual } = await contexto(sp, { semTestes: true });
  if (!atual) return (<><CabecalhoPagina titulo={t("Recuperação")} resumos={resumos} atual={null} /><SemLancamento /></>);

  const periodo: PeriodoRec = (PERIODOS_REC as string[]).includes(param(sp, "periodo") ?? "") ? (param(sp, "periodo") as PeriodoRec) : "7d";
  const funilParam = param(sp, "funil");
  const funil = funilParam === "general" ? "General" : funilParam === "trader" ? "Trader" : null;
  const href = (extra: Record<string, string | undefined>) => montarHref("/recuperacao", { l: atual.slug, periodo, funil: funilParam ?? undefined, ...extra });

  const todas: LinhaRecuperacao[] = [];
  let erro: string | null = null;
  for (let de = 0; de < 100_000; de += 1000) {
    const { data, error } = await db().from("v_recuperacao")
      .select("telefone_chave, primeiro_envio, envios, conta, historico, site, entrou_depois, minutos_ate_entrar")
      .eq("lancamento_id", atual.lancamento_id).order("telefone_chave").range(de, de + 999);
    if (error) { erro = error.message; break; }
    todas.push(...((data ?? []) as LinhaRecuperacao[]));
    if (!data || data.length < 1000) break;
  }
  const doPeriodo = filtrarPeriodo(todas, periodo);
  const linhas = funil ? doPeriodo.filter((l) => funilDe(l.site) === funil) : doPeriodo;
  const r = resumoRecuperacao(linhas);
  const porFunil: [string, ResumoRecuperacao][] = [
    [t("Unificado (General + Trader)"), resumoRecuperacao(doPeriodo)],
    ["General", resumoRecuperacao(doPeriodo.filter((l) => funilDe(l.site) === "General"))],
    ["Trader", resumoRecuperacao(doPeriodo.filter((l) => funilDe(l.site) === "Trader"))],
  ];
  const rotuloPeriodo: Record<PeriodoRec, string> = { hoje: t("Hoje"), "3d": t("3 dias"), "7d": t("7 dias"), tudo: t("Tudo") };

  const tabela = (titulo: string, rotulo: string, gs: Grupo[]) => (
    <Cartao titulo={titulo}>
      <Tabela cabecalho={[rotulo, t("Receberam"), t("Entraram no grupo depois"), t("Taxa")]} vazio={gs.length === 0}>
        {gs.map((g) => (
          <tr key={g.chave}>
            <td className={`${td} font-medium`}>{t(g.chave)}</td>
            <td className={`${td} tabular text-right`}>{numero(g.pessoas)}</td>
            <td className={`${td} tabular text-right`}>{numero(g.entraram)}</td>
            <td className={`${td} tabular text-right`}>{pctN(g.taxa)}</td>
          </tr>
        ))}
      </Tabela>
    </Cartao>
  );

  return (
    <>
      <CabecalhoPagina titulo={t("Recuperação")} resumos={resumos} atual={atual} subtitulo={t("Mensagens do fluxo de recuperação (Unnichat) e entradas no grupo depois do envio")} />
      {erro ? (
        <Cartao><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "045-recuperacao.sql" })} ({erro})</p></Cartao>
      ) : (
        <>
          <Cartao>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("Período")}</span>
                <Chips ativo={periodo} itens={PERIODOS_REC.map((p) => ({ valor: p, rotulo: rotuloPeriodo[p], href: href({ periodo: p }) }))} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("Funil")}</span>
                <Chips
                  ativo={funilParam === "general" || funilParam === "trader" ? funilParam : "todos"}
                  itens={[
                    { valor: "todos", rotulo: t("Unificado"), href: href({ funil: undefined }) },
                    { valor: "general", rotulo: "General", href: href({ funil: "general" }) },
                    { valor: "trader", rotulo: "Trader", href: href({ funil: "trader" }) },
                  ]}
                />
              </div>
            </div>
          </Cartao>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi rotulo={t("Pessoas que receberam")} valor={numero(r.pessoas)} detalhe={t("{n} mensagens", { n: numero(r.mensagens) })} />
            <Kpi rotulo={t("Entraram no grupo depois")} valor={numero(r.entraram)} destaque="verde" detalhe={pctN(r.taxa)} />
            <Kpi rotulo={t("Em até 1 hora")} valor={numero(r.em1h)} detalhe={pctN(r.pessoas ? r.em1h / r.pessoas : null)} />
            <Kpi rotulo={t("Em até 24 horas")} valor={numero(r.em24h)} detalhe={pctN(r.pessoas ? r.em24h / r.pessoas : null)} />
            <Kpi rotulo={t("Tempo até entrar (mediana)")} valor={r.medianaMinutos == null ? "—" : `${Math.round(r.medianaMinutos)} min`} />
          </div>

          <Cartao titulo={periodo === "hoje" ? t("Recebidos e entradas no grupo por hora") : t("Recebidos e entradas no grupo por dia")}>
            <GraficoRecuperacao pontos={serieRecuperacao(linhas, periodo)} />
          </Cartao>

          <Cartao titulo={t("Por funil · {p}", { p: rotuloPeriodo[periodo] })}>
            <Tabela cabecalho={[t("Funil"), t("Receberam"), t("Mensagens"), t("Entraram no grupo depois"), t("Taxa"), t("Em até 1 hora"), t("Tempo até entrar (mediana)")]}>
              {porFunil.map(([nome, x], i) => (
                <tr key={nome} className={i === 0 ? "font-semibold" : ""}>
                  <td className={`${td}`}>{nome}</td>
                  <td className={`${td} tabular text-right`}>{numero(x.pessoas)}</td>
                  <td className={`${td} tabular text-right`}>{numero(x.mensagens)}</td>
                  <td className={`${td} tabular text-right`}>{numero(x.entraram)}</td>
                  <td className={`${td} tabular text-right`}>{pctN(x.taxa)}</td>
                  <td className={`${td} tabular text-right`}>{numero(x.em1h)}</td>
                  <td className={`${td} tabular text-right`}>{x.medianaMinutos == null ? "—" : `${Math.round(x.medianaMinutos)} min`}</td>
                </tr>
              ))}
            </Tabela>
          </Cartao>

          {tabela(t("Por dia do envio"), t("Dia"), r.porDia)}
          {tabela(t("Por página"), t("Página"), r.porSite)}
          {tabela(t("Por conta do Unnichat"), t("Conta"), r.porConta)}
          <p className="text-xs text-zinc-500">
            {t("Recebeu = o Unnichat aceitou o envio (HTTP 2xx). Entrou no grupo depois = aparece como membro do grupo (Sendflow) com a primeira entrada depois do envio. Quem entra pelo link do grupo sem ter recebido a mensagem não conta aqui.")}
            {" "}{t("General = páginas General, Jubilados e General/Jubilados. Hoje, 3 e 7 dias contam pelo dia do envio (horário do Uruguai).")}
          </p>
        </>
      )}
    </>
  );
}
