import "server-only";

const LIMITE_BYTES = 256 * 1024;

/** Lê JSON, x-www-form-urlencoded ou multipart. Nunca lança: devolve {_bruto} se não conseguir. */
export async function lerCorpo(req: Request): Promise<unknown> {
  const tamanho = Number(req.headers.get("content-length") ?? "0");
  if (tamanho > LIMITE_BYTES) throw new CorpoGrandeDemais();
  const tipo = (req.headers.get("content-type") ?? "").toLowerCase();

  if (tipo.includes("multipart/form-data") || tipo.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    const obj: Record<string, string> = {};
    fd.forEach((v, k) => {
      if (typeof v === "string") obj[k] = v;
    });
    return obj;
  }

  const texto = await req.text();
  if (texto.length > LIMITE_BYTES) throw new CorpoGrandeDemais();
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto);
  } catch {
    // Pode ser urlencoded sem content-type correto
    if (/^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(texto.trim())) {
      return Object.fromEntries(new URLSearchParams(texto));
    }
    return { _bruto: texto };
  }
}

export class CorpoGrandeDemais extends Error {
  constructor() {
    super("corpo grande demais");
  }
}
