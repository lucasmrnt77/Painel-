import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import {
  combinacoes, contagensPorEdicao, conversaoPorEdicao, repeticaoPorEdicao, conversaoPorParticipacao, conversaoPorTotal, edicoes,
  FILTROS_COMPRA, FILTROS_N, telefonesParaRevisar,
} from "@/lib/base-leads";
import {
  alternarEdicao, aprovarTelefone, aprovarTodasSugestoes, atualizarBase, criarEdicao, descartarTelefone,
} from "@/lib/acoes-base-leads";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { ImportadorBaseLeads } from "@/components/importador-base-leads";

export const dynamic = "force-dynamic";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const rotuloPart = (p: string) => (p === "+3" ? "4ª ou mais" : `${p}ª`);
const botao = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export default async function BaseLeads({ searchParams }: PageProps<"/base-leads">) {
  await exigirLogin();
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
  const nomesCombo = (c: string) => c.split(", ").map((x) => nomeEdicao.get(x) ?? x).join(" + ");
  const edicoesTaxa = eds.filter((e) => e.tem_leads && e.tem_compras).map((e) => e.nome).join(", ");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Base de leads</h1>
          <p className="text-sm text-zinc-500">
            Todos os lançamentos, uma pessoa por telefone · números recalculados em {dataHora(ultima.data?.atualizado_em)}
          </p>
        </div>
        <form action={atualizarBase}><button className={botao}>Recalcular agora</button></form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Pessoas" valor={numero(pessoas)} detalhe="telefones únicos e válidos" />
        <Kpi rotulo="Em mais de 1 lançamento" valor={numero(emMaisDeUm)} detalhe={pessoas ? `${pct(Math.round((emMaisDeUm / pessoas) * 10000) / 100)} das pessoas` : undefined} />
        <Kpi rotulo="Compraram Expert Trader" valor={numero(compraramEt)} />
        <Kpi rotulo="Compraram TPP" valor={numero(compraramTpp)} />
        <Kpi rotulo="Telefones para revisar" valor={numero(totalRevisar)} destaque={totalRevisar ? "ambar" : undefined} detalhe="fora das estatísticas até revisar" />
      </div>

      <Cartao titulo="Probabilidade de compra por participação">
        <p className="mb-3 text-xs text-zinc-500">
          De cada 100 pessoas que estavam no seu 1º, 2º, 3º ou 4º+ lançamento, quantas compraram naquele lançamento.
          Entram só os lançamentos com lista de inscritos e de compradores ({edicoesTaxa}). A contagem começa em julho/2025:
          quem participou de lançamentos anteriores aparece como se fosse a 1ª vez.
        </p>
        <Tabela cabecalho={["Participação", "Pessoas", "Compraram ET", "% ET", "Compraram TPP", "% TPP", "% ET ou TPP"]} vazio={porPart.length === 0}>
          {porPart.map((l) => (
            <tr key={l.participacao}>
              <td className={`${td} font-medium`}>{rotuloPart(l.participacao)}</td>
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
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Ver por lançamento</summary>
          <div className="mt-3">
            <Tabela cabecalho={["Lançamento", "Participação", "Pessoas", "Compraram ET", "% ET", "Compraram TPP", "% TPP"]} vazio={porEdicao.length === 0}>
              {porEdicao.map((l) => (
                <tr key={`${l.edicao}-${l.participacao}`}>
                  <td className={td}>{l.edicao}</td>
                  <td className={td}>{rotuloPart(l.participacao)}</td>
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

      <Cartao titulo="Pessoas por quantidade de lançamentos">
        <p className="mb-3 text-xs text-zinc-500">Quantos lançamentos cada pessoa já participou e quantas delas compraram em algum momento.</p>
        <Tabela cabecalho={["Lançamentos", "Pessoas", "Compraram ET", "% ET", "Compraram TPP", "% TPP", "% ET ou TPP"]} vazio={porTotal.length === 0}>
          {porTotal.map((l) => (
            <tr key={l.lancamentos}>
              <td className={`${td} font-medium`}>{l.lancamentos === "+3" ? "Mais de 3" : l.lancamentos}</td>
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

      <Cartao titulo={`Leads em mais de 1 lançamento (${numero(emMaisDeUm)})`}>
        <p className="mb-3 text-xs text-zinc-500">
          Em cada lançamento, quantas pessoas também estiveram em outro (antes ou depois), e quantas já vinham de um lançamento anterior.
        </p>
        <Tabela cabecalho={["Lançamento", "Pessoas", "Também em outro", "%", "Já vinham de antes"]} vazio={repeticao.length === 0}>
          {repeticao.map((r) => (
            <tr key={r.edicao}>
              <td className={`${td} font-medium`}>{nomeEdicao.get(r.edicao) ?? r.edicao}</td>
              <td className={`${td} tabular`}>{numero(r.pessoas)}</td>
              <td className={`${td} tabular`}>{numero(r.em_outros)}</td>
              <td className={`${td} tabular`}>{pct(r.pct_em_outros)}</td>
              <td className={`${td} tabular`}>{numero(r.ja_vinham_de_antes)}</td>
            </tr>
          ))}
        </Tabela>
        <h3 className="mt-5 mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Em quais lançamentos estiveram</h3>
        <Tabela cabecalho={["Lançamentos", "Qtd.", "Pessoas", "Compraram ET", "Compraram TPP", "% ET ou TPP", ""]} vazio={combos.length === 0}>
          {combos.map((c) => (
            <tr key={c.lancamentos}>
              <td className={td}>{nomesCombo(c.lancamentos)}</td>
              <td className={`${td} tabular`}>{c.n_lancamentos}</td>
              <td className={`${td} tabular font-medium`}>{numero(c.pessoas)}</td>
              <td className={`${td} tabular`}>{numero(c.compraram_et)}</td>
              <td className={`${td} tabular`}>{numero(c.compraram_tpp)}</td>
              <td className={`${td} tabular`}>{pct(c.taxa_algum)}</td>
              <td className={td}>
                <a className="text-xs underline" href={`/api/base-leads/exportar?combo=${encodeURIComponent(c.lancamentos)}`}>baixar CSV</a>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo="Exportar leads">
        <form action="/api/base-leads/exportar" method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Participaram de</span>
            <select name="n" className={campo} defaultValue="todos">
              {FILTROS_N.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Compra</span>
            <select name="compra" className={campo} defaultValue="todos">
              {FILTROS_COMPRA.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Esteve no lançamento</span>
            <select name="edicao" className={campo} defaultValue="">
              <option value="">Qualquer um</option>
              {eds.map((e) => <option key={e.codigo} value={e.codigo}>{e.nome}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">País</span>
            <select name="pais" className={campo} defaultValue="">
              <option value="">Todos</option>
              <option>Argentina</option><option>Uruguay</option><option>Chile</option><option>Paraguay</option>
              <option>Brasil</option><option>EE. UU./Canadá</option><option>Otro</option>
            </select>
          </label>
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Baixar CSV</button>
        </form>
        <p className="mt-2 text-xs text-zinc-500">Uma linha por pessoa: telefone, país, e-mail, lançamentos em que esteve, se comprou ET/TPP e em quais.</p>
      </Cartao>

      <Cartao titulo={`Telefones para revisar (${numero(totalRevisar)})`}
        acao={revisar.itens.some((r) => r.sugestao) ? (
          <form action={aprovarTodasSugestoes}><button className={botao}>Aprovar todas as sugestões</button></form>
        ) : undefined}>
        <p className="mb-3 text-xs text-zinc-500">
          Números que a regra não conseguiu corrigir com segurança. Ficam fora das estatísticas até alguém aprovar uma
          correção ou descartar. {revisarTodos ? "Mostrando todos (primeiro os compradores)." : "Mostrando só os de compradores, que mais afetam as taxas."}{" "}
          <a className="underline" href={revisarTodos ? "/base-leads" : "/base-leads?revisar=todos"}>{revisarTodos ? "Ver só compradores" : "Ver todos"}</a>
          {" "}· Depois de revisar, clique em <b>Recalcular agora</b>.
        </p>
        <Tabela cabecalho={["Telefone como chegou", "Problema", "Correção", "", "Lançamentos", "Vezes"]} vazio={revisar.itens.length === 0}>
          {revisar.itens.map((r) => (
            <tr key={r.telefone_original}>
              <td className={`${td} font-mono text-xs`}>{r.telefone_original}{r.e_comprador && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">comprador</span>}</td>
              <td className={`${td} text-xs`}>{r.motivo_sugestao ?? r.motivo}{r.origem_sugestao === "ia" && <span className="ml-1 text-[10px] text-zinc-500">(sugestão da IA)</span>}</td>
              <td className={td}>
                <form action={aprovarTelefone} className="flex gap-1">
                  <input type="hidden" name="original" value={r.telefone_original} />
                  <input name="telefone" defaultValue={r.sugestao ?? ""} placeholder="número certo" className={`${campo} w-40 font-mono text-xs`} />
                  <button className={botao}>Aprovar</button>
                </form>
              </td>
              <td className={td}>
                <form action={descartarTelefone}>
                  <input type="hidden" name="original" value={r.telefone_original} />
                  <button className="text-xs text-zinc-500 hover:text-rose-600 hover:underline">descartar</button>
                </form>
              </td>
              <td className={`${td} text-xs`}>{r.edicoes}</td>
              <td className={`${td} tabular`}>{r.ocorrencias}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo="Lançamentos na base">
        <Tabela cabecalho={["Lançamento", "Início", "Inscritos", "Telefones ok", "Revisar", "Compras", "Compras sem telefone", "Usar nas taxas"]} vazio={eds.length === 0}>
          {eds.map((e) => {
            const c = cont.get(e.id);
            return (
              <tr key={e.id}>
                <td className={td}>
                  <div className="font-medium">{e.nome} <span className="text-xs font-normal text-zinc-500">{e.codigo}</span></div>
                  {e.observacao && <div className="text-xs text-zinc-500">{e.observacao}</div>}
                  {e.lancamento_id && <div className="text-xs text-emerald-700 dark:text-emerald-400">inscrições entram sozinhas pelo painel</div>}
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
                        <button className="hover:underline">{e[k] ? "✓" : "✗"} {k === "tem_leads" ? "tem inscritos" : "tem compradores"}</button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </Tabela>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Adicionar lançamento antigo</summary>
          <form action={criarEdicao} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs text-zinc-500">Código (ex.: mar-2025)</span><input name="codigo" required pattern="[a-z0-9-]+" className={campo} /></label>
            <label className="space-y-1"><span className="block text-xs text-zinc-500">Nome</span><input name="nome" required className={campo} /></label>
            <label className="space-y-1"><span className="block text-xs text-zinc-500">Início</span><input name="inicio" type="date" required className={campo} /></label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="tem_leads" defaultChecked /> tem inscritos</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="tem_compras" defaultChecked /> tem compradores</label>
            <button className={botao}>Adicionar</button>
          </form>
        </details>
      </Cartao>

      <Cartao titulo="Adicionar dados (CSV ou Excel)">
        <ImportadorBaseLeads edicoes={eds.map((e) => ({ codigo: e.codigo, nome: e.nome }))} />
      </Cartao>
    </>
  );
}
