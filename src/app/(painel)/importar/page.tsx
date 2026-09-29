import { contexto } from "@/lib/contexto";
import { Cartao } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { Importador } from "@/components/importador";

export default async function Importar({ searchParams }: PageProps<"/importar">) {
  const { resumos, atual } = await contexto(await searchParams);
  if (!atual) return (<><CabecalhoPagina titulo="Importar planilha" resumos={resumos} atual={null} /><SemLancamento /></>);
  const opcoes = [atual, ...resumos.filter((r) => r.lancamento_id !== atual.lancamento_id)].map((r) => ({ id: r.lancamento_id, nome: r.nome }));
  return (
    <>
      <CabecalhoPagina titulo="Importar planilha" resumos={resumos} atual={atual} />
      <Cartao titulo="Planilha de leads (histórico)">
        <div className="mb-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            Importa a planilha &quot;Página de Traders – Leads&quot; para o lançamento escolhido. Colunas usadas: Fecha, Hora, Experiencia,
            Telefono, Campana, Anuncio, utm_source, utm_medium, utm_term, Landing, Pagina de gracias e Grupo. CHEQUEO e Pais são ignoradas.
          </p>
          <p>
            Pode importar de novo a planilha atualizada: linhas já importadas não duplicam, só a coluna Grupo é atualizada. Se o Sendflow
            tiver dados da pessoa, eles prevalecem sobre a coluna Grupo.
          </p>
        </div>
        <Importador lancamentos={opcoes} />
      </Cartao>
    </>
  );
}
