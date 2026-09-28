import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // compara mesmo assim para não vazar tempo pelo tamanho
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Token via ?token=, header x-api-token ou Authorization: Bearer. */
export function tokenDaRequisicao(req: Request): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const h = req.headers.get("x-api-token");
  if (h) return h;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export function tokenValido(req: Request, esperado: string): boolean {
  const t = tokenDaRequisicao(req);
  return !!t && iguaisSeguro(t, esperado);
}

export function assinar(valor: string, segredo: string): string {
  return createHmac("sha256", segredo).update(valor).digest("base64url");
}
