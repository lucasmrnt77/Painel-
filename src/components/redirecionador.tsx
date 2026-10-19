"use client";

import { useActionState, useState } from "react";
import { acaoGrupo, adicionarGrupos, criarFunil, importarDoSendflow, salvarFunil, trocarLink } from "@/lib/acoes-redirecionador";
import { slugDoNome } from "@/lib/redir-status";
import type { EstadoForm } from "@/lib/acoes";
import { useT } from "@/lib/i18n/cliente";

const campo = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";
const botao = "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const botaoLeve = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (!estado) return null;
  if (estado.erro) return <p className="text-sm text-rose-600 dark:text-rose-400">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{estado.ok}</p>;
  return null;
}

export function CopiarLink({ url }: { url: string }) {
  const t = useT();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 truncate rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{url}</code>
      <button
        type="button"
        className={botaoLeve}
        onClick={() => navigator.clipboard.writeText(url).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); })}
      >
        {copiado ? t("Copiado ✓") : t("Copiar")}
      </button>
    </div>
  );
}

type Funil = { slug: string; nome: string; limite_cliques: number; verificar_a_cada: number; link_reserva: string | null; sendflow_release_id: string | null; auto_redefinir: boolean };

export function FormFunil({ funil }: { funil: Funil }) {
  const [estado, acao, pendente] = useActionState(salvarFunil, undefined);
  const t = useT();
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="slug" value={funil.slug} />
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
        {t("Nome do funil")}
        <input name="nome" required minLength={2} maxLength={60} defaultValue={funil.nome} className={campo} />
      </label>
      <CamposConfig funil={funil} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pendente} className={botao}>{pendente ? t("Salvando…") : t("Salvar configuração")}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

/** Campos de configuração usados ao criar e ao editar um funil. */
function CamposConfig({ funil }: { funil?: Partial<Funil> }) {
  const t = useT();
  return (
    <>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("Cliques para considerar o grupo cheio")}
        <input name="limite_cliques" type="number" min={1} max={100000} defaultValue={funil?.limite_cliques ?? 600} className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("Verificar o convite a cada quantos cliques")}
        <input name="verificar_a_cada" type="number" min={1} max={10000} defaultValue={funil?.verificar_a_cada ?? 20} className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("ID da campanha no Sendflow (para importar grupos e pedir link novo)")}
        <input name="sendflow_release_id" defaultValue={funil?.sendflow_release_id ?? ""} placeholder={t("ex.: 6fJk2…")} className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("Link reserva (se todos os grupos acabarem)")}
        <input name="link_reserva" defaultValue={funil?.link_reserva ?? ""} placeholder={t("https://… (opcional)")} className={campo} />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="auto_redefinir" defaultChecked={funil?.auto_redefinir ?? true} className="h-4 w-4" />
        {t("Quando um convite deixar de funcionar, pedir link novo ao Sendflow automaticamente")}
      </label>
    </>
  );
}

/** Cria um funil novo. O final do link sai do nome, mas pode ser trocado antes de criar. */
export function FormNovoFunil({ dominio }: { dominio: string }) {
  const [estado, acao, pendente] = useActionState(criarFunil, undefined);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const t = useT();
  const final = slugEditado ? slug : slugDoNome(nome);
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("Nome do funil")}
        <input name="nome" required minLength={2} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("ex.: Trader Dezembro")} className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t("Final do link (não muda depois de criado)")}
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs text-zinc-500">{dominio}/</span>
          <input name="slug" required pattern="[a-z0-9-]{2,30}" value={final}
            onChange={(e) => { setSlugEditado(true); setSlug(e.target.value.toLowerCase()); }} placeholder="trader-dezembro" className={`${campo} min-w-0`} />
        </div>
      </label>
      <CamposConfig />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pendente} className={botao}>{pendente ? t("Criando…") : t("Criar funil")}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

type OpcaoFunil = { slug: string; nome: string; temCampanha: boolean };

/** Escolha do funil nos formulários da tela de grupos (só aparece quando a tela mostra todos os funis). */
function EscolherFunil({ funis, atual }: { funis: OpcaoFunil[]; atual: string | null }) {
  const t = useT();
  if (atual) return <input type="hidden" name="funil" value={atual} />;
  return (
    <label className="block space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {t("Funil")}
      <select name="funil" required defaultValue="" className={campo}>
        <option value="" disabled>{t("Escolha o funil")}</option>
        {funis.map((f) => <option key={f.slug} value={f.slug}>{f.nome}</option>)}
      </select>
    </label>
  );
}

export function FormAdicionar({ funis, atual }: { funis: OpcaoFunil[]; atual: string | null }) {
  const [estado, acao, pendente] = useActionState(adicionarGrupos, undefined);
  const t = useT();
  return (
    <form action={acao} className="space-y-2">
      <EscolherFunil funis={funis} atual={atual} />
      <textarea
        name="links"
        rows={4}
        placeholder={`${t("Um link por linha (opcional: Nome | link)")}\nhttps://chat.whatsapp.com/AbC…\nTrader #2 | https://chat.whatsapp.com/XyZ…`}
        className={`${campo} font-mono text-xs`}
      />
      <div className="flex items-center gap-3">
        <button disabled={pendente} className={botao}>{pendente ? t("Adicionando…") : t("Adicionar ao fim da fila")}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

export function FormImportar({ funis, atual }: { funis: OpcaoFunil[]; atual: string | null }) {
  const [estado, acao, pendente] = useActionState(importarDoSendflow, undefined);
  const t = useT();
  const temCampanha = atual ? !!funis.find((f) => f.slug === atual)?.temCampanha : true;
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <EscolherFunil funis={funis} atual={atual} />
      <button disabled={pendente || !temCampanha} className={botao} title={temCampanha ? "" : t("Salve o ID da campanha primeiro")}>
        {pendente ? t("Buscando no Sendflow…") : t("Importar grupos do Sendflow")}
      </button>
      {!temCampanha && <span className="text-xs text-zinc-500">{t("Salve o ID da campanha na configuração.")}</span>}
      <Mensagem estado={estado} />
    </form>
  );
}

const ACOES: Record<string, { rotulo: string; confirmar?: string }> = {
  verificar: { rotulo: "Verificar" },
  redefinir: { rotulo: "Atualizar link (Sendflow)", confirmar: "Pedir ao Sendflow para ler o link atual deste grupo no WhatsApp?" },
  pausar: { rotulo: "Pausar" },
  reativar: { rotulo: "Reativar" },
  zerar: { rotulo: "Zerar cliques", confirmar: "Zerar o contador de cliques? Se o grupo estiver cheio, ele volta para a fila." },
  subir: { rotulo: "↑" },
  descer: { rotulo: "↓" },
  remover: { rotulo: "Remover", confirmar: "Remover este grupo da lista?" },
};

export function AcoesGrupo({ id, status, temSendflow }: { id: number; status: string; temSendflow: boolean }) {
  const [estado, acao, pendente] = useActionState(acaoGrupo, undefined);
  const [trocando, setTrocando] = useState(false);
  const t = useT();
  const ops = (["subir", "descer", "verificar", status === "pausado" || status === "invalido" || status === "redefinindo" ? "reativar" : status === "cheio" ? null : "pausar", ...(temSendflow ? ["redefinir"] : []), "zerar", "remover"] as (string | null)[]).filter((o): o is string => !!o);
  return (
    <div className="space-y-1">
      <form action={acao} className="flex flex-wrap gap-1"
        onSubmit={(e) => {
          const op = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "";
          const c = ACOES[op]?.confirmar;
          if (c && !confirm(t(c))) e.preventDefault();
        }}>
        <input type="hidden" name="id" value={id} />
        {ops.map((op) => (
          <button key={op} name="op" value={op} disabled={pendente} className={botaoLeve}>{t(ACOES[op].rotulo)}</button>
        ))}
        <button type="button" className={botaoLeve} onClick={() => setTrocando(!trocando)}>{t("Trocar link")}</button>
      </form>
      {trocando && <FormTrocarLink id={id} />}
      {pendente ? <p className="text-xs text-zinc-500">{t("Processando…")}</p> : <Mensagem estado={estado} />}
    </div>
  );
}

function FormTrocarLink({ id }: { id: number }) {
  const [estado, acao, pendente] = useActionState(trocarLink, undefined);
  const t = useT();
  return (
    <form action={acao} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <input name="link" placeholder="https://chat.whatsapp.com/…" className={`${campo} py-1 text-xs`} />
      <button disabled={pendente} className={botaoLeve}>{t("Salvar")}</button>
      <Mensagem estado={estado} />
    </form>
  );
}
