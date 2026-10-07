import Link from "next/link";
import { exigirLogin } from "@/lib/sessao";
import { grupoConfigurado, listarGrupo, rpcGrupo } from "@/lib/grupo";
import {
  argsResumoGrupo, DIMENSOES, diaCurto, hojeUY, hrefGrupo, lerFiltrosGrupo, paramsGrupo, PERIODOS, queryListaGrupo,
  somarDias, telefoneComDdi, type Dimensao,
} from "@/lib/grupo-filtros";
import { dataHora, numero } from "@/lib/formato";
import { Busca, Cartao, Kpi, Paginacao, Tabela, td } from "@/components/ui";
import { GraficoBarras, type Ponto } from "@/components/grafico-barras";
import { Ranking } from "@/components/ranking";
import { AutoAtualizar } from "@/components/auto-atualizar";

export const dynamic = "force-dynamic";

type Item = { valor: string; n: number };
type Resumo = {
  total: number; repetidas: number; hoje: number; primeira: string | null;
  por_dia: { dia: string; n: number }[]; por_hora: { hora: number; n: number }[];
  por_pais: Item[]; por_source: Item[]; por_campaign: Item[]; por_content: Item[];
};
type Linha = {
  id: number; creado_en: string; email: string; telefono: string; pais: string | null;
  utm_source: string | null; utm_campaign: string | null; utm_content: string | null; envios: number;
};

const POR_PAGINA = 50;

export default async function Grupo({ searchParams }: PageProps<"/grupo">) {
  await exigirLogin();

  if (!grupoConfigurado()) {
    return (
      <Cartao titulo="Grupo gratuito — falta configurar">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Para ver aqui as inscrições da página do grupo, adicione na Vercel (projeto do painel) as variáveis{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GRUPO_SUPABASE_URL</code> e{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GRUPO_SUPABASE_SERVICE_ROLE_KEY</code> — os mesmos valores de
          SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do projeto captura-grupo — e faça o redeploy.
        </p>
      </Cartao>
    );
  }

  const f = lerFiltrosGrupo(await searchParams);
  const [r, lista] = await Promise.all([
    rpcGrupo<Resumo>("painel_resumo", argsResumoGrupo(f)),
    listarGrupo<Linha>("inscripciones", queryListaGrupo(f, "id,creado_en,email,telefono,pais,utm_source,utm_campaign,utm_content,envios"),
      (f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA - 1),
  ]);

  // Série do gráfico: por hora quando o período é "hoje"; por dia nos demais (dias sem inscrição = 0)
  let pontos: Ponto[];
  let tituloGrafico: string;
  if (f.periodo === "hoje") {
    const m = new Map(r.por_hora.map((h) => [h.hora, h.n]));
    pontos = Array.from({ length: 24 }, (_, h) => ({ chave: String(h), rotulo: `${h}h`, rotuloLongo: `${String(h).padStart(2, "0")}h–${String(h).padStart(2, "0")}h59`, n: m.get(h) ?? 0 }));
    tituloGrafico = "Inscrições por hora (hoje, horário do Uruguai)";
  } else {
    const m = new Map(r.por_dia.map((d) => [d.dia, d.n]));
    const fim = hojeUY();
    const inicio = f.periodo === "7d" ? somarDias(fim, -6) : f.periodo === "30d" ? somarDias(fim, -29) : (r.por_dia[0]?.dia ?? fim);
    pontos = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) pontos.push({ chave: d, rotulo: diaCurto(d), rotuloLongo: diaCurto(d, true), n: m.get(d) ?? 0 });
    tituloGrafico = "Inscrições por dia (horário do Uruguai)";
  }
  const dias = f.periodo === "hoje" ? 1 : pontos.length;
  const media = dias ? r.total / dias : 0;
  const filtrosAtivos = DIMENSOES.filter((d) => f.dims[d.chave]);
  const rotuloPeriodo = PERIODOS.find((p) => p.valor === f.periodo)!.rotulo.toLowerCase();

  return (
    <>
      <AutoAtualizar segundos={60} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Grupo gratuito</h1>
          <p className="text-sm text-zinc-500">Inscrições da página do grupo de WhatsApp (captura-grupo) · atualiza a cada minuto</p>
        </div>
        <a href={`/api/exportar-grupo?${paramsGrupo(f)}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Exportar CSV
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p.valor} href={hrefGrupo(f, { periodo: p.valor })} aria-current={f.periodo === p.valor ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm ${f.periodo === p.valor ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}>
              {p.rotulo}
            </Link>
          ))}
        </nav>
        {filtrosAtivos.map((d) => (
          <Link key={d.chave} href={hrefGrupo(f, { [d.chave]: null })} title="Remover filtro"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500 px-3 py-1 text-xs">
            <span className="text-zinc-500">{d.rotulo.split(" (")[0]}:</span> <strong>{f.dims[d.chave]}</strong> <span aria-hidden>✕</span>
          </Link>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={`Inscrições · ${rotuloPeriodo}`} valor={numero(r.total)} />
        <Kpi rotulo="Hoje" valor={numero(r.hoje)} detalhe="desde 00h do Uruguai" />
        <Kpi rotulo="Média por dia" valor={media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          detalhe={f.periodo === "tudo" && r.primeira ? `desde ${dataHora(r.primeira).split(",")[0]}` : undefined} />
        <Kpi rotulo="Se inscreveram mais de 1 vez" valor={numero(r.repetidas)} detalhe={r.total ? `${Math.round((r.repetidas / r.total) * 100)}% do total` : undefined} />
      </section>

      <Cartao titulo={tituloGrafico}>
        <GraficoBarras pontos={pontos} titulo={tituloGrafico} unidade="inscrições" />
      </Cartao>

      <div className="grid gap-3 md:grid-cols-2">
        {DIMENSOES.map((d) => (
          <Ranking key={d.chave} titulo={d.rotulo} itens={r[`por_${d.chave}` as `por_${Dimensao}`]} total={r.total}
            ativo={f.dims[d.chave]} href={(v) => hrefGrupo(f, { [d.chave]: v })} />
        ))}
      </div>

      <Cartao
        titulo={`Inscritos (${numero(lista.total)})`}
        acao={<Busca acao="/grupo" valor={f.q} placeholder="Buscar e-mail ou WhatsApp" ocultos={{ periodo: f.periodo, ...f.dims }} />}
      >
        <div className="space-y-3">
          <Tabela cabecalho={["Inscrito em", "E-mail", "WhatsApp", "País", "Origem", "Campanha", "Anúncio", "Vezes"]} vazio={lista.linhas.length === 0}>
            {lista.linhas.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className={`${td} tabular whitespace-nowrap`}>{dataHora(l.creado_en)}</td>
                <td className={`${td} max-w-[220px] truncate`} title={l.email}>{l.email}</td>
                <td className={`${td} tabular whitespace-nowrap`}>
                  <a href={`https://wa.me/${l.telefono}`} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline dark:text-emerald-400">{telefoneComDdi(l.telefono)}</a>
                </td>
                <td className={td}>{l.pais ?? "—"}</td>
                <td className={td}>{l.utm_source ?? "—"}</td>
                <td className={`${td} max-w-[160px] truncate`} title={l.utm_campaign ?? ""}>{l.utm_campaign ?? "—"}</td>
                <td className={`${td} max-w-[140px] truncate`} title={l.utm_content ?? ""}>{l.utm_content ?? "—"}</td>
                <td className={`${td} tabular`}>{l.envios}</td>
              </tr>
            ))}
          </Tabela>
          <Paginacao pagina={f.pagina} total={lista.total} porPagina={POR_PAGINA} href={(p) => hrefGrupo(f, { pagina: String(p) })} />
        </div>
      </Cartao>
    </>
  );
}
