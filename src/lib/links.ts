/**
 * Encurtador de links — funções puras (sem banco), para poderem ser testadas.
 */

export const SLUG_VALIDO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

/** Domínio dos links curtos (sem https://). */
export function dominioLinks(): string {
  return (process.env.LINKS_DOMINIO || "link.traderdelite.net").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export type DestinoForm = { id?: number; url: string; peso: number };

/** Lê e limpa a lista de destinos que vem do formulário (JSON). */
export function lerDestinos(json: string): DestinoForm[] | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(bruto)) return null;
  return bruto
    .map((d) => {
      const o = (d ?? {}) as Record<string, unknown>;
      const id = Number(o.id);
      return {
        ...(Number.isInteger(id) && id > 0 ? { id } : {}),
        url: String(o.url ?? "").trim(),
        peso: Math.round(Number(o.peso ?? 0)),
      };
    })
    .filter((d) => d.url !== "");
}

/** Divide 100% em partes iguais (a sobra vai para os primeiros): 3 → [34, 33, 33]. */
export function dividirIgual(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const sobra = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < sobra ? 1 : 0));
}

/**
 * Endereço final: o destino + os parâmetros que vieram no link curto
 * (ex.: link.traderdelite.net/GruposWpp?utm_content=12). Se o destino já
 * tiver o mesmo parâmetro, vale o do destino.
 */
export function montarDestino(destino: string, entrada: URLSearchParams, repassar: boolean): string {
  if (!repassar || [...entrada.keys()].length === 0) return destino;
  let u: URL;
  try {
    u = new URL(destino);
  } catch {
    return destino;
  }
  for (const [k, v] of entrada) if (!u.searchParams.has(k)) u.searchParams.append(k, v);
  return u.toString();
}

export type ItemImportacao = { slug: string; url: string; titulo: string | null; rebrandly_id: string | null };

/** Resposta de GET https://api.rebrandly.com/v1/links → itens para importar (só os do domínio informado). */
export function lerRebrandly(resposta: unknown, dominio: string): ItemImportacao[] {
  if (!Array.isArray(resposta)) return [];
  const alvo = dominio.toLowerCase();
  const itens: ItemImportacao[] = [];
  for (const r of resposta) {
    const o = (r ?? {}) as Record<string, unknown>;
    const dom = String(((o.domain ?? {}) as Record<string, unknown>).fullName ?? o.domainName ?? "").toLowerCase();
    if (dom && dom !== alvo) continue;
    const slug = String(o.slashtag ?? "").trim();
    const url = String(o.destination ?? "").trim();
    if (!slug || !url) continue;
    itens.push({ slug, url, titulo: o.title ? String(o.title).slice(0, 200) : null, rebrandly_id: o.id ? String(o.id) : null });
  }
  return itens;
}

/** Página HTML curta para link inexistente/pausado. */
export function paginaLinkNaoEncontrado(): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Enlace no disponible</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font-family:system-ui,sans-serif;text-align:center;padding:24px}p{color:#a1a1aa}</style></head>
<body><main><h1>Este enlace no está disponible</h1><p>Revisá que esté bien escrito o pedí uno nuevo a quien te lo envió.</p></main></body></html>`;
}
