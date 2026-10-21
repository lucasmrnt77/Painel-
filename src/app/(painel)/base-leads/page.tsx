import { exigirLogin } from "@/lib/sessao";
import { MultiSelecao } from "@/components/multi-selecao";
import { db } from "@/lib/supabase";
import {
  contagensPorEdicao, conversaoPorEdicao, repeticaoPorEdicao, conversaoPorParticipacao, conversaoPorTotal, edicoes,
  FILTROS_COMPRA, fontesPorEdicao, resumoProblemas, telefonesInvalidos, telefonesParaRevisar, type FonteEdicao, type ResumoProblema,
} from "@/lib/base-leads";
import {
  alternarEdicao, aprovarTelefone, aprovarTodasSugestoes, ativarEdicao, atualizarBase, criarEdicao, descartarTelefone, encerrarEdicao,
} from "@/lib/acoes-base-leads";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { ImportadorBaseLeads } from "@/components/importador-base-leads";
import { tradutor } from "@/lib/i18n/servidor";
import type { T } from "@/lib/i18n";
import { dicaDoMotivo } from "@/lib/telefone-dicas";

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
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const motivoRevisar = um(sp.rmot);
  const motivoInvalido = um(sp.imot);

  const [eds, porPart, porEdicao, porTotal, contagens, revisar, ultima, totais, repeticao, lancsPainel, fontes, invalidos, problemas] = await Promise.all([
    edicoes(), conversaoPorParticipacao(), conversaoPorEdicao(), conversaoPorTotal(), contagensPorEdicao(),
    telefonesParaRevisar(100, "todos", motivoRevisar),
    db().from("bd_atualizacoes").select("atualizado_em").order("id", { ascending: false }).limit(1).maybeSingle(),
    db().from("v_bd_revisar").select("telefone_original", { count: "exact", head: true }),
    repeticaoPorEdicao(),
    db().from("lancamentos").select("id, nome").eq("tipo", "lancamento").order("id", { ascending: false }),
    fontesPorEdicao(),
    telefonesInvalidos(100, motivoInvalido),
    resumoProblemas(),
  ]);
  const cont = new Map(contagens.map((c) => [c.edicao_id, c]));
  const fontesDe = new Map<number, FonteEdicao[]>();
  for (const f of fontes) fontesDe.set(f.edicao_id, [...(fontesDe.get(f.edicao_id) ?? []), f]);
  const pessoas = porTotal.reduce((s, l) => s + l.pessoas, 0);
  const compraramEt = porTotal.reduce((s, l) => s + l.compraram_et, 0);
  const compraramTpp = porTotal.reduce((s, l) => s + l.compraram_tpp, 0);
  const totalRevisar = totais.count ?? 0;
  const emMaisDeUm = porTotal.filter((l) => l.lancamentos !== "1").reduce((s, l) => s + l.pessoas, 0);
  const nomeEdicao = new Map(eds.map((e) => [e.codigo, e.nome]));
  const ligados = new Set(eds.map((e) => e.lancamento_id).filter(Boolean));
  const livres = ((lancsPainel.data ?? []) as { id: number; nome: string }[]).filter((l) => !ligados.has(l.id));
  const ativa = eds.find((e) => e.ativa);
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
        acao={<form action={atualizarBase}><button className={botao}>{t("Recalcular agora")}</button></form>}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("Números que a regra não conseguiu corrigir com segurança. Ficam fora das estatísticas até alguém aprovar uma correção ou descartar. Os que aparecem completos em outro registro ou no grupo de WhatsApp são corrigidos sozinhos.")}
        </p>
        <ResumoMotivos t={t} itens={problemas.filter((p) => p.lista === "revisar")} param="rmot" atual={motivoRevisar} sp={sp} />
        {motivoRevisar && dicaDoMotivo(motivoRevisar).sugestaoConfiavel && revisar.itens.some((r) => r.sugestao) && (
          <form action={aprovarTodasSugestoes} className="mb-3">
            <input type="hidden" name="motivo" value={motivoRevisar} />
            <button className={botao}>{t("Aprovar as {n} sugestões deste tipo", { n: numero(revisar.total) })}</button>
          </form>
        )}
        <Tabela cabecalho={[t("Telefone como chegou"), t("Causa provável"), t("Número certo"), "", t("Lançamentos"), t("Vezes")]} vazio={revisar.itens.length === 0}>
          {revisar.itens.map((r) => (
            <LinhaTelefone key={r.telefone_original} t={t} original={r.telefone_original} motivo={r.motivo_sugestao ?? r.motivo}
              ia={r.origem_sugestao === "ia"} sugestao={r.sugestao} comprador={r.e_comprador} edicoes={r.edicoes} vezes={r.ocorrencias} />
          ))}
        </Tabela>
        {revisar.total > revisar.itens.length && <p className="mt-2 text-xs text-zinc-500">{t("Mostrando {a} de {b}. Corrija ou descarte para ver os próximos.", { a: numero(revisar.itens.length), b: numero(revisar.total) })}</p>}
      </Cartao>

      <Cartao titulo={t("Telefones inválidos ({n})", { n: numero(invalidos.total) })}>
        <p className="mb-3 text-xs text-zinc-500">
          {t("Números que não existem no formato do país e não apareceram completos em nenhum outro lugar. Ficam fora das estatísticas. Se souber o número certo, edite; se não der para recuperar, descarte para tirar da lista.")}
        </p>
        <ResumoMotivos t={t} itens={problemas.filter((p) => p.lista === "invalido")} param="imot" atual={motivoInvalido} sp={sp} />
        <Tabela cabecalho={[t("Telefone como chegou"), t("Causa provável"), t("Número certo"), "", t("Lançamentos"), t("Vezes")]} vazio={invalidos.itens.length === 0}>
          {invalidos.itens.map((r) => (
            <LinhaTelefone key={r.telefone_original} t={t} original={r.telefone_original} motivo={r.motivo}
              sugestao={null} comprador={r.e_comprador} edicoes={r.edicoes} vezes={r.ocorrencias} />
          ))}
        </Tabela>
        {invalidos.total > invalidos.itens.length && <p className="mt-2 text-xs text-zinc-500">{t("Mostrando {a} de {b}. Corrija ou descarte para ver os próximos.", { a: numero(invalidos.itens.length), b: numero(invalidos.total) })}</p>}
      </Cartao>

      <Cartao titulo={t("Lançamentos na base")}>
        <p className="mb-3 text-xs text-zinc-500">
          {ativa
            ? t("Lançamento ativo: {nome}. Só ele recebe sozinho as inscrições novas do painel. Ao ativar outro, este deixa de receber.", { nome: t(ativa.nome) })
            : t("Nenhum lançamento ativo: as inscrições novas do painel não estão entrando na base. Ative o lançamento em andamento.")}
        </p>
        <p className="mb-3 text-xs text-zinc-500">
          {t("Linhas nas planilhas = inscrições como estão nas planilhas (a mesma pessoa pode aparecer mais de uma vez). Pessoas únicas = números diferentes (mais as linhas sem telefone válido); é o que conta nas taxas.")}
        </p>
        <Tabela cabecalho={[t("Lançamento"), t("Situação"), t("Início"), t("Linhas nas planilhas"), t("Pessoas únicas"), t("Telefones ok"), t("Revisar"), t("Compras"), t("Compras sem telefone"), t("Usar nas taxas")]} vazio={eds.length === 0}>
          {eds.map((e) => {
            const c = cont.get(e.id);
            return (
              <tr key={e.id}>
                <td className={td}>
                  <div className="font-medium">{t(e.nome)} <span className="text-xs font-normal text-zinc-500">{e.codigo}</span></div>
                  {e.observacao && <div className="text-xs text-zinc-500">{t(e.observacao)}</div>}
                  {(fontesDe.get(e.id) ?? []).length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                      {(fontesDe.get(e.id) ?? []).map((f) => (
                        <li key={f.fonte}>
                          {f.linhas_planilha !== f.linhas_base
                            ? t("{fonte}: {linhas} linhas na planilha → {base} entraram na base", { fonte: f.fonte, linhas: numero(f.linhas_planilha), base: numero(f.linhas_base) })
                            : t("{fonte}: {linhas} linhas, {numeros} números diferentes", { fonte: f.fonte, linhas: numero(f.linhas_planilha), numeros: numero(f.numeros) })}
                          {f.observacao && <> ({t(f.observacao)})</>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className={`${td} text-xs`}>
                  {e.ativa ? (
                    <div className="space-y-1">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{t("Ativo")}</span>
                      <div className="text-zinc-500">{t("recebe as inscrições do painel")}</div>
                      <form action={encerrarEdicao}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className={botao}>{t("Encerrar lançamento")}</button>
                      </form>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-zinc-500">{e.encerrada_em ? t("Encerrado em {d}", { d: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(e.encerrada_em)) }) : e.lancamento_id ? t("Inativo") : t("Importado")}</span>
                      {(e.lancamento_id || livres.length > 0) && (
                        <form action={ativarEdicao} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={e.id} />
                          {!e.lancamento_id && (
                            <select name="lancamento_id" required defaultValue="" className={`${campo} py-1 text-xs`}>
                              <option value="" disabled>{t("lançamento do painel")}</option>
                              {livres.map((l) => <option key={l.id} value={l.id}>{t(l.nome)}</option>)}
                            </select>
                          )}
                          <button className={botao}>{t("Ativar")}</button>
                        </form>
                      )}
                    </div>
                  )}
                </td>
                <td className={`${td} tabular`}>{e.inicio.split("-").reverse().join("/")}</td>
                <td className={`${td} tabular`}>{numero(c?.linhas_planilha ?? 0)}</td>
                <td className={`${td} tabular`}>{numero(c?.pessoas ?? 0)}</td>
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

type Params = Record<string, string | string[] | undefined>;

/** Filtro por tipo de problema (chips com a quantidade). */
function ResumoMotivos({ t, itens, param, atual, sp }: { t: T; itens: ResumoProblema[]; param: string; atual?: string; sp: Params }) {
  if (itens.length === 0) return null;
  const link = (motivo?: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== param && typeof v === "string") q.set(k, v);
    if (motivo) q.set(param, motivo);
    const s = q.toString();
    return `/base-leads${s ? `?${s}` : ""}`;
  };
  const chip = (ativo: boolean) =>
    `rounded-full border px-2 py-0.5 text-xs ${ativo ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`;
  const dica = atual ? dicaDoMotivo(atual) : null;
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-1">
        <a href={link()} className={chip(!atual)}>{t("Todos")}</a>
        {itens.map((i) => (
          <a key={i.motivo ?? ""} href={link(i.motivo ?? "")} className={chip(atual === i.motivo)}>
            {traduzirMotivo(t, i.motivo ?? "")} · {numero(i.numeros)}
          </a>
        ))}
      </div>
      {dica && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <b>{t("Causa:")}</b> {t(dica.causa)} <b>{t("Como corrigir:")}</b> {t(dica.comoCorrigir)}
        </div>
      )}
    </div>
  );
}

/** Uma linha de telefone com problema: causa provável, campo para editar o número e descartar. */
function LinhaTelefone({ t, original, motivo, ia, sugestao, comprador, edicoes, vezes }: {
  t: T; original: string; motivo: string | null; ia?: boolean; sugestao: string | null; comprador: boolean; edicoes: string; vezes: number;
}) {
  const dica = dicaDoMotivo(motivo);
  return (
    <tr>
      <td className={`${td} font-mono text-xs`}>{original}{comprador && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{t("comprador")}</span>}</td>
      <td className={`${td} max-w-xs text-xs`}>
        <div>{traduzirMotivo(t, motivo ?? "")}{ia && <span className="ml-1 text-[10px] text-zinc-500">{t("(sugestão da IA)")}</span>}</div>
        <div className="text-zinc-500">{t(dica.causa)}</div>
      </td>
      <td className={td}>
        <form action={aprovarTelefone} className="flex gap-1">
          <input type="hidden" name="original" value={original} />
          <input name="telefone" defaultValue={sugestao ?? original} required inputMode="numeric" pattern="[0-9 +()-]{10,20}"
            title={t("Número com código do país, ex.: 5491112345678 ou 59891234567")} className={`${campo} w-40 font-mono text-xs`} />
          <button className={botao}>{sugestao ? t("Aprovar") : t("Salvar")}</button>
        </form>
        {sugestao && !dica.sugestaoConfiavel && <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">{t("sugestão pouco confiável: confira antes")}</div>}
      </td>
      <td className={td}>
        <form action={descartarTelefone}>
          <input type="hidden" name="original" value={original} />
          <button className="text-xs text-zinc-500 hover:text-rose-600 hover:underline">{t("descartar")}</button>
        </form>
      </td>
      <td className={`${td} text-xs`}>{edicoes}</td>
      <td className={`${td} tabular`}>{vezes}</td>
    </tr>
  );
}
