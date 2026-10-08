"use client";

import { useActionState, useState } from "react";
import { acaoLink, importarRebrandly, salvarLink } from "@/lib/acoes-links";
import { dividirIgual } from "@/lib/links";
import type { EstadoForm } from "@/lib/acoes";
import { dataHora, numero } from "@/lib/formato";

const campo = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";
const botao = "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const botaoLeve = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";
const rotulo = "space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (!estado) return null;
  if (estado.erro) return <p className="text-sm text-rose-600 dark:text-rose-400">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{estado.ok}</p>;
  return null;
}

export type LinkEditavel = {
  id: number;
  slug: string;
  titulo: string | null;
  repassar_parametros: boolean;
  destinos: { id: number; url: string; peso: number }[];
};

type Linha = { chave: string; id?: number; url: string; peso: string };
let seq = 0;
const novaChave = () => `d${++seq}`;

/** Formulário de criar/editar: final do link, título e destinos com a porcentagem de cada um. */
export function FormLink({ dominio, link, aoTerminar }: { dominio: string; link?: LinkEditavel; aoTerminar?: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    link?.destinos.length
      ? link.destinos.map((d) => ({ chave: novaChave(), id: d.id, url: d.url, peso: String(d.peso) }))
      : [{ chave: novaChave(), url: "", peso: "100" }],
  );
  const [slug, setSlug] = useState(link?.slug ?? "");
  const [titulo, setTitulo] = useState(link?.titulo ?? "");
  const [estado, acao, pendente] = useActionState(async (anterior: EstadoForm, fd: FormData) => {
    const r = await salvarLink(anterior, fd);
    if (r?.ok) {
      if (!link) {
        setLinhas([{ chave: novaChave(), url: "", peso: "100" }]);
        setSlug("");
        setTitulo("");
      }
      aoTerminar?.();
    }
    return r;
  }, undefined);

  const varios = linhas.length > 1;
  const soma = linhas.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  const somaOk = !varios || soma === 100;
  const mudar = (chave: string, campoMudado: "url" | "peso", v: string) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campoMudado]: v } : l)));
  const igualar = (ls: Linha[]) => { const p = dividirIgual(ls.length); return ls.map((l, i) => ({ ...l, peso: String(p[i]) })); };
  const adicionar = () => setLinhas((ls) => igualar([...ls, { chave: novaChave(), url: "", peso: "0" }]));
  const remover = (chave: string) => setLinhas((ls) => { const r = ls.filter((l) => l.chave !== chave); return r.length === 1 ? [{ ...r[0], peso: "100" }] : r; });
  const json = JSON.stringify(linhas.map((l) => ({ ...(l.id ? { id: l.id } : {}), url: l.url.trim(), peso: varios ? Number(l.peso) || 0 : 100 })));

  return (
    <form action={acao} className="space-y-3">
      {link && <input type="hidden" name="id" value={link.id} />}
      <input type="hidden" name="destinos" value={json} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>
          Link curto
          <div className="flex items-center rounded-lg border border-zinc-300 bg-white text-sm focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            <span className="whitespace-nowrap pl-3 text-zinc-400">{dominio}/</span>
            <input name="slug" required value={slug} onChange={(e) => setSlug(e.target.value.replace(/\s/g, ""))} placeholder="GruposWpp"
              className="w-full min-w-0 bg-transparent py-2 pr-3 outline-none" />
          </div>
        </label>
        <label className={rotulo}>
          Nome (só para você se achar)
          <input name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Convite Semana do Investidor — grupos anteriores" className={campo} />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {varios ? "Destinos — o tráfego é dividido pela porcentagem" : "Destino"}
          </span>
          {varios && (
            <span className={`text-xs font-medium ${somaOk ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              Total: {soma}% {somaOk ? "✓" : "(precisa ser 100%)"}
            </span>
          )}
        </div>
        {linhas.map((l, i) => (
          <div key={l.chave} className="flex items-center gap-2">
            {varios && <span className="w-16 shrink-0 text-xs text-zinc-500">Opção {i + 1}</span>}
            <input value={l.url} onChange={(e) => mudar(l.chave, "url", e.target.value)} required placeholder="https://…"
              aria-label={`Destino ${i + 1}`} className={`${campo} min-w-0 flex-1`} />
            {varios && (
              <>
                <div className="flex w-24 shrink-0 items-center rounded-lg border border-zinc-300 bg-white pr-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
                  <input value={l.peso} onChange={(e) => mudar(l.chave, "peso", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric"
                    aria-label={`Porcentagem do destino ${i + 1}`} className="w-full min-w-0 bg-transparent py-2 pl-3 text-right outline-none" />
                  <span className="text-zinc-400">%</span>
                </div>
                <button type="button" onClick={() => remover(l.chave)} className={botaoLeve} aria-label={`Remover destino ${i + 1}`}>✕</button>
              </>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={adicionar} disabled={linhas.length >= 20} className={botaoLeve}>+ Adicionar destino (dividir tráfego)</button>
          {varios && <button type="button" onClick={() => setLinhas(igualar)} className={botaoLeve}>Dividir igual</button>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="repassar" defaultChecked={link?.repassar_parametros ?? true} className="h-4 w-4" />
        Repassar parâmetros do link curto para o destino (ex.: ?utm_content=12)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pendente || !somaOk} className={botao}>{pendente ? "Salvando…" : link ? "Salvar alterações" : "Criar link"}</button>
        {link && aoTerminar && <button type="button" onClick={aoTerminar} className={botaoLeve}>Cancelar</button>}
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

export type ItemLink = {
  link: { id: number; slug: string; titulo: string | null; ativo: boolean; repassar_parametros: boolean; cliques: number; origem: string };
  destinos: { id: number; url: string; peso: number; ordem: number; cliques: number; cliques_7d: number }[];
  cliques_24h: number;
  cliques_7d: number;
  ultimo_clique: string | null;
};

const encurtar = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
const td = "px-4 py-2 align-top";

/** Uma linha da tabela: link, destinos, cliques e ações; "Editar" abre o formulário numa linha inteira logo abaixo. */
export function LinhaLink({ dominio, item }: { dominio: string; item: ItemLink }) {
  const [estado, acao, pendente] = useActionState(acaoLink, undefined);
  const [editando, setEditando] = useState(false);
  const { link: l, destinos, cliques_24h, cliques_7d, ultimo_clique } = item;
  const varios = destinos.filter((d) => d.peso > 0).length > 1;
  const editavel: LinkEditavel = { id: l.id, slug: l.slug, titulo: l.titulo, repassar_parametros: l.repassar_parametros, destinos };
  return (
    <>
      <tr className={l.ativo ? "" : "opacity-60"}>
        <td className={`${td} max-w-[260px]`}>
          <CopiarCurto url={`https://${dominio}/${l.slug}`} />
          {l.titulo && <div className="truncate text-xs text-zinc-500" title={l.titulo}>{l.titulo}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            {!l.ativo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-300">Pausado</span>}
            {varios && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">Divide tráfego</span>}
            {l.origem === "rebrandly" && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">do Rebrandly</span>}
          </div>
        </td>
        <td className={`${td} max-w-[420px]`}>
          <ul className="space-y-1.5">
            {destinos.map((d, i) => (
              <li key={d.id} className="text-xs">
                <div className="flex items-baseline gap-2">
                  {varios && <span className="tabular w-10 shrink-0 font-semibold">{d.peso}%</span>}
                  <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-zinc-700 hover:underline dark:text-zinc-300" title={d.url}>
                    {varios ? `Opção ${i + 1} · ` : ""}{encurtar(d.url)}
                  </a>
                </div>
                {varios && (
                  <div className="tabular ml-12 text-zinc-500">
                    {numero(d.cliques)} cliques{l.cliques ? ` (${Math.round((d.cliques / l.cliques) * 100)}% do total)` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </td>
        <td className={`${td} tabular whitespace-nowrap text-xs`}>
          <div className="text-base font-semibold">{numero(l.cliques)}</div>
          <div className="text-zinc-500">{numero(cliques_24h)} em 24h · {numero(cliques_7d)} em 7d</div>
          {ultimo_clique && <div className="text-zinc-400">último: {dataHora(ultimo_clique)}</div>}
        </td>
        <td className={td}>
          <form action={acao} className="flex flex-wrap gap-1"
            onSubmit={(e) => {
              const op = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
              if (op === "excluir" && !confirm(`Excluir ${dominio}/${l.slug}? Quem clicar nele vai ver "enlace no disponible".`)) e.preventDefault();
            }}>
            <input type="hidden" name="id" value={l.id} />
            <button type="button" onClick={() => setEditando(!editando)} className={botaoLeve}>{editando ? "Fechar" : "Editar"}</button>
            <button name="op" value={l.ativo ? "pausar" : "ativar"} disabled={pendente} className={botaoLeve}>{l.ativo ? "Pausar" : "Ativar"}</button>
            <button name="op" value="excluir" disabled={pendente} className={`${botaoLeve} text-rose-700 dark:text-rose-400`}>Excluir</button>
          </form>
          <div className="mt-1"><Mensagem estado={estado} /></div>
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={4} className="bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
            <FormLink dominio={dominio} link={editavel} aoTerminar={() => setEditando(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

export function CopiarCurto({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" title="Copiar" className="group flex min-w-0 items-center gap-1.5 text-left"
      onClick={() => navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); })}>
      <span className="truncate font-medium text-emerald-700 group-hover:underline dark:text-emerald-400">{url.replace(/^https:\/\//, "")}</span>
      <span className="shrink-0 text-xs text-zinc-400">{copiado ? "copiado ✓" : "copiar"}</span>
    </button>
  );
}

export function FormImportar({ dominio }: { dominio: string }) {
  const [estado, acao, pendente] = useActionState(importarRebrandly, undefined);
  return (
    <form action={acao} className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Traz todos os links de <strong>{dominio}</strong> que estão no Rebrandly (final do link + destino). Os que já existem aqui são pulados.
        A chave é usada só nesta importação e não fica guardada.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>
          Chave da API do Rebrandly (Account → API keys)
          <input name="apikey" type="password" autoComplete="off" required className={campo} />
        </label>
        <label className={rotulo}>
          Workspace (só se a conta tiver mais de um)
          <input name="workspace" autoComplete="off" placeholder="opcional" className={campo} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pendente} className={botao}>{pendente ? "Importando…" : "Importar do Rebrandly"}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}
