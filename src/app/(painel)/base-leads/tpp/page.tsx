import { exigirLogin } from "@/lib/sessao";
import { edicoes, jornada } from "@/lib/base-leads";
import { numero, telefoneBonito } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dataCurta = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");

const CAMINHOS: Record<string, string> = {
  et_direto: "Compraram o ET sem ter comprado o TPP antes",
  tpp_depois_et: "Compraram o TPP e, num lançamento seguinte, o ET",
  mesmo_lancamento: "Compraram TPP e ET no mesmo lançamento",
  et_antes_do_tpp: "Compraram o ET e depois o TPP",
  so_tpp: "Compraram só o TPP (ainda não compraram o ET)",
};
const ORDEM = ["et_direto", "tpp_depois_et", "mesmo_lancamento", "et_antes_do_tpp", "so_tpp"];

export default async function TppParaEt() {
  await exigirLogin();
  const t = await tradutor();
  const [{ resumo, porTpp, distancia, pessoas }, eds] = await Promise.all([jornada(), edicoes()]);
  const nome = new Map(eds.map((e) => [e.codigo, t(e.nome)]));
  const por = new Map(resumo.map((r) => [r.caminho, r]));
  const n = (c: string) => por.get(c as never)?.pessoas ?? 0;
  const compradoresEt = n("et_direto") + n("tpp_depois_et") + n("mesmo_lancamento") + n("et_antes_do_tpp");
  const compradoresTpp = n("tpp_depois_et") + n("mesmo_lancamento") + n("et_antes_do_tpp") + n("so_tpp");
  const viaTpp = por.get("tpp_depois_et");

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{t("TPP → Expert Trader")}</h1>
        <p className="text-sm text-zinc-500">
          {t("Quem compra o Tu Primer Profit e quanto tempo leva para comprar o Expert Trader. Uma linha por pessoa (telefone); vale a primeira compra de cada produto.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t("Compradores do ET")} valor={numero(compradoresEt)} detalhe={t("{p} compraram direto, sem TPP antes", { p: pct((n("et_direto") / Math.max(compradoresEt, 1)) * 100) })} />
        <Kpi rotulo={t("Compradores do TPP")} valor={numero(compradoresTpp)} />
        <Kpi rotulo={t("TPP → ET depois")} valor={numero(n("tpp_depois_et"))} detalhe={t("{p} de quem comprou o TPP", { p: pct((n("tpp_depois_et") / Math.max(compradoresTpp, 1)) * 100) })} destaque="verde" />
        <Kpi rotulo={t("Tempo até comprar o ET")} valor={viaTpp?.dias_mediana != null ? t("{n} dias", { n: viaTpp.dias_mediana }) : "—"}
          detalhe={viaTpp?.dias_medio != null ? t("mediana · média {d} dias · {l} lançamentos depois", { d: viaTpp.dias_medio, l: String(viaTpp.lancamentos_medio ?? "—").replace(".", ",") }) : undefined} />
      </div>

      <Cartao titulo={t("Caminho de compra")}>
        <Tabela cabecalho={[t("Caminho"), t("Pessoas"), t("% dos compradores de ET")]}>
          {ORDEM.filter((c) => por.has(c as never)).map((c) => (
            <tr key={c}>
              <td className={td}>{t(CAMINHOS[c])}</td>
              <td className={`${td} tabular font-medium`}>{numero(n(c))}</td>
              <td className={`${td} tabular`}>{c === "so_tpp" ? "—" : pct((n(c) / Math.max(compradoresEt, 1)) * 100)}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Por lançamento do TPP")}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("De quem comprou o TPP em cada lançamento, quantos compraram o ET num lançamento seguinte. Os lançamentos mais recentes ainda tiveram pouco tempo para isso acontecer.")}
        </p>
        <Tabela cabecalho={[t("Lançamento do TPP"), t("Compraram TPP"), t("Depois compraram ET"), "%", t("Já eram alunos do ET")]} vazio={porTpp.length === 0}>
          {porTpp.map((r) => (
            <tr key={r.lancamento}>
              <td className={`${td} font-medium`}>{nome.get(r.lancamento) ?? r.lancamento}</td>
              <td className={`${td} tabular`}>{numero(r.compraram_tpp)}</td>
              <td className={`${td} tabular`}>{numero(r.depois_compraram_et)}</td>
              <td className={`${td} tabular font-semibold`}>{pct(r.taxa)}</td>
              <td className={`${td} tabular`}>{numero(r.ja_eram_alunos_et)}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Quanto tempo depois do TPP compraram o ET")}>
        <Tabela cabecalho={[t("Lançamentos depois"), t("Pessoas"), t("Dias (mediana)")]} vazio={distancia.length === 0}>
          {distancia.map((r) => (
            <tr key={r.lancamentos_depois}>
              <td className={td}>{r.lancamentos_depois === "1" ? t("No lançamento seguinte") : r.lancamentos_depois === "3+" ? t("3 ou mais lançamentos depois") : t("{n} lançamentos depois", { n: r.lancamentos_depois })}</td>
              <td className={`${td} tabular`}>{numero(r.pessoas)}</td>
              <td className={`${td} tabular`}>{r.dias_mediana ?? "—"}</td>
            </tr>
          ))}
        </Tabela>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{t("Ver as pessoas ({n})", { n: pessoas.length })}</summary>
          <div className="mt-3">
            <Tabela cabecalho={[t("Telefone"), "TPP", "ET", t("Dias"), t("Lançamentos depois")]} vazio={pessoas.length === 0}>
              {pessoas.map((p) => (
                <tr key={p.telefone}>
                  <td className={`${td} font-mono text-xs`}>{telefoneBonito(p.telefone)}</td>
                  <td className={td}>{nome.get(p.tpp_lancamento ?? "") ?? p.tpp_lancamento} · {dataCurta(p.tpp_data)}</td>
                  <td className={td}>{nome.get(p.et_lancamento ?? "") ?? p.et_lancamento} · {dataCurta(p.et_data)}</td>
                  <td className={`${td} tabular`}>{p.dias_ate_et ?? "—"}</td>
                  <td className={`${td} tabular`}>{p.lancamentos_ate_et ?? "—"}</td>
                </tr>
              ))}
            </Tabela>
          </div>
        </details>
      </Cartao>

      <p className="text-xs text-zinc-500">
        {t("Datas de compra: as dos formulários de boas-vindas e do sistema de pagamentos. Para baixar a lista de quem comprou o TPP e ainda não comprou o ET, use Base de leads → Exportar → \"Compraram TPP e não ET\".")}
      </p>
    </>
  );
}
