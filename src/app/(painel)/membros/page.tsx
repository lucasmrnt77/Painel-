import { contexto, param } from "@/lib/contexto";
import { listarMembros, POR_PAGINA } from "@/lib/dados";
import { dataHora, telefoneBonito } from "@/lib/formato";
import { Busca, Cartao, Chips, Paginacao, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { FormImportar } from "@/components/formularios";

const FILTROS = ["no_grupo", "saiu", "sem_inscricao"] as const;

export default async function Membros({ searchParams }: PageProps<"/membros">) {
  const sp = await searchParams;
  const { resumos, atual } = await contexto(sp);
  if (!atual) return (<><CabecalhoPagina titulo="Membros do grupo" resumos={resumos} atual={null} /><SemLancamento /></>);

  const f = param(sp, "filtro");
  const filtro = FILTROS.includes(f as (typeof FILTROS)[number]) ? f : undefined;
  const q = param(sp, "q");
  const { linhas, total, pagina } = await listarMembros(atual.lancamento_id, { filtro, q, pagina: Number(param(sp, "p") ?? 1) });
  const href = (extra: Record<string, string | number | undefined>) => montarHref("/membros", { l: atual.slug, filtro, q, ...extra });

  return (
    <>
      <CabecalhoPagina titulo="Membros do grupo" resumos={resumos} atual={atual} />
      <Cartao>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={filtro ?? "todos"}
            itens={[
              { valor: "todos", rotulo: "Todos", href: href({ filtro: undefined, p: undefined }) },
              { valor: "no_grupo", rotulo: "No grupo", qtd: atual.membros_no_grupo, href: href({ filtro: "no_grupo", p: undefined }) },
              { valor: "saiu", rotulo: "Saíram", href: href({ filtro: "saiu", p: undefined }) },
              { valor: "sem_inscricao", rotulo: "Sem inscrição", qtd: atual.membros_sem_inscricao, href: href({ filtro: "sem_inscricao", p: undefined }) },
            ]}
          />
          <Busca acao="/membros" valor={q} ocultos={{ l: atual.slug, filtro }} placeholder="Telefone" />
        </div>
        <Tabela cabecalho={["WhatsApp", "No grupo", "Grupo", "Entrou em", "Saiu em", "Inscrito", "Nome (da inscrição)"]} vazio={linhas.length === 0}>
          {linhas.map((m) => (
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
          <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} href={(p) => href({ p })} />
        </div>
      </Cartao>
      <Cartao titulo="Importar números que já estão no grupo">
        <FormImportar lancamentoId={atual.lancamento_id} />
      </Cartao>
    </>
  );
}
