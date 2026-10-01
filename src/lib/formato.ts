const FUSO = "America/Montevideo";

export function dataHora(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

export function dia(v: string): string {
  const [a, m, d] = v.split("-");
  void a;
  return `${d}/${m}`;
}

export function numero(v: number | null | undefined): string {
  return v == null ? "—" : new Intl.NumberFormat("pt-BR").format(v);
}

/** Números vindos do WhatsApp sempre têm DDI; os do formulário podem não ter. */
export function telefoneBonito(v: string | null | undefined, comDdi = true): string {
  if (!v) return "—";
  return comDdi ? `+${v}` : v;
}

/** Link wa.me só quando o número parece ter DDI (não começa com 0 e tem 11+ dígitos). */
export function linkWhatsapp(v: string | null | undefined): string | null {
  if (!v || v.startsWith("0") || v.length < 11) return null;
  return `https://wa.me/${v}`;
}

export const ROTULO_STATUS: Record<string, string> = {
  no_grupo: "No grupo",
  aguardando: "Aguardando",
  fora_do_grupo: "Fora do grupo",
  saiu: "Saiu",
  telefone_invalido: "Telefone inválido",
};

export const COR_STATUS: Record<string, string> = {
  no_grupo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  aguardando: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  fora_do_grupo: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  saiu: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  telefone_invalido: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

// ---------------------------------------------------------------------
// Perfil do lead (página de captura + respostas da página de obrigado).
// Espelham normalizar_faixa_etaria / normalizar_genero do banco.
// ---------------------------------------------------------------------
export function paginaBonita(v: string | null | undefined): string {
  if (v === "trader") return "Trader";
  if (v === "nunca_operou") return "Nunca operou";
  return "—";
}

export function faixaBonita(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return "—";
  if (t.startsWith("menor") || t.endsWith("-25") || t.startsWith("18")) return "até 24";
  if (t.startsWith("mayor") || t.startsWith("+65") || t.startsWith("65")) return "65+";
  for (const f of ["25", "35", "45", "55"]) if (t.startsWith(f)) return `${f}–${Number(f) + 9}`;
  return v!.trim();
}

export function generoBonito(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return "—";
  if (["hombre", "homem", "masculino", "male", "m"].includes(t)) return "Homem";
  if (["mujer", "mulher", "femenino", "feminino", "female", "f"].includes(t)) return "Mulher";
  return "Outro";
}

/** "Sí, podría hacerlo sin problema" → "Pode investir" etc. Texto desconhecido volta como está. */
export function investimentoBonito(v: string | null | undefined): string {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return "—";
  if (t.startsWith("sí") || t.startsWith("si,") || t.startsWith("si ") || t === "si_puedo") return "Pode investir";
  if (t.includes("organizar") || t === "no_pero_podria") return "Pode se organizar";
  if (t.includes("imposible") || t === "no_imposible") return "Não pode";
  return v!.trim();
}
