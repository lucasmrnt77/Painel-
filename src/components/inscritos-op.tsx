import Link from "next/link";
import { dadosOp, SLUG_OP, type LeadOp } from "@/lib/op-futuros";
import { limparBusca, POR_PAGINA, type Resumo } from "@/lib/dados";
import { dataHora, linkWhatsapp, numero, telefoneBonito } from "@/lib/formato";
import { telefoneComDdi } from "@/lib/grupo-filtros";
import { Busca, Cartao, Chips, Kpi, Paginacao, Selo, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { tradutor } from "@/lib/i18n/servidor";
import type { Busca as BuscaSp } from "@/lib/contexto";

const STATUS = ["fora_do_grupo", "aguardando", "no_grupo", "saiu", "sem_dado"] as const;
const FILTROS = ["no_grupo", "saiu", "sem_inscricao"] as const;
const um = (sp: BuscaSp, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? undefined;

function paginar<T>(itens: T[], pagina: number) {
  const p = Math.max(1, Math.min(pagina || 1, Math.ceil(itens.length / POR_PAGINA) || 1));
  return { linhas: itens.slice((p - 1) * POR_PAGINA, p * POR_PAGINA), pagina: p, total: itens.length };
}

/** Inscritos x grupo da campanha OP Futuros (página do grupo gratuito × membros do grupo). */
export async function InscritosOp({ sp, resumos, extras }: { sp: BuscaSp; resumos: Resumo[]; extras: { slug: string; nome: string; ativo: boolean }[] }) {
  const t = await tradutor();
  const op = await dadosOp();
  const r = op.resumo;

  const statusParam = um(sp, "status");
  const status = STATUS.includes(statusParam as (typeof STATUS)[number]) ? statusParam : undefined;
  const q = um(sp, "q");
  const p = um(sp, "p");
  const f = um(sp, "filtro");
  const filtro = FILTROS.includes(f as (typeof FILTROS)[number]) ? f : undefined;
  const mq = um(sp, "mq");
  const mp = um(sp, "mp");

  const busca = limparBusca(q).toLowerCase();
  const buscaDig = busca.replace(/\D/g, "");
  const filtrarLead = (l: LeadOp) =>
    (!status || l.status === status) &&
    (!busca || (l.email ?? "").toLowerCase().includes(busca) || (buscaDig !== "" && l.telefone.includes(buscaDig)));
  const leads = paginar(op.leads.filter(filtrarLead), Number(p ?? 1));

  const mBusca = limparBusca(mq).replace(/\D/g, "");
  const membros = paginar(
    op.membros
      .filter((m) => (filtro === "no_grupo" ? m.no_grupo : filtro === "saiu" ? !m.no_grupo : filtro === "sem_inscricao" ? m.no_grupo && !m.inscrito : true))
      .filter((m) => !mBusca || m.telefone.includes(mBusca))
      .sort((a, b) => (b.primeira_entrada_em ?? "").localeCompare(a.primeira_entrada_em ?? "")),
    Number(mp ?? 1),
  );

  const estado = { l: SLUG_OP, status, q, p, filtro, mq, mp };
  const href = (extra: Record<string, string | number | undefined>, ancora = "") => montarHref("/inscricoes", { ...estado, ...extra }) + ancora;
  const conta = (s: string) => op.leads.filter((l) => l.status === s).length;
  const pct = (n: number) => (r.base ? t("{p}% dos inscritos", { p: Math.round((100 * n) / r.base) }) : undefined);

  return (
    <>
      <CabecalhoPagina titulo={t("Inscritos x grupo")} resumos={resumos} atual={null} extras={extras} selecionado={SLUG_OP}
        subtitulo={t("Campanha OP Futuros · página do grupo gratuito")} />

      {!op.ok && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">{t("Não consegui cruzar inscrições e grupo.")} {op.erro}</p>
      )}
      {op.ok && !op.webhookLigado && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-400">
          <span className="font-medium text-amber-300">{t("Entradas no grupo ainda não aparecem.")}</span>{" "}
          {t("O painel ainda não recebeu nenhum evento da campanha OP - FUTUROS pelo webhook do Sendflow. Até lá, as inscrições aparecem como \"Antes do webhook\".")}
        </p>
      )}
      {op.corte && (
        <p className="text-xs text-zinc-500">
          {t("As taxas contam só a página de captura nova, a partir de {d}, quando o webhook começou a mandar entradas ({n} inscritos). Quem se inscreveu antes aparece como \"Antes do webhook\" e fica fora das taxas.", { d: dataHora(op.corte), n: numero(r.base) })}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo={t("Inscritos (únicos)")} valor={numero(r.inscritos)} detalhe={t("{n} envios do formulário", { n: numero(r.envios_total) })} />
        <Kpi rotulo={t("Inscritos que entraram")} valor={numero(r.no_grupo + r.saiu)} detalhe={r.pct_no_grupo != null ? t("{p}% dos inscritos", { p: r.pct_no_grupo }) : undefined} destaque="verde" />
        <Kpi rotulo={t("Inscritos fora do grupo")} valor={numero(r.fora_do_grupo)} detalhe={pct(r.fora_do_grupo)} destaque="ambar" />
        <Kpi rotulo={t("Membros no grupo")} valor={numero(r.membros_no_grupo)} detalhe={t("segundo o Sendflow")} />
        <Kpi rotulo={t("Membros sem inscrição")} valor={numero(r.membros_sem_inscricao)} detalhe={t("entraram sem passar pela página")} />
      </section>

      <Cartao
        titulo={t("Inscrições — quem preencheu a página ({n})", { n: numero(leads.total) })}
        acao={<Link href="/grupo?periodo=tudo" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{t("Baixar CSV")}</Link>}
      >
        <div id="inscricoes" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={status ?? "todos"}
            itens={[
              { valor: "todos", rotulo: t("Todos"), qtd: op.leads.length, href: href({ status: undefined, p: undefined }, "#inscricoes") },
              { valor: "fora_do_grupo", rotulo: t("Fora do grupo"), qtd: conta("fora_do_grupo"), href: href({ status: "fora_do_grupo", p: undefined }, "#inscricoes") },
              { valor: "aguardando", rotulo: t("Aguardando"), qtd: conta("aguardando"), href: href({ status: "aguardando", p: undefined }, "#inscricoes") },
              { valor: "no_grupo", rotulo: t("No grupo"), qtd: conta("no_grupo"), href: href({ status: "no_grupo", p: undefined }, "#inscricoes") },
              { valor: "saiu", rotulo: t("Saíram"), qtd: conta("saiu"), href: href({ status: "saiu", p: undefined }, "#inscricoes") },
              ...(conta("sem_dado") ? [{ valor: "sem_dado", rotulo: t("Antes do webhook"), qtd: conta("sem_dado"), href: href({ status: "sem_dado", p: undefined }, "#inscricoes") }] : []),
            ]}
          />
          <Busca acao="/inscricoes" valor={q} ocultos={{ l: SLUG_OP, status, filtro, mq, mp }} placeholder={t("E-mail ou telefone")} />
        </div>
        <Tabela
          cabecalho={[t("Inscrito em"), "WhatsApp", t("E-mail"), t("País"), t("Status"), t("Entrou em"), t("Min. até entrar"), t("Grupo"), t("Envios"), t("Anúncio")]}
          vazio={leads.linhas.length === 0}
        >
          {leads.linhas.map((l) => {
            const tel = telefoneComDdi(l.telefone);
            return (
              <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(l.inscrito_em)}</td>
                <td className={`${td} tabular whitespace-nowrap`}>
                  {linkWhatsapp(l.telefone) ? <a className="hover:underline" href={linkWhatsapp(l.telefone)!} target="_blank" rel="noreferrer">{tel}</a> : tel}
                </td>
                <td className={`${td} text-zinc-600 dark:text-zinc-400`}>{l.email ?? "—"}</td>
                <td className={`${td} whitespace-nowrap`}>{l.pais ?? "—"}</td>
                <td className={td}><Selo status={l.status} /></td>
                <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{l.saiu_em ? t("saiu {d}", { d: dataHora(l.saiu_em) }) : dataHora(l.entrou_em)}</td>
                <td className={`${td} tabular text-zinc-500`}>{l.minutos_ate_entrar ?? "—"}</td>
                <td className={`${td} text-xs text-zinc-500`}>{l.grupo_nome ?? "—"}</td>
                <td className={`${td} tabular text-zinc-500`}>{l.envios}</td>
                <td className={`${td} text-xs text-zinc-500`}>{l.utm_content ?? "—"}</td>
              </tr>
            );
          })}
        </Tabela>
        <div className="mt-4">
          <Paginacao pagina={leads.pagina} total={leads.total} porPagina={POR_PAGINA} href={(n) => href({ p: n }, "#inscricoes")} />
        </div>
      </Cartao>

      <Cartao titulo={t("Membros do grupo — quem de fato entrou ({n})", { n: numero(membros.total) })}>
        <div id="membros" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips
            ativo={filtro ?? "todos"}
            itens={[
              { valor: "todos", rotulo: t("Todos"), qtd: op.membros.length, href: href({ filtro: undefined, mp: undefined }, "#membros") },
              { valor: "no_grupo", rotulo: t("No grupo"), qtd: r.membros_no_grupo, href: href({ filtro: "no_grupo", mp: undefined }, "#membros") },
              { valor: "saiu", rotulo: t("Saíram"), href: href({ filtro: "saiu", mp: undefined }, "#membros") },
              { valor: "sem_inscricao", rotulo: t("Sem inscrição"), qtd: r.membros_sem_inscricao, href: href({ filtro: "sem_inscricao", mp: undefined }, "#membros") },
            ]}
          />
          <Busca acao="/inscricoes" nome="mq" valor={mq} ocultos={{ l: SLUG_OP, status, q, p, filtro }} placeholder={t("Telefone")} />
        </div>
        <Tabela cabecalho={["WhatsApp", t("No grupo"), t("Grupo"), t("Entrou em"), t("Saiu em"), t("Inscrito")]} vazio={membros.linhas.length === 0}>
          {membros.linhas.map((m) => (
            <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className={`${td} tabular whitespace-nowrap`}>{telefoneBonito(m.telefone)}</td>
              <td className={td}>
                {m.no_grupo ? <span className="text-emerald-700 dark:text-emerald-400">{t("Sim")}</span> : <span className="text-rose-700 dark:text-rose-400">{t("Não")}</span>}
              </td>
              <td className={`${td} text-zinc-600 dark:text-zinc-400`}>{m.grupo_nome ?? (m.grupo_id || "—")}</td>
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(m.primeira_entrada_em)}</td>
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(m.saiu_em)}</td>
              <td className={td}>{m.inscrito ? t("Sim") : <span className="text-amber-700 dark:text-amber-400">{t("Não")}</span>}</td>
            </tr>
          ))}
        </Tabela>
        <div className="mt-4">
          <Paginacao pagina={membros.pagina} total={membros.total} porPagina={POR_PAGINA} href={(n) => href({ mp: n }, "#membros")} />
        </div>
      </Cartao>

    </>
  );
}
