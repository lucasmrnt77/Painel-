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
            <b>Leads:</b> uma planilha por página de captura (Trader ou Nunca operou), escolhendo a página. Colunas reconhecidas: Fecha, Hora,
            Telefono, Experiencia, Edad, Genero, Respuesta_dinero, Campana/Campaign, Anuncio, utm_source, utm_medium, utm_term, Landing,
            Pagina_captura (variante da página), Pag. de gracias e Grupo (TRUE/FALSE). CHEQUEO, Pais e as demais são ignoradas.
          </p>
          <p>
            <b>Entradas no grupo:</b> a lista de quem entrou nos grupos (Fecha, Hora, Telefono, Grupo), como a aba &quot;Leads Grupo&quot;.
            Ela marca os leads como &quot;no grupo&quot; e dá o tempo entre a inscrição e a entrada.
          </p>
          <p>Reimportar é seguro: nada duplica.</p>
        </div>
        <Importador lancamentos={opcoes} />
      </Cartao>
    </>
  );
}
