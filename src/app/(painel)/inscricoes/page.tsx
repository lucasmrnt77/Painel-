import { contexto, param } from "@/lib/contexto";
import { listarLeads, listarMembros, POR_PAGINA } from "@/lib/dados";
import { dataHora, faixaBonita, generoBonito, investimentoBonito, linkWhatsapp, numero, paginaBonita, telefoneBonito } from "@/lib/formato";
import { Busca, Cartao, Chips, Kpi, Paginacao, Selo, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { FormImportar } from "@/components/formularios";

const STATUS = ["fora_do_grupo", "aguardando", "no_grupo", "saiu", "telefone_invalido"] as const;
const FILTROS = ["no_grupo", "saiu", "sem_inscricao"] as const;
const botaoCsv = "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/**
 * Inscritos x grupo: as inscrições (quem preencheu a página) e, logo abaixo,
 * os membros do grupo (quem de fato entrou), para comparar lado a lado.
 * Cada tabela tem filtros, busca e paginação próprios:
 *   inscrições → status, q, p · membros → filtro, mq, mp
 */
export default async function InscritosXGrupo({ searchParams }: PageProps<"/inscricoes">) {
  const sp = await searchParams;
  const { resumos, atual } = await contexto(sp);
  if (!atual) return (<><CabecalhoPagina titulo="Inscritos x grupo" resumos={resumos} atual={null} /><SemLancamento /></>);

  const statusParam = param(sp, "status");
  const status = STATUS.includes(statusParam as (typeof STATUS)[number]) ? statusParam : undefined;
  const q = param(sp, "q");
  const p = param(sp, "p");
  const f = param(sp, "filtro");
  const filtro = FILTROS.includes(f as (typeof FILTROS)[number]) ? f : undefined;
  const mq = param(sp, "mq");
  const mp = param(sp, "mp");

  const [leads, membros] = await Promise.all([
    listarLeads(atual.lancamento_id, { status, q, pagina: Number(p ?? 1) }),
    listarMembros(atual.lancamento_id, { filtro, q: mq, pagina: Number(mp ?? 1) }),
  ]);

  // Estado completo da página: mexer numa tabela não perde os filtros da outra
  const estado = { l: atual.slug, status, q, p, filtro, mq, mp };
  const href = (extra: Record<string, string | number | undefined>, ancora = "") => montarHref("/inscricoes", { ...estado, ...extra }) + ancora;

  // Nome/e-mail só aparecem se alguma linha tiver (as páginas atuais só pedem WhatsApp)
  const comContato = leads.linhas.some((l) => l.nome || l.email);
  const pct = (n: number) => (atual.inscritos ? `${Math.round((100 * n) / atual.inscritos)}% dos inscritos` : undefined);

  return (
    <>
      <CabecalhoPagina titulo="Inscritos x grupo" resumos={resumos} atual={atual} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Inscritos (únicos)" valor={numero(atual.inscritos)} detalhe={`${numero(atual.envios_total)} envios do formulário`} />
        <Kpi rotulo="Inscritos que entraram" valor={numero(atual.no_grupo)} detalhe={atual.pct_inscritos_no_grupo != null ? `${atual.pct_inscritos_no_grupo}% dos inscritos` : undefined} destaque="verde" />
        <Kpi rotulo="Inscritos fora do grupo" valor={numero(atual.fora_do_grupo)} detalhe={pct(atual.fora_do_grupo)} destaque="ambar" />
        <Kpi rotulo="Membros no grupo" valor={numero(atual.membros_no_grupo)} detalhe="segundo o Sendflow" />
        <Kpi rotulo="Membros sem inscrição" valor={numero(atual.membros_sem_inscricao)} detalhe="entraram sem passar pela página" />
      </section>

      <Cartao
        titulo={`Inscrições — quem preencheu a página (${numero(leads.total)})`}
        acao={<a href={montarHref("/api/exportar", { l: atual.slug, status })} className={botaoCsv}>Baixar CSV</a>}
      >
        <div id="inscricoes" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={status ?? "todos"}
            itens={[
              { valor: "todos", rotulo: "Todos", qtd: atual.inscritos, href: href({ status: undefined, p: undefined }, "#inscricoes") },
              { valor: "fora_do_grupo", rotulo: "Fora do grupo", qtd: atual.fora_do_grupo, href: href({ status: "fora_do_grupo", p: undefined }, "#inscricoes") },
              { valor: "aguardando", rotulo: "Aguardando", qtd: atual.aguardando, href: href({ status: "aguardando", p: undefined }, "#inscricoes") },
              { valor: "no_grupo", rotulo: "No grupo", qtd: atual.no_grupo, href: href({ status: "no_grupo", p: undefined }, "#inscricoes") },
              { valor: "saiu", rotulo: "Saíram", qtd: atual.saiu, href: href({ status: "saiu", p: undefined }, "#inscricoes") },
              ...(atual.telefone_invalido ? [{ valor: "telefone_invalido", rotulo: "Tel. inválido", qtd: atual.telefone_invalido, href: href({ status: "telefone_invalido", p: undefined }, "#inscricoes") }] : []),
            ]}
          />
          <Busca acao="/inscricoes" valor={q} ocultos={{ l: atual.slug, status, filtro, mq, mp }} placeholder="Nome, e-mail ou telefone" />
        </div>
        <Tabela
          cabecalho={[
            "Inscrito em",
            ...(comContato ? ["Nome", "E-mail"] : []),
            "WhatsApp", "Página", "Idade", "Gênero", "Investimento",
            "Status", "Entrou em", "Min. até entrar", "Envios", "Origem",
          ]}
          vazio={leads.linhas.length === 0}
        >
          {leads.linhas.map((l) => (
            <tr key={l.inscricao_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(l.inscrito_em)}</td>
              {comContato && <td className={td}>{l.nome ?? "—"}</td>}
              {comContato && <td className={`${td} text-zinc-600 dark:text-zinc-400`}>{l.email ?? "—"}</td>}
              <td className={`${td} tabular whitespace-nowrap`}>
                {linkWhatsapp(l.telefone)
                  ? <a className="hover:underline" href={linkWhatsapp(l.telefone)!} target="_blank" rel="noreferrer">{telefoneBonito(l.telefone, false)}</a>
                  : telefoneBonito(l.telefone, false)}
              </td>
              <td className={`${td} whitespace-nowrap`} title={l.experiencia ? `Experiência: ${l.experiencia}` : undefined}>{paginaBonita(l.pagina_captura)}</td>
              <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{faixaBonita(l.faixa_etaria)}</td>
              <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{generoBonito(l.genero)}</td>
              <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`} title={l.resposta_dinheiro ?? undefined}>{investimentoBonito(l.resposta_dinheiro)}</td>
              <td className={td}><Selo status={l.status} /></td>
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{l.saiu_em && l.status === "saiu" ? `saiu ${dataHora(l.saiu_em)}` : dataHora(l.entrou_em)}</td>
              <td className={`${td} tabular text-zinc-500`}>{l.minutos_ate_entrar ?? "—"}</td>
              <td className={`${td} tabular text-zinc-500`}>{l.n_envios}</td>
              <td className={`${td} text-xs text-zinc-500`}>{[l.utm_source, l.utm_campaign].filter(Boolean).join(" / ") || "—"}</td>
            </tr>
          ))}
        </Tabela>
        <div className="mt-4">
          <Paginacao pagina={leads.pagina} total={leads.total} porPagina={POR_PAGINA} href={(n) => href({ p: n }, "#inscricoes")} />
        </div>
      </Cartao>

      <Cartao titulo={`Membros do grupo — quem de fato entrou (${numero(membros.total)})`}>
        <div id="membros" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={filtro ?? "todos"}
            itens={[
              { valor: "todos", rotulo: "Todos", href: href({ filtro: undefined, mp: undefined }, "#membros") },
              { valor: "no_grupo", rotulo: "No grupo", qtd: atual.membros_no_grupo, href: href({ filtro: "no_grupo", mp: undefined }, "#membros") },
              { valor: "saiu", rotulo: "Saíram", href: href({ filtro: "saiu", mp: undefined }, "#membros") },
              { valor: "sem_inscricao", rotulo: "Sem inscrição", qtd: atual.membros_sem_inscricao, href: href({ filtro: "sem_inscricao", mp: undefined }, "#membros") },
            ]}
          />
          <Busca acao="/inscricoes" nome="mq" valor={mq} ocultos={{ l: atual.slug, status, q, p, filtro }} placeholder="Telefone" />
        </div>
        <Tabela cabecalho={["WhatsApp", "No grupo", "Grupo", "Entrou em", "Saiu em", "Inscrito", "Nome (da inscrição)"]} vazio={membros.linhas.length === 0}>
          {membros.linhas.map((m) => (
            <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className={`${td} tabular whitespace-nowrap`}>{telefoneBonito(m.telefone)}</td>
              <td className={td}>
                {m.no_grupo
                  ? <span className="text-emerald-700 dark:text-emerald-400">Sim</span>
                  : <span className="text-rose-700 dark:text-rose-400">Não</span>}
              </td>
              <td className={`${td} text-zinc-600 dark:text-zinc-400`}>{m.grupo_nome ?? (m.grupo_id || "—")}</td>
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(m.primeira_entrada_em)}</td>
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(m.saiu_em)}</td>
              <td className={td}>{m.inscrito ? "Sim" : <span className="text-amber-700 dark:text-amber-400">Não</span>}</td>
              <td className={td}>{m.nome ?? "—"}</td>
            </tr>
          ))}
        </Tabela>
        <div className="mt-4">
          <Paginacao pagina={membros.pagina} total={membros.total} porPagina={POR_PAGINA} href={(n) => href({ mp: n }, "#membros")} />
        </div>
      </Cartao>

      <Cartao titulo="Importar números que já estão no grupo">
        <FormImportar lancamentoId={atual.lancamento_id} />
      </Cartao>
    </>
  );
}
