import { exigirLogin } from "@/lib/sessao";
import { MultiSelecao } from "@/components/multi-selecao";
import { db } from "@/lib/supabase";
import {
  combinacoes, contagensPorEdicao, conversaoPorEdicao, repeticaoPorEdicao, conversaoPorParticipacao, conversaoPorTotal, edicoes,
  FILTROS_COMPRA, telefonesParaRevisar,
} from "@/lib/base-leads";
import {
  alternarEdicao, aprovarTelefone, aprovarTodasSugestoes, atualizarBase, criarEdicao, descartarTelefone,
} from "@/lib/acoes-base-leads";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { ImportadorBaseLeads } from "@/components/importador-base-leads";
import { tradutor } from "@/lib/i18n/servidor";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const rotuloPart = (t: T, p: string) => (p === "+3" ? t("4ª ou mais") : t("{p}ª", { p }));
const SUFIXO_PAIS = " (país informado diferente)";
/** Motivo do telefone (gerado pelo SQL): separa o sufixo de país e traduz o nome do país à parte. */
function traduzirMotivo(t: T, m: string): string {
  if (m.endsWith(SUFIXO_PAIS)) return traduzirMotivo(t, m.slice(0, -SUFIXO_PAIS.length)) + t(SUFIXO_PAIS);
  const g = m.match(/^([^:()]+): (faltam dígitos|dígitos a mais)$/);
  if (g) return `${t(g[1])}: ${t(g[2])}`;
  return t(m);
}
const botao = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
const PAISES = [
  "Argentina", "Uruguay", "Chile", "EE. UU./Canadá", "Colombia", "Brasil", "España", "México", "Venezuela", "Perú",
  "Bolivia", "Ecuador", "Paraguay", "Costa Rica", "Panamá", "Israel", "Otro",
];

const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default async function BaseLeads({ searchParams }: PageProps<"/base-leads">) {
  await exigirLogin();
  const t = await tradutor();
  const sp = await searchParams;
  const revisarTodos = sp.revisar === "todos";

  const [eds, porPart, porEdicao, porTotal, contagens, revisar, ultima, totais, combos, repeticao] = await Promise.all([
    edicoes(), conversaoPorParticipacao(), conversaoPorEdicao(), conversaoPorTotal(), contagensPorEdicao(),
    telefonesParaRevisar(100, revisarTodos ? "todos" : "compradores"),
    db().from("bd_atualizacoes").select("atualizado_em").order("id", { ascending: false }).limit(1).maybeSingle(),
    db().from("v_bd_revisar").select("telefone_original", { count: "exact", head: true }),
    combinacoes(), repeticaoPorEdicao(),
  ]);
  const cont = new Map(contagens.map((c) => [c.edicao_id, c]));
  const pessoas = porTotal.reduce((s, l) => s + l.pessoas, 0);
  const compraramEt = porTotal.reduce((s, l) => s + l.compraram_et, 0);
  const compraramTpp = porTotal.reduce((s, l) => s + l.compraram_tpp, 0);
  const totalRevisar = totais.count ?? 0;
  const emMaisDeUm = porTotal.filter((l) => l.lancamentos !== "1").reduce((s, l) => s + l.pessoas, 0);
  const nomeEdicao = new Map(eds.map((e) => [e.codigo, e.nome]));
  const nomesCombo = (c: string) => c.split(", ").map((x) => nomeEdicao.get(x) ?? x).map((x) => t(x)).join(" + ");
  const edicoesTaxa = eds.filter((e) => e.tem_leads && e.tem_compras).map((e) => t(e.nome)).join(", ");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Base de leads")}</h1>
          <p className="text-sm text-zinc-500">
            {t("Todos os lançamentos, uma pessoa por telefone · números recalculados em {data}", { data: dataHora(ultima.data?.atualizado_em) })}
          </p>
        </div>
        <form action={atualizarBase}><button className={botao}>{t("Recalcular agora")}</button></form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo={t("Pessoas")} valor={numero(pessoas)} detalhe={t("telefones únicos e válidos")} />
        <Kpi rotulo={t("Em mais de 1 lançamento")} valor={numero(emMaisDeUm)} detalhe={pessoas ? t("{p} das pessoas", { p: pct(Math.round((emMaisDeUm / pessoas) * 10000) / 100) }) : undefined} />
        <Kpi rotulo={t("Compraram Expert Trader")} valor={numero(compraramEt)} />
        <Kpi rotulo={t("Compraram TPP")} valor={numero(compraramTpp)} />
        <Kpi rotulo={t("Telefones para revisar")} valor={numero(totalRevisar)} destaque={totalRevisar ? "ambar" : undefined} detalhe={t("fora das estatísticas até revisar")} />
      </div>

      <Cartao titulo={t("Probabilidade de compra por participação")}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("De cada 100 pessoas que estavam no seu 1º, 2º, 3º ou 4º+ lançamento, quantas compraram naquele lançamento. Entram só os lançamentos com lista de inscritos e de compradores ({edicoes}). Quem comprou o Expert Trader vira aluno e deixa de contar nos lançamentos seguintes (comprar só o TPP não tira a pessoa da contagem). A contagem começa em julho/2025: quem participou de lançamentos anteriores aparece como se fosse a 1ª vez.", { edicoes: edicoesTaxa })}
        </p>
        <Tabela cabecalho={[t("Participação"), t("Pessoas"), t("Compraram ET"), "% ET", t("Compraram TPP"), "% TPP", t("% ET ou TPP")]} vazio={porPart.length === 0}>
          {porPart.map((l) => (
            <tr key={l.participacao}>
              <td className={`${td} font-medium`}>{rotuloPart(t, l.participacao)}</td>
              <td className={`${td} tabular`}>{numero(l.participantes)}</td>
              <td className={`${td} tabular`}>{numero(l.compraram_et)}</td>
              <td className={`${td} tabular font-semibold`}>{pct(l.taxa_et)}</td>
              <td className={`${td} tabular`}>{numero(l.compraram_tpp)}</td>
              <td className={`${td} tabular font-semibold`}>{pct(l.taxa_tpp)}</td>
              <td className={`${td} tabular`}>{pct(l.taxa_algum)}</td>
            </tr>
          ))}
        </Tabela>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{t("Ver por lançamento")}</summary>
          <div className="mt-3">
            <Tabela cabecalho={[t("Lançamento"), t("Participação"), t("Pessoas"), t("Compraram ET"), "% ET", t("Compraram TPP"), "% TPP"]} vazio={porEdicao.length === 0}>
              {porEdicao.map((l) => (
                <tr key={`${l.edicao}-${l.participacao}`}>
                  <td className={td}>{t(l.edicao)}</td>
                  <td className={td}>{rotuloPart(t, l.participacao)}</td>
                  <td className={`${td} tabular`}>{numero(l.participantes)}</td>
                  <td className={`${td} tabular`}>{numero(l.compraram_et)}</td>
                  <td className={`${td} tabular`}>{pct(l.taxa_et)}</td>
                  <td className={`${td} tabular`}>{numero(l.compraram_tpp)}</td>
                  <td className={`${td} tabular`}>{pct(l.taxa_tpp)}</td>
                </tr>
              ))}
            </Tabela>
          </div>
        </details>
      </Cartao>

      <Cartao titulo={t("Pessoas por quantidade de lançamentos")}>
        <p className="mb-3 text-xs text-zinc-500">{t("Quantos lançamentos cada pessoa já participou e quantas delas compraram em algum momento.")}</p>
        <Tabela cabecalho={[t("Lançamentos"), t("Pessoas"), t("Compraram ET"), "% ET", t("Compraram TPP"), "% TPP", t("% ET ou TPP")]} vazio={porTotal.length === 0}>
          {porTotal.map((l) => (
            <tr key={l.lancamentos}>
              <td className={`${td} font-medium`}>{l.lancamentos === "+3" ? t("Mais de 3") : l.lancamentos}</td>
              <td className={`${td} tabular`}>{numero(l.pessoas)}</td>
              <td className={`${td} tabular`}>{numero(l.compraram_et)}</td>
              <td className={`${td} tabular`}>{pct(l.taxa_et)}</td>
              <td className={`${td} tabular`}>{numero(l.compraram_tpp)}</td>
              <td className={`${td} tabular`}>{pct(l.taxa_tpp)}</td>
              <td className={`${td} tabular`}>{pct(l.taxa_algum)}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Leads em mais de 1 lançamento ({n})", { n: numero(emMaisDeUm) })}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("Em cada lançamento, quantas pessoas também estiveram em outro (antes ou depois), e quantas já vinham de um lançamento anterior.")}
        </p>
        <Tabela cabecalho={[t("Lançamento"), t("Pessoas"), t("Também em outro"), "%", t("Já vinham de antes")]} vazio={repeticao.length === 0}>
          {repeticao.map((r) => (
            <tr key={r.edicao}>
              <td className={`${td} font-medium`}>{t(nomeEdicao.get(r.edicao) ?? r.edicao)}</td>
              <td className={`${td} tabular`}>{numero(r.pessoas)}</td>
              <td className={`${td} tabular`}>{numero(r.em_outros)}</td>
              <td className={`${td} tabular`}>{pct(r.pct_em_outros)}</td>
              <td className={`${td} tabular`}>{numero(r.ja_vinham_de_antes)}</td>
            </tr>
          ))}
        </Tabela>
        <h3 className="mt-5 mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{t("Em quais lançamentos estiveram")}</h3>
        <Tabela cabecalho={[t("Lançamentos"), t("Qtd."), t("Pessoas"), t("Compraram ET"), t("Compraram TPP"), t("% ET ou TPP"), ""]} vazio={combos.length === 0}>
          {combos.map((c) => (
            <tr key={c.lancamentos}>
              <td className={td}>{nomesCombo(c.lancamentos)}</td>
              <td className={`${td} tabular`}>{c.n_lancamentos}</td>
              <td className={`${td} tabular font-medium`}>{numero(c.pessoas)}</td>
              <td className={`${td} tabular`}>{numero(c.compraram_et)}</td>
              <td className={`${td} tabular`}>{numero(c.compraram_tpp)}</td>
              <td className={`${td} tabular`}>{pct(c.taxa_algum)}</td>
              <td className={td}>
                <a className="text-xs underline" href={`/api/base-leads/exportar?combo=${encodeURIComponent(c.lancamentos)}`}>{t("baixar CSV")}</a>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Exportar leads")}>
        <form action="/api/base-leads/exportar" method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">{t("Compra")}</span>
            <select name="compra" className={campo} defaultValue="todos">
              {FILTROS_COMPRA.map((f) => <option key={f.valor} value={f.valor}>{t(f.rotulo)}</option>)}
            </select>
          </label>
          <MultiSelecao nome="edicao" rotulo={t("Esteve no lançamento")} vazio={t("Qualquer um")}
            opcoes={eds.map((e) => ({ valor: e.codigo, rotulo: t(e.nome) }))} />
          <MultiSelecao nome="pais" rotulo={t("País")} vazio={t("Todos")}
            opcoes={PAISES.map((p) => ({ valor: p, rotulo: t(p) }))} />
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">{t("Baixar CSV")}</button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">{t("Uma linha por pessoa: telefone, país, e-mail, lançamentos em que esteve, se comprou ET/TPP e em quais. Marcando mais de um lançamento, saem as pessoas que estiveram em qualquer um deles; o mesmo vale para os países.")}</p>
      </Cartao>

      <Cartao titulo={t("Telefones para revisar ({n})", { n: numero(totalRevisar) })}
        acao={revisar.itens.some((r) => r.sugestao) ? (
          <form action={aprovarTodasSugestoes}><button className={botao}>{t("Aprovar todas as sugestões")}</button></form>
        ) : undefined}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("Números que a regra não conseguiu corrigir com segurança. Ficam fora das estatísticas até alguém aprovar uma correção ou descartar.")}{" "}
          {revisarTodos ? t("Mostrando todos (primeiro os compradores).") : t("Mostrando só os de compradores, que mais afetam as taxas.")}{" "}
          <a className="underline" href={revisarTodos ? "/base-leads" : "/base-leads?revisar=todos"}>{revisarTodos ? t("Ver só compradores") : t("Ver todos")}</a>
          {" "}{t("· Depois de revisar, clique em")} <b>{t("Recalcular agora")}</b>.
        </p>
        <Tabela cabecalho={[t("Telefone como chegou"), t("Problema"), t("Correção"), "", t("Lançamentos"), t("Vezes")]} vazio={revisar.itens.length === 0}>
          {revisar.itens.map((r) => (
            <tr key={r.telefone_original}>
              <td className={`${td} font-mono text-xs`}>{r.telefone_original}{r.e_comprador && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{t("comprador")}</span>}</td>
              <td className={`${td} text-xs`}>{traduzirMotivo(t, r.motivo_sugestao ?? r.motivo ?? "")}{r.origem_sugestao === "ia" && <span className="ml-1 text-[10px] text-zinc-500">{t("(sugestão da IA)")}</span>}</td>
              <td className={td}>
                <form action={aprovarTelefone} className="flex gap-1">
                  <input type="hidden" name="original" value={r.telefone_original} />
                  <input name="telefone" defaultValue={r.sugestao ?? ""} placeholder={t("número certo")} className={`${campo} w-40 font-mono text-xs`} />
                  <button className={botao}>{t("Aprovar")}</button>
                </form>
              </td>
              <td className={td}>
                <form action={descartarTelefone}>
                  <input type="hidden" name="original" value={r.telefone_original} />
                  <button className="text-xs text-zinc-500 hover:text-rose-600 hover:underline">{t("descartar")}</button>
                </form>
              </td>
              <td className={`${td} text-xs`}>{r.edicoes}</td>
              <td className={`${td} tabular`}>{r.ocorrencias}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Lançamentos na base")}>
        <Tabela cabecalho={[t("Lançamento"), t("Início"), t("Inscritos"), t("Telefones ok"), t("Revisar"), t("Compras"), t("Compras sem telefone"), t("Usar nas taxas")]} vazio={eds.length === 0}>
          {eds.map((e) => {
            const c = cont.get(e.id);
            return (
              <tr key={e.id}>
                <td className={td}>
                  <div className="font-medium">{t(e.nome)} <span className="text-xs font-normal text-zinc-500">{e.codigo}</span></div>
                  {e.observacao && <div className="text-xs text-zinc-500">{t(e.observacao)}</div>}
                  {e.lancamento_id && <div className="text-xs text-emerald-700 dark:text-emerald-400">{t("inscrições entram sozinhas pelo painel")}</div>}
                </td>
                <td className={`${td} tabular`}>{e.inicio.split("-").reverse().join("/")}</td>
                <td className={`${td} tabular`}>{numero(c?.leads ?? 0)}</td>
                <td className={`${td} tabular`}>{numero(c?.leads_ok ?? 0)}</td>
                <td className={`${td} tabular`}>{numero(c?.leads_revisar ?? 0)}</td>
                <td className={`${td} tabular`}>{numero(c?.compras_validas ?? 0)}</td>
                <td className={`${td} tabular`}>{numero(c?.compras_sem_telefone ?? 0)}</td>
                <td className={td}>
                  <div className="flex flex-col gap-1 text-xs">
                    {(["tem_leads", "tem_compras"] as const).map((k) => (
                      <form key={k} action={alternarEdicao}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="campo" value={k} />
                        <input type="hidden" name="valor" value={e[k] ? "0" : "1"} />
                        <button className="hover:underline">{e[k] ? "✓" : "✗"} {k === "tem_leads" ? t("tem inscritos") : t("tem compradores")}</button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </Tabela>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">{t("Adicionar lançamento antigo")}</summary>
          <form action={criarEdicao} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs text-zinc-500">{t("Código (ex.: mar-2025)")}</span><input name="codigo" required pattern="[a-z0-9-]+" className={campo} /></label>
            <label className="space-y-1"><span className="block text-xs text-zinc-500">{t("Nome")}</span><input name="nome" required className={campo} /></label>
            <label className="space-y-1"><span className="block text-xs text-zinc-500">{t("Início")}</span><input name="inicio" type="date" required className={campo} /></label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="tem_leads" defaultChecked /> {t("tem inscritos")}</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="tem_compras" defaultChecked /> {t("tem compradores")}</label>
            <button className={botao}>{t("Adicionar")}</button>
          </form>
        </details>
      </Cartao>

      <Cartao titulo={t("Adicionar dados (CSV ou Excel)")}>
        <ImportadorBaseLeads edicoes={eds.map((e) => ({ codigo: e.codigo, nome: t(e.nome) }))} />
      </Cartao>
    </>
  );
}
