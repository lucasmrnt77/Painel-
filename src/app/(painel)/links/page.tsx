import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { dominioLinks } from "@/lib/links";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela } from "@/components/ui";
import { FormImportar, FormLink, LinhaLink, type ItemLink } from "@/components/links";

export const dynamic = "force-dynamic";

export default async function Links() {
  await exigirLogin();
  const { data, error } = await db().rpc("links_resumo");
  if (error) {
    return <Cartao titulo="Links"><p className="text-sm text-rose-600">Aplique a migração 012-links.sql no Supabase. ({error.message})</p></Cartao>;
  }
  const itens = (data ?? []) as ItemLink[];
  const dominio = dominioLinks();
  const ativos = itens.filter((i) => i.link.ativo).length;
  const divididos = itens.filter((i) => i.destinos.filter((d) => d.peso > 0).length > 1).length;
  const total24h = itens.reduce((s, i) => s + i.cliques_24h, 0);
  const total7d = itens.reduce((s, i) => s + i.cliques_7d, 0);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">Links</h1>
        <p className="text-sm text-zinc-500">
          Links curtos em <strong>{dominio}</strong>. Com mais de um destino, cada clique vai para um deles conforme a porcentagem.
          Prévias do WhatsApp e robôs redirecionam, mas não contam como clique.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Links ativos" valor={numero(ativos)} detalhe={`${numero(itens.length)} no total`} />
        <Kpi rotulo="Com divisão de tráfego" valor={numero(divididos)} />
        <Kpi rotulo="Cliques nas últimas 24h" valor={numero(total24h)} />
        <Kpi rotulo="Cliques em 7 dias" valor={numero(total7d)} />
      </section>

      <Cartao titulo="Novo link">
        <FormLink dominio={dominio} />
      </Cartao>

      <Cartao titulo={`Seus links (${numero(itens.length)})`}>
        <Tabela cabecalho={["Link curto", "Destinos", "Cliques", ""]} vazio={itens.length === 0}>
          {itens.map((item) => <LinhaLink key={item.link.id} dominio={dominio} item={item} />)}
        </Tabela>
      </Cartao>

      <Cartao titulo="Importar do Rebrandly">
        <FormImportar dominio={dominio} />
      </Cartao>
    </>
  );
}
