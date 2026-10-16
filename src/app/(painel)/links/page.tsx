import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { dominioLinks } from "@/lib/links";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela } from "@/components/ui";
import { FormImportar, FormLink, LinhaLink, type ItemLink } from "@/components/links";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

export default async function Links() {
  await exigirLogin();
  const t = await tradutor();
  const { data, error } = await db().rpc("links_resumo");
  if (error) {
    return <Cartao titulo={t("Links")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "012-links.sql" })} ({error.message})</p></Cartao>;
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
        <h1 className="text-xl font-semibold">{t("Links")}</h1>
        <p className="text-sm text-zinc-500">
          {t("Links curtos em")} <strong>{dominio}</strong>.{" "}
          {t("Com mais de um destino, cada clique vai para um deles conforme a porcentagem. Prévias do WhatsApp e robôs redirecionam, mas não contam como clique.")}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Links ativos")} valor={numero(ativos)} detalhe={t("{n} no total", { n: numero(itens.length) })} />
        <Kpi rotulo={t("Com divisão de tráfego")} valor={numero(divididos)} />
        <Kpi rotulo={t("Cliques nas últimas 24h")} valor={numero(total24h)} />
        <Kpi rotulo={t("Cliques em 7 dias")} valor={numero(total7d)} />
      </section>

      <Cartao titulo={t("Novo link")}>
        <FormLink dominio={dominio} />
      </Cartao>

      <Cartao titulo={t("Seus links ({n})", { n: numero(itens.length) })}>
        <Tabela cabecalho={[t("Link curto"), t("Destinos"), t("Cliques"), ""]} vazio={itens.length === 0}>
          {itens.map((item) => <LinhaLink key={item.link.id} dominio={dominio} item={item} />)}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Importar do Rebrandly")}>
        <FormImportar dominio={dominio} />
      </Cartao>
    </>
  );
}
