import { contexto, param } from "@/lib/contexto";
import { listarLeads, POR_PAGINA } from "@/lib/dados";
import { dataHora, faixaBonita, generoBonito, investimentoBonito, linkWhatsapp, paginaBonita, telefoneBonito } from "@/lib/formato";
import { Busca, Cartao, Chips, Paginacao, Selo, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";

const STATUS = ["fora_do_grupo", "aguardando", "no_grupo", "saiu", "telefone_invalido"] as const;

export default async function Inscricoes({ searchParams }: PageProps<"/inscricoes">) {
  const sp = await searchParams;
  const { resumos, atual } = await contexto(sp);
  if (!atual) return (<><CabecalhoPagina titulo="Inscrições" resumos={resumos} atual={null} /><SemLancamento /></>);

  const statusParam = param(sp, "status");
  const status = STATUS.includes(statusParam as (typeof STATUS)[number]) ? statusParam : undefined;
  const q = param(sp, "q");
  const { linhas, total, pagina } = await listarLeads(atual.lancamento_id, { status, q, pagina: Number(param(sp, "p") ?? 1) });
  const href = (extra: Record<string, string | number | undefined>) => montarHref("/inscricoes", { l: atual.slug, status, q, ...extra });

  // Nome/e-mail só aparecem se alguma linha tiver (as páginas atuais só pedem WhatsApp)
  const comContato = linhas.some((l) => l.nome || l.email);

  const contagem: Record<string, number> = {
    fora_do_grupo: atual.fora_do_grupo, aguardando: atual.aguardando, no_grupo: atual.no_grupo,
    saiu: atual.saiu, telefone_invalido: atual.telefone_invalido,
  };

  return (
    <>
      <CabecalhoPagina titulo="Inscrições" resumos={resumos} atual={atual}>
        <a
          href={montarHref("/api/exportar", { l: atual.slug, status })}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Baixar CSV
        </a>
      </CabecalhoPagina>
      <Cartao>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={status ?? "todos"}
            itens={[
              { valor: "todos", rotulo: "Todos", qtd: atual.inscritos, href: href({ status: undefined, p: undefined }) },
              { valor: "fora_do_grupo", rotulo: "Fora do grupo", qtd: contagem.fora_do_grupo, href: href({ status: "fora_do_grupo", p: undefined }) },
              { valor: "aguardando", rotulo: "Aguardando", qtd: contagem.aguardando, href: href({ status: "aguardando", p: undefined }) },
              { valor: "no_grupo", rotulo: "No grupo", qtd: contagem.no_grupo, href: href({ status: "no_grupo", p: undefined }) },
              { valor: "saiu", rotulo: "Saíram", qtd: contagem.saiu, href: href({ status: "saiu", p: undefined }) },
              ...(contagem.telefone_invalido ? [{ valor: "telefone_invalido", rotulo: "Tel. inválido", qtd: contagem.telefone_invalido, href: href({ status: "telefone_invalido", p: undefined }) }] : []),
            ]}
          />
          <Busca acao="/inscricoes" valor={q} ocultos={{ l: atual.slug, status }} placeholder="Nome, e-mail ou telefone" />
        </div>
        <Tabela
          cabecalho={[
            "Inscrito em",
            ...(comContato ? ["Nome", "E-mail"] : []),
            "WhatsApp", "Página", "Idade", "Gênero", "Investimento",
            "Status", "Entrou em", "Min. até entrar", "Envios", "Origem",
          ]}
          vazio={linhas.length === 0}
        >
          {linhas.map((l) => (
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
          <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA} href={(p) => href({ p })} />
        </div>
      </Cartao>
    </>
  );
}
