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
