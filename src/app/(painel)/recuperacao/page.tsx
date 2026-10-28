import { contexto, type Busca as Sp } from "@/lib/contexto";
import { db } from "@/lib/supabase";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { tradutor } from "@/lib/i18n/servidor";
import { resumoRecuperacao, type LinhaRecuperacao, type Grupo } from "@/lib/recuperacao";

const pctN = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);

/**
 * Recuperação por WhatsApp: pessoas que receberam a mensagem do fluxo do Unnichat (chequeo de grupo)
 * e quantas entraram no grupo DEPOIS do envio. Dados: POST /api/recuperacao (Apps Script) → v_recuperacao.
 */
export default async function Recuperacao({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos, atual } = await contexto(sp, { semTestes: true });
  if (!atual) return (<><CabecalhoPagina titulo={t("Recuperação")} resumos={resumos} atual={null} /><SemLancamento /></>);

  const linhas: LinhaRecuperacao[] = [];
  let erro: string | null = null;
  for (let de = 0; de < 100_000; de += 1000) {
    const { data, error } = await db().from("v_recuperacao")
      .select("telefone_chave, primeiro_envio, envios, conta, historico, site, entrou_depois, minutos_ate_entrar")
      .eq("lancamento_id", atual.lancamento_id).order("telefone_chave").range(de, de + 999);
    if (error) { erro = error.message; break; }
    linhas.push(...((data ?? []) as LinhaRecuperacao[]));
    if (!data || data.length < 1000) break;
  }
  const r = resumoRecuperacao(linhas);
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi rotulo={t("Pessoas que receberam")} valor={numero(r.pessoas)} detalhe={t("{n} mensagens", { n: numero(r.mensagens) })} />
            <Kpi rotulo={t("Entraram no grupo depois")} valor={numero(r.entraram)} destaque="verde" detalhe={pctN(r.taxa)} />
            <Kpi rotulo={t("Em até 1 hora")} valor={numero(r.em1h)} detalhe={pctN(r.pessoas ? r.em1h / r.pessoas : null)} />
            <Kpi rotulo={t("Em até 24 horas")} valor={numero(r.em24h)} detalhe={pctN(r.pessoas ? r.em24h / r.pessoas : null)} />
            <Kpi rotulo={t("Tempo até entrar (mediana)")} valor={r.medianaMinutos == null ? "—" : `${Math.round(r.medianaMinutos)} min`} />
          </div>
          {tabela(t("Por dia do envio"), t("Dia"), r.porDia)}
          {tabela(t("Por página"), t("Página"), r.porSite)}
          {tabela(t("Por conta do Unnichat"), t("Conta"), r.porConta)}
          <p className="text-xs text-zinc-500">
            {t("Recebeu = o Unnichat aceitou o envio (HTTP 2xx). Entrou no grupo depois = aparece como membro do grupo (Sendflow) com a primeira entrada depois do envio. Quem entra pelo link do grupo sem ter recebido a mensagem não conta aqui.")}
            {r.temHistorico ? " " + t("Envios importados da Hoja 4 só têm o dia: contam a partir de 00:00 desse dia e ficam fora do tempo até entrar.") : ""}
          </p>
        </>
      )}
    </>
  );
}
