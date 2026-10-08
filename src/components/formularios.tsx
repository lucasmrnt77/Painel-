"use client";

import { useActionState } from "react";
import { entrar, importarMembros, salvarLancamento, testarAlerta, type EstadoForm, salvarAlertas } from "@/lib/acoes";

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

type Lanc = {
  lancamento_id: number; slug: string; nome: string; link_grupo: string | null; sendflow_ref: string | null; minutos_reenvio: number;
  alerta_minutos_sem_entrada?: number; resumo_minutos?: number; alerta_telefones?: string[];
};

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
      <div className="sm:col-span-2 mt-2 border-t border-zinc-200 pt-3 text-xs font-semibold text-zinc-500 dark:border-zinc-800">Monitor de tráfego</div>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Alertar após quantos minutos sem ninguém entrar
        <input name="alerta_minutos_sem_entrada" type="number" min={5} max={2880} defaultValue={lancamento?.alerta_minutos_sem_entrada ?? 20} className={campo} />
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Resumo periódico
        <select name="resumo_minutos" defaultValue={String(lancamento?.resumo_minutos ?? 60)} className={campo}>
          <option value="0">Desligado</option>
          <option value="30">A cada 30 min</option>
          <option value="60">De hora em hora</option>
          <option value="120">A cada 2 horas</option>
          <option value="240">A cada 4 horas</option>
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
        WhatsApp que recebem os alertas (com DDI, um por linha)
        <textarea name="alerta_telefones" rows={3} defaultValue={(lancamento?.alerta_telefones ?? []).join("\n")} placeholder={"5511999999999\n59899123456"} className={`${campo} font-mono`} />
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

export function FormTesteAlerta({ lancamentoId }: { lancamentoId: number }) {
  const [estado, acao, pendente] = useActionState(testarAlerta, undefined);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={lancamentoId} />
      <button disabled={pendente} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
        {pendente ? "Enviando…" : "Enviar alerta de teste"}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

const PRAZOS = [
  [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hora"], [90, "1 h 30 min"], [120, "2 horas"],
  [180, "3 horas"], [240, "4 horas"], [360, "6 horas"], [480, "8 horas"], [720, "12 horas"], [1440, "24 horas"], [2880, "48 horas"],
] as const;
const RESUMOS = [
  [0, "Desligado"], [30, "A cada 30 min"], [60, "De hora em hora"], [120, "A cada 2 horas"], [240, "A cada 4 horas"],
  [360, "A cada 6 horas"], [720, "A cada 12 horas"], [1440, "Uma vez por dia"],
] as const;

/** Configuração dos alertas de um monitor (aba Alertas). Com `referencia`, mostra o campo da campanha do Sendflow. */
export function FormAlertas({ id, alertaMinutos, resumoMinutos, telefones, referencia }: {
  id: number; alertaMinutos: number; resumoMinutos: number; telefones: string[]; referencia?: { valor: string | null };
}) {
  const [estado, acao, pendente] = useActionState(salvarAlertas, undefined);
  const prazos = PRAZOS.some(([v]) => v === alertaMinutos) ? PRAZOS : [...PRAZOS, [alertaMinutos, `${alertaMinutos} min`] as const];
  return (
    <form action={acao} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Alertar quando ninguém entrar no grupo por
        <select name="alerta_minutos_sem_entrada" defaultValue={String(alertaMinutos)} className={campo}>
          {prazos.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Resumo periódico de entradas
        <select name="resumo_minutos" defaultValue={String(resumoMinutos)} className={campo}>
          {RESUMOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </label>
      {referencia && (
        <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
          Nome da campanha do grupo no Sendflow (exatamente como aparece lá)
          <input name="sendflow_ref" defaultValue={referencia.valor ?? ""} placeholder="ex.: Grupo Gratuito - Oficial" className={campo} />
        </label>
      )}
      <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:col-span-2">
        WhatsApp que recebem os alertas (com DDI, um por linha)
        <textarea name="alerta_telefones" rows={2} defaultValue={telefones.join("\n")} placeholder={"5511999999999\n59899123456"} className={`${campo} font-mono`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={pendente} className={botao}>{pendente ? "Salvando…" : "Salvar alertas"}</button>
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}
