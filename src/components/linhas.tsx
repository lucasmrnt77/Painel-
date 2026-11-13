"use client";

import { useActionState, useState } from "react";
import { excluirLinha, registrarRecarga, salvarLinha } from "@/lib/acoes-linhas";
import { diasAte, situacaoRecarga, type Linha, type SituacaoRecarga } from "@/lib/linhas";
import type { EstadoForm } from "@/lib/acoes";
import { useT } from "@/lib/i18n/cliente";

const campo = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";
const botao = "rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const botaoLeve = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";
const rotulo = "space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";
const td = "px-4 py-2 align-top";
const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (!estado) return null;
  if (estado.erro) return <p className="text-xs text-rose-600 dark:text-rose-400">{estado.erro}</p>;
  if (estado.ok) return <p className="text-xs text-emerald-700 dark:text-emerald-400">{estado.ok}</p>;
  return null;
}

const COR: Record<SituacaoRecarga, string> = {
  vencida: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  breve: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  sem_data: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  perdida: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function SeloRecarga({ linha, hoje }: { linha: Linha; hoje: string }) {
  const t = useT();
  const s = situacaoRecarga(linha, hoje);
  const d = linha.proxima_recarga ? diasAte(linha.proxima_recarga, hoje) : 0;
  const texto =
    s === "vencida" ? t("Vencida há {n} dia(s)", { n: -d })
    : s === "breve" ? (d === 0 ? t("Vence hoje") : t("Vence em {n} dia(s)", { n: d }))
    : s === "ok" ? t("Em dia")
    : s === "sem_data" ? t("Sem data")
    : t("Perdida");
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR[s]}`}>{texto}</span>;
}

/** Formulário de criar/editar uma linha. */
export function FormLinha({ linha, aoTerminar }: { linha?: Linha; aoTerminar?: () => void }) {
  const t = useT();
  const [estado, acao, pendente] = useActionState(async (a: EstadoForm, fd: FormData) => {
    const r = await salvarLinha(a, fd);
    if (r?.ok) aoTerminar?.();
    return r;
  }, undefined);
  return (
    <form action={acao} className="space-y-3">
      {linha && <input type="hidden" name="id" value={linha.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>{t("Linha")}<input name="linha" required defaultValue={linha?.linha ?? ""} placeholder="+598 92 000 000" className={campo} /></label>
        <label className={rotulo}>{t("Celular")}<input name="celular" defaultValue={linha?.celular ?? ""} className={campo} /></label>
        <label className={rotulo}>{t("WhatsApp")}<input name="whatsapp" defaultValue={linha?.whatsapp ?? ""} className={campo} /></label>
      </div>
      <label className={`${rotulo} block`}>{t("Descrição")}<input name="descricao" defaultValue={linha?.descricao ?? ""} className={campo} /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>{t("PIN")}<input name="pin" defaultValue={linha?.pin ?? ""} className={campo} /></label>
        <label className={rotulo}>{t("PUK")}<input name="puk" defaultValue={linha?.puk ?? ""} className={campo} /></label>
        <label className={rotulo}>{t("Chip")}<input name="chip" defaultValue={linha?.chip ?? ""} className={campo} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>{t("Estado")}
          <select name="estado" defaultValue={linha?.estado ?? "ativa"} className={campo}>
            <option value="ativa">{t("Ativa")}</option>
            <option value="perdida">{t("Perdida")}</option>
          </select>
        </label>
        <label className={rotulo}>{t("Última recarga")}<input type="date" name="ultima_recarga" defaultValue={linha?.ultima_recarga ?? ""} className={campo} /></label>
        <label className={rotulo}>{t("Próxima recarga (vazio = última + 6 meses)")}<input type="date" name="proxima_recarga" defaultValue={linha?.proxima_recarga ?? ""} className={campo} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pendente} className={botao}>{pendente ? t("Salvando…") : linha ? t("Salvar") : t("Adicionar linha")}</button>
        {linha && aoTerminar && <button type="button" onClick={aoTerminar} className={botaoLeve}>{t("Cancelar")}</button>}
        <Mensagem estado={estado} />
      </div>
    </form>
  );
}

/** Linha da tabela: situação da recarga, botão "Recarga feita", PIN/PUK escondidos, editar e excluir. */
export function LinhaTabela({ linha, hoje }: { linha: Linha; hoje: string }) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [ver, setVer] = useState(false);
  const [estRec, acaoRec, pendRec] = useActionState(registrarRecarga, undefined);
  const [estExc, acaoExc, pendExc] = useActionState(excluirLinha, undefined);
  if (editando) {
    return (
      <tr><td colSpan={7} className="px-4 py-3"><FormLinha linha={linha} aoTerminar={() => setEditando(false)} /></td></tr>
    );
  }
  return (
    <tr className={linha.estado === "perdida" ? "opacity-60" : ""}>
      <td className={`${td} whitespace-nowrap font-medium`}>{linha.linha}{linha.chip && <span className="block text-[11px] font-normal text-zinc-400">{t("Chip")} {linha.chip}</span>}</td>
      <td className={td}>{linha.celular ?? "—"}<span className="block text-[11px] text-zinc-400">WhatsApp: {linha.whatsapp ?? "—"}</span></td>
      <td className={`${td} max-w-xs text-xs text-zinc-600 dark:text-zinc-400`}>{linha.descricao ?? "—"}</td>
      <td className={`${td} whitespace-nowrap text-xs`}>
        {linha.pin || linha.puk ? (ver
          ? <span className="tabular">PIN {linha.pin ?? "—"} · PUK {linha.puk ?? "—"}</span>
          : <button type="button" onClick={() => setVer(true)} className={botaoLeve}>{t("Mostrar")}</button>) : "—"}
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <span className="tabular">{dataBR(linha.proxima_recarga)}</span>
        <span className="block text-[11px] text-zinc-400">{t("Última")}: {dataBR(linha.ultima_recarga)}</span>
      </td>
      <td className={td}><SeloRecarga linha={linha} hoje={hoje} /></td>
      <td className={`${td} whitespace-nowrap`}>
        <div className="flex flex-wrap gap-1.5">
          {linha.estado === "ativa" && (
            <form action={acaoRec}><input type="hidden" name="id" value={linha.id} />
              <button disabled={pendRec} className={botaoLeve}>{t("Recarga feita")}</button></form>
          )}
          <button type="button" onClick={() => setEditando(true)} className={botaoLeve}>{t("Editar")}</button>
          <form action={acaoExc} onSubmit={(e) => { if (!confirm(t("Excluir a linha {l}?", { l: linha.linha }))) e.preventDefault(); }}>
            <input type="hidden" name="id" value={linha.id} />
            <button disabled={pendExc} className={`${botaoLeve} text-rose-600`}>{t("Excluir")}</button>
          </form>
        </div>
        <Mensagem estado={estRec ?? estExc} />
      </td>
    </tr>
  );
}
