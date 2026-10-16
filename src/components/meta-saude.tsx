"use client";

import { useActionState } from "react";
import { atualizarSaudeAgora } from "@/lib/acoes-meta";
import { useT } from "@/lib/i18n/cliente";

const botao = "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export function BotaoAtualizarSaude() {
  const [estado, acao, pendente] = useActionState(atualizarSaudeAgora, undefined);
  const t = useT();
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <button disabled={pendente} className={botao}>{pendente ? t("Consultando a Meta…") : t("Atualizar agora")}</button>
      {estado?.ok && <span className="text-sm text-emerald-400">{estado.ok}</span>}
      {estado?.erro && <span className="text-sm text-rose-400">{estado.erro}</span>}
    </form>
  );
}
