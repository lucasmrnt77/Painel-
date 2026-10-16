"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lerArquivo, type Aba } from "@/lib/ler-arquivo";
import { useT } from "@/lib/i18n/cliente";

type Tipo = "leads" | "compras";

const LOTE = 2000;

/** Nomes de coluna aceitos (sem acento, minúsculo) → campo da base. */
const ALIAS: Record<string, string> = {
  edicao: "edicao", lancamento: "edicao", lanzamiento: "edicao",
  fonte: "fonte", origem: "fonte",
  data: "data", fecha: "data", "marca temporal": "data", "fecha y hora": "data",
  hora: "hora",
  telefone: "telefone", telefono: "telefone", whatsapp: "telefone", celular: "telefone", "numero de whatsapp": "telefone", wpp: "telefone",
  telefone_alt: "telefone_alt",
  pais: "pais", country: "pais",
  email: "email", correo: "email", "e-mail": "email",
  email_compra: "email_compra", "email de compra": "email_compra",
  produto: "produto", producto: "produto",
  estado: "estado", status: "estado",
  conta_compra: "conta_compra",
  valor_usd: "valor_usd", valor: "valor_usd", monto: "valor_usd",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Converte "DD/MM/AAAA[, HH:MM]" ou "AAAA-MM-DD[ HH:MM]" para "AAAA-MM-DD HH:MM:SS". */
function dataIso(v: string, hora?: string): string {
  const s = (v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let a: string, me: string, d: string, h = "0", mi = "0", se = "0";
  if (m) { [, a, me, d] = m; h = m[4] ?? "0"; mi = m[5] ?? "0"; se = m[6] ?? "0"; }
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return "";
    [, d, me, a] = m; h = m[4] ?? "0"; mi = m[5] ?? "0"; se = m[6] ?? "0";
  }
  if (hora && h === "0" && mi === "0") {
    const t = hora.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (t) { h = t[1]; mi = t[2]; se = t[3] ?? "0"; }
  }
  const p = (x: string) => x.padStart(2, "0");
  return `${a}-${p(me)}-${p(d)} ${p(h)}:${p(mi)}:${p(se)}`;
}

function converter(aba: Aba): { linhas: Record<string, string>[]; colunas: string[]; erro?: string } {
  const t = aba.tabela;
  const iCab = t.findIndex((l) => l.some((c) => ALIAS[semAcento(c)] === "telefone"));
  if (iCab < 0) return { linhas: [], colunas: [], erro: "Não achei a coluna de telefone (Telefone, Teléfono, WhatsApp...)" };
  const mapa = t[iCab].map((c) => ALIAS[semAcento(c)] ?? null);
  const linhas: Record<string, string>[] = [];
  for (const l of t.slice(iCab + 1)) {
    const r: Record<string, string> = {};
    mapa.forEach((campo, i) => { if (campo && !r[campo]) r[campo] = String(l[i] ?? "").trim(); });
    if (!r.telefone && !r.email) continue;
    if (r.telefone) r.telefone = r.telefone.replace(/\.0$/, "");
    if (r.data) r.data = dataIso(r.data, r.hora);
    delete r.hora;
    linhas.push(r);
  }
  return { linhas, colunas: [...new Set(mapa.filter(Boolean) as string[])] };
}

export function ImportadorBaseLeads({ edicoes }: { edicoes: { codigo: string; nome: string }[] }) {
  const router = useRouter();
  const t = useT();
  const [tipo, setTipo] = useState<Tipo>("leads");
  const [edicao, setEdicao] = useState("");
  const [abas, setAbas] = useState<(Aba & { incluir: boolean })[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [rodando, setRodando] = useState(false);

  async function ler(f: File) {
    setErro(""); setMsg("");
    try {
      const lidas = await lerArquivo(f);
      setAbas(lidas.map((a) => ({ ...a, incluir: !/^copia/i.test(a.nome) && converter(a).linhas.length > 0 })));
    } catch (e) {
      setErro(t(e instanceof Error ? e.message : String(e)));
    }
  }

  async function importar() {
    setErro(""); setMsg(""); setRodando(true);
    let total = 0, gravadas = 0, semEdicao = 0;
    try {
      for (const a of abas.filter((x) => x.incluir)) {
        const { linhas } = converter(a);
        for (let i = 0; i < linhas.length; i += LOTE) {
          setMsg(t("{aba}: enviando {i} de {n}...", { aba: a.nome, i: Math.min(i + LOTE, linhas.length), n: linhas.length }));
          const r = await fetch("/api/base-leads/importar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo, edicao: edicao || null, linhas: linhas.slice(i, i + LOTE) }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.erro ? t(j.erro) : t("erro {s}", { s: r.status }));
          total += j.recebidas ?? 0; gravadas += j.inseridas ?? j.gravadas ?? 0; semEdicao += j.sem_edicao ?? 0;
        }
      }
      setMsg(t("Recalculando as estatísticas..."));
      await fetch("/api/base-leads/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "atualizar", linhas: [{}] }),
      });
      setMsg(t("Pronto: {total} linhas lidas, {gravadas} gravadas", { total, gravadas }) +
        (total - gravadas - semEdicao > 0 ? t(", {n} já estavam na base", { n: total - gravadas - semEdicao }) : "") +
        (semEdicao ? t(". {n} sem lançamento (escolha um lançamento ou preencha a coluna \"edicao\")", { n: semEdicao }) : "") + ".");
      setAbas([]);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setRodando(false);
    }
  }

  const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">{t("O arquivo tem")}</span>
          <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            <option value="leads">{t("Inscritos (leads)")}</option>
            <option value="compras">{t("Compradores")}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">{t("Lançamento (se o arquivo não tiver a coluna \"edicao\")")}</span>
          <select className={campo} value={edicao} onChange={(e) => setEdicao(e.target.value)}>
            <option value="">{t("— usar a coluna do arquivo —")}</option>
            {edicoes.map((e) => <option key={e.codigo} value={e.codigo}>{e.nome} ({e.codigo})</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-zinc-500">{t("Arquivo .csv ou .xlsx")}</span>
          <input type="file" accept=".csv,.xlsx" className="text-xs" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        </label>
      </div>

      {abas.length > 0 && (
        <ul className="space-y-1">
          {abas.map((a, i) => {
            const c = converter(a);
            return (
              <li key={a.nome} className="flex flex-wrap items-center gap-2">
                <input type="checkbox" checked={a.incluir} disabled={!!c.erro}
                  onChange={(e) => setAbas((as) => as.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))} />
                <span className="font-medium">{a.nome}</span>
                <span className="text-xs text-zinc-500">
                  {c.erro ? t(c.erro) : t("{n} linhas · colunas: {c}", { n: c.linhas.length, c: c.colunas.join(", ") })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={importar}
        disabled={rodando || !abas.some((a) => a.incluir)}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {rodando ? t("Importando...") : t("Importar")}
      </button>
      {msg && <p className="text-xs text-zinc-600 dark:text-zinc-400">{msg}</p>}
      {erro && <p className="text-xs text-rose-600">{erro}</p>}
      <p className="text-xs text-zinc-500">
        {t("Colunas reconhecidas: telefone (ou WhatsApp), data, país, email, fonte, edicao. Para compradores também: produto (ET ou TPP), estado, conta_compra (sim/nao), valor_usd, email_compra. Reimportar o mesmo arquivo não duplica. O telefone é normalizado pela base (549 na Argentina, 598 no Uruguai...); o que não der para corrigir com segurança vai para a lista de revisão.")}
      </p>
    </div>
  );
}
