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
            Suba a planilha inteira em <b>.xlsx</b> (Google Sheets → Arquivo → Fazer download → Microsoft Excel). O painel lê todas as abas e
            identifica sozinho o que é <b>Leads</b> (inscrições) e o que é <b>Entradas no grupo</b> (Fecha, Hora, Telefono, Grupo). Abas que
            parecem cópia ou que não têm Fecha/Hora/Telefono ficam desmarcadas — confira antes de importar. Também aceita .csv (uma aba).
          </p>
          <p>
            Escolha a página de captura (Trader ou Nunca operou) dos leads desta planilha. Reimportar é seguro: nada duplica, só a coluna
            Grupo e a página são atualizadas.
          </p>
        </div>
        <Importador lancamentos={opcoes} />
      </Cartao>
    </>
  );
}
