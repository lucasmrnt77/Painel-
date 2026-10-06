/**
 * Normaliza um valor vindo do WhatsApp/Sendflow para só dígitos.
 * Aceita "5511999999999", "+55 11 99999-9999", "5511999999999@s.whatsapp.net",
 * "5511999999999:12@s.whatsapp.net". Rejeita ids de grupo (@g.us), LIDs (@lid)
 * e broadcast — não são telefones.
 */
export function normalizarTelefone(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) valor = String(Math.trunc(valor));
  if (typeof valor !== "string") return null;
  let v = valor.trim().toLowerCase();
  if (!v) return null;
  if (/@(g\.us|lid|broadcast|newsletter)\b/.test(v)) return null;
  v = v.replace(/@.*$/, "").replace(/:\d+$/, "");
  // Não pode ter letras (evita pegar ids alfanuméricos)
  if (/[a-z]/.test(v)) return null;
  const digitos = v.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;
  return digitos;
}

/** Mesma regra do banco (public.telefone_chave): últimos 8 dígitos. */
export function chaveTelefone(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : null;
}

/**
 * Proteção do lado do painel para números da Argentina que chegam sem o 9
 * (regra de lib/normalizar.ts: 549 + número nacional, sem o 0 de tronco).
 * Só mexe em quem começa com 54 e não com 549; o resto volta como veio.
 */
export function corrigirArgentina(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const d = String(valor).replace(/\D/g, "");
  if (!d.startsWith("54") || d.startsWith("549") || d.length < 11 || d.length > 14) return valor;
  let nacional = d.slice(2).replace(/^0+/, "");
  if (nacional.startsWith("9")) nacional = nacional.slice(1);
  nacional = nacional.replace(/^0+/, "");
  return nacional ? "549" + nacional : valor;
}
