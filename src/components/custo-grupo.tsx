import { Cartao, Kpi, td } from "@/components/ui";
import { dia, numero } from "@/lib/formato";
import { FUNIS, type Celula, type ResumoCusto } from "@/lib/custo-grupo";

type T = (s: string, v?: Record<string, string | number>) => string;

const usd = (v: number | null) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(100 * v)}%`);

/** Uma célula: CPL no grupo em destaque; embaixo gasto ÷ entraram no grupo (e % de entrada). */
function Valor({ c, t }: { c: Celula; t: T }) {
  if (c.investimento <= 0 && c.leads === 0) return <span className="text-zinc-400">—</span>;
  return (
    <div className="text-right">
      <div className="tabular font-semibold">{usd(c.cplGrupo)}</div>
      <div className="tabular text-[11px] text-zinc-500">{usd(c.investimento)} ÷ {numero(c.noGrupo)}</div>
      <div className="tabular text-[11px] text-zinc-400">{t("CPL {v} · {p} no grupo", { v: usd(c.cpl), p: pct(c.pctGrupo) })}</div>
    </div>
  );
}

/**
 * Custo por lead no grupo (055): gasto na Meta ÷ leads que entraram em um grupo.
 * Total do lançamento e por dia, por funil (General, Trader, Jubilados = Jubilar + General Jubilados).
 */
export function CustoGrupo({ resumo, erro, t }: { resumo: ResumoCusto | null; erro: string | null; t: T }) {
  if (erro) return <Cartao titulo={t("Custo por lead no grupo")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "055-custo-por-lead-no-grupo.sql" })}</p></Cartao>;
  if (!resumo || resumo.dias.length === 0) return null;
  const { total, dias } = resumo;
  return (
    <Cartao titulo={t("Custo por lead no grupo (gasto na Meta ÷ leads que entraram no grupo)")}>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Total")} valor={usd(total.geral.cplGrupo)} destaque="verde"
          detalhe={t("{g} ÷ {n} no grupo · CPL {c}", { g: usd(total.geral.investimento), n: numero(total.geral.noGrupo), c: usd(total.geral.cpl) })} />
        {FUNIS.map((f) => (
          <Kpi key={f.id} rotulo={f.nome} valor={usd(total.porFunil[f.id].cplGrupo)}
            detalhe={t("{g} ÷ {n} no grupo · {p} entraram", { g: usd(total.porFunil[f.id].investimento), n: numero(total.porFunil[f.id].noGrupo), p: pct(total.porFunil[f.id].pctGrupo) })} />
        ))}
      </section>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">{t("Dia")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Total")}</th>
              {FUNIS.map((f) => <th key={f.id} className="px-4 py-2 text-right font-medium">{f.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className={`${td} tabular whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{dia(d.dia)}</td>
                <td className={td}><Valor c={d.geral} t={t} /></td>
                {FUNIS.map((f) => <td key={f.id} className={td}><Valor c={d.porFunil[f.id]} t={t} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        {t("Gasto: campanhas do lançamento na Meta (sincronização da base de anúncios), por funil. Lead = pessoa (1ª inscrição), contada no dia em que se inscreveu; \"no grupo\" = entrou em algum grupo do lançamento. Trader inclui quem marcou \"nunca operou\" e entrou no grupo do General. Jubilados = Jubilar + General Jubilados. O dia de hoje ainda sobe: quem se inscreveu há pouco pode entrar no grupo depois.")}
      </p>
    </Cartao>
  );
}
