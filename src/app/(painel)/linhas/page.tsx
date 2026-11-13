import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { numero } from "@/lib/formato";
import { Cartao, Chips, Kpi, Tabela } from "@/components/ui";
import { FormLinha, LinhaTabela } from "@/components/linhas";
import { DIAS_AVISO, MESES_RECARGA, ordenarLinhas, situacaoRecarga, type Linha } from "@/lib/linhas";
import { hojeUY } from "@/lib/grupo-filtros";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

/** Linhas telefônicas (059): estado de cada chip e lembrete de recarga a cada 6 meses (só no painel). */
export default async function Linhas({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await exigirLogin();
  const t = await tradutor();
  const { estado: filtro = "ativa" } = await searchParams;
  const { data, error } = await db().from("linhas_telefonicas").select("*");
  if (error) {
    return <Cartao titulo={t("Linhas telefônicas")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "059-linhas-telefonicas.sql" })} ({error.message})</p></Cartao>;
  }
  const hoje = hojeUY();
  const todas = (data ?? []) as Linha[];
  const sit = (l: Linha) => situacaoRecarga(l, hoje);
  const ativas = todas.filter((l) => l.estado === "ativa");
  const vencidas = ativas.filter((l) => sit(l) === "vencida");
  const breve = ativas.filter((l) => sit(l) === "breve");
  const semData = ativas.filter((l) => sit(l) === "sem_data");
  const visiveis = ordenarLinhas(filtro === "todas" ? todas : todas.filter((l) => l.estado === (filtro === "perdida" ? "perdida" : "ativa")), hoje);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{t("Linhas telefônicas")}</h1>
        <p className="text-sm text-zinc-500">
          {t("Cada chip precisa de recarga a cada {m} meses para não ser perdido. Ao clicar em \"Recarga feita\", a próxima fica marcada para daqui a {m} meses. A linha aparece em amarelo {d} dias antes e em vermelho quando vence.", { m: MESES_RECARGA, d: DIAS_AVISO })}
        </p>
      </div>

      {(vencidas.length > 0 || breve.length > 0) && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <strong>{t("Recarga pendente")}</strong>:{" "}
          {[...vencidas, ...breve].map((l) => l.linha).join(" · ")}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Linhas ativas")} valor={numero(ativas.length)} detalhe={t("{n} perdidas", { n: numero(todas.length - ativas.length) })} />
        <Kpi rotulo={t("Recarga vencida")} valor={numero(vencidas.length)} destaque={vencidas.length ? "vermelho" : "verde"} />
        <Kpi rotulo={t("Vence em até {d} dias", { d: DIAS_AVISO })} valor={numero(breve.length)} destaque={breve.length ? "ambar" : undefined} />
        <Kpi rotulo={t("Ativas sem data de recarga")} valor={numero(semData.length)} destaque={semData.length ? "ambar" : undefined} />
      </section>

      <Cartao titulo={t("Linhas ({n})", { n: numero(visiveis.length) })}
        acao={<Chips ativo={filtro} itens={[
          { valor: "ativa", rotulo: t("Ativas"), href: "/linhas", qtd: ativas.length },
          { valor: "perdida", rotulo: t("Perdidas"), href: "/linhas?estado=perdida", qtd: todas.length - ativas.length },
          { valor: "todas", rotulo: t("Todas"), href: "/linhas?estado=todas", qtd: todas.length },
        ]} />}>
        <Tabela cabecalho={[t("Linha"), t("Celular / WhatsApp"), t("Descrição"), t("PIN / PUK"), t("Próxima recarga"), t("Situação"), ""]} vazio={visiveis.length === 0}>
          {visiveis.map((l) => <LinhaTabela key={l.id} linha={l} hoje={hoje} />)}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Nova linha")}>
        <FormLinha />
      </Cartao>
    </>
  );
}
