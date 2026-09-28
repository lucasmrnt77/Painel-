"use client";

import { useActionState } from "react";
import { entrar, importarMembros, salvarLancamento, type EstadoForm } from "@/lib/acoes";

const campo = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";
const botao = "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (!estado) return null;
  if (estado.erro) return <p className="text-sm text-rose-600 dark:text-rose-400">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{estado.ok}</p>;
  return null;
}

export function FormLogin() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="space-y-3">
      <input type="password" name="senha" placeholder="Senha do painel" autoFocus required className={campo} />
      <button disabled={pendente} className={`${botao} w-full`}>{pendente ? "Entrando…" : "Entrar"}</button>
      <Mensagem estado={estado} />
    </form>
  );
}

type Lanc = { lancamento_id: number; slug: string; nome: string; link_grupo: string | null; sendflow_ref: string | null; minutos_reenvio: number };

export function FormLancamento({ lancamento }: { lancamento?: Lanc }) {
  const [estado, acao, pendente] = useActionState(salvarLancamento, undefined);
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-2">
      {lancamento && <input type="hidden" name="id" value={lancamento.lancamento_id} />}
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Nome
        <input name="nome" required defaultValue={lancamento?.nome} placeholder="Expert Trader — Outubro" className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Slug (usado na URL da captura)
        <input name="slug" required defaultValue={lancamento?.slug} placeholder="out-2026" className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Link do grupo (reenvio)
        <input name="link_grupo" defaultValue={lancamento?.link_grupo ?? ""} placeholder="https://chat.whatsapp.com/…" className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Referência no Sendflow (id da campanha ou início do nome dos grupos)
        <input name="sendflow_ref" defaultValue={lancamento?.sendflow_ref ?? ""} placeholder="Expert Trader Out" className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Minutos até considerar &quot;fora do grupo&quot;
        <input name="minutos_reenvio" type="number" min={1} max={1440} defaultValue={lancamento?.minutos_reenvio ?? 10} className={campo} />
      </label>
      <div className="flex items-end gap-3">
        <button disabled={pendente} className={botao}>{pendente ? "Salvando…" : lancamento ? "Salvar alterações" : "Criar lançamento"}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

export function FormImportar({ lancamentoId }: { lancamentoId: number }) {
  const [estado, acao, pendente] = useActionState(importarMembros, undefined);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="lancamento_id" value={lancamentoId} />
      <p className="text-xs text-zinc-500">
        Para carregar quem já estava no grupo antes do webhook ser ligado. Um número por linha (pode colar CSV — pega o primeiro telefone de cada linha).
      </p>
      <input name="grupo_nome" placeholder="Nome do grupo (opcional)" className={campo} />
      <textarea name="numeros" rows={5} required placeholder={"59899123456\n5491112345678"} className={`${campo} font-mono`} />
      <div className="flex items-center gap-3">
        <button disabled={pendente} className={botao}>{pendente ? "Importando…" : "Importar números"}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}
