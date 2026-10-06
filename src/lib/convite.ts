/**
 * Verificação de convite de grupo do WhatsApp (chat.whatsapp.com/<código>).
 *
 * Como funciona (conferido na página real em 06/10/2026):
 * - convite válido: a página traz og:title com o NOME do grupo (e a foto do grupo);
 * - convite redefinido/inexistente: a página carrega normal, mas SEM og:title;
 * - bloqueio/captcha/erro de rede: não dá para concluir → "inconclusivo"
 *   (nunca tiramos um grupo da fila por causa disso).
 */

export type ResultadoConvite = { resultado: "valido" | "invalido" | "inconclusivo"; titulo: string | null; detalhe: string };

const GENERICOS = [
  "whatsapp group invite", "invitación a grupo de whatsapp", "convite para grupo do whatsapp", "whatsapp",
  "join chat", "entrar na conversa", "unirse al chat", "chat on whatsapp", "download whatsapp", "whatsapp web",
];

/** Extrai o código de um link do WhatsApp (ou aceita o código puro). */
export function extrairCodigo(entrada: string | null | undefined): string | null {
  const s = (entrada ?? "").trim()
  if (!s) return null
  const m = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]{10,40})/i)
  if (m) return m[1]
  return /^[A-Za-z0-9]{10,40}$/.test(s) ? s : null
}

function decodificar(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .trim()
}

function metaOg(html: string, prop: string): string | null {
  const a = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"))
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${prop}["']`, "i"))
  const v = a?.[1] ?? b?.[1]
  return v === undefined ? null : decodificar(v)
}

/** Classifica o HTML da página de convite (puro — testável). */
export function classificarPagina(html: string, status: number): ResultadoConvite {
  if (status === 404 || status === 410) return { resultado: "invalido", titulo: null, detalhe: `HTTP ${status}` }
  if (status === 429 || status === 403 || status >= 500 || status === 0) return { resultado: "inconclusivo", titulo: null, detalhe: `HTTP ${status}` }
  if (!html || html.length < 2000) return { resultado: "inconclusivo", titulo: null, detalhe: "página vazia ou curta" }
  const baixo = html.toLowerCase()
  if (baixo.includes("consent.whatsapp.com") || baixo.includes('id="captcha"') || baixo.includes("challenge validation")) {
    return { resultado: "inconclusivo", titulo: null, detalhe: "bloqueio/consentimento" }
  }
  const og = metaOg(html, "og:title")
  if (og && !GENERICOS.includes(og.toLowerCase())) return { resultado: "valido", titulo: og.slice(0, 200), detalhe: "og:title com nome do grupo" }
  // Página real do WhatsApp carregada sem nome de grupo = convite redefinido/inexistente
  const paginaDoWhatsapp = baixo.includes("whatsapp") && (baixo.includes("static.whatsapp.net") || baixo.includes("_9vd5") || baixo.includes("action-button"))
  if (paginaDoWhatsapp) return { resultado: "invalido", titulo: null, detalhe: "página carregou sem nome de grupo" }
  return { resultado: "inconclusivo", titulo: null, detalhe: "formato de página desconhecido" }
}

const PERFIS: Record<string, string>[] = [
  {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "es-419,es;q=0.9,pt-BR;q=0.8,en;q=0.7",
  },
  {
    "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    accept: "text/html,*/*;q=0.8",
    "accept-language": "es-419,es;q=0.9",
  },
]

async function buscar(codigo: string, perfil: Record<string, string>): Promise<ResultadoConvite> {
  try {
    const r = await fetch(`https://chat.whatsapp.com/${codigo}`, {
      headers: perfil, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000),
    })
    return classificarPagina(await r.text(), r.status)
  } catch (e) {
    return { resultado: "inconclusivo", titulo: null, detalhe: `rede: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Confere o convite. "inválido" só com DUAS leituras inválidas seguidas (com perfis diferentes);
 * qualquer dúvida vira "inconclusivo" e o grupo continua na fila.
 */
export async function verificarConvite(codigo: string): Promise<ResultadoConvite> {
  const primeira = await buscar(codigo, PERFIS[0])
  if (primeira.resultado === "valido") return primeira
  await new Promise((r) => setTimeout(r, 1200))
  const segunda = await buscar(codigo, PERFIS[1])
  if (segunda.resultado === "valido") return segunda
  if (primeira.resultado === "invalido" && segunda.resultado === "invalido") return { ...segunda, detalhe: `confirmado 2x: ${segunda.detalhe}` }
  return { resultado: "inconclusivo", titulo: null, detalhe: `${primeira.detalhe} / ${segunda.detalhe}` }
}

/** Visitas que não são pessoas (prévias de link, robôs): redirecionam, mas não contam. */
export function ehRobo(userAgent: string | null): boolean {
  const ua = userAgent ?? ""
  if (!ua) return true
  return /bot|crawl|spider|facebookexternalhit|facebookcatalog|whatsapp\/|telegram|slack|discord|preview|curl|wget|python|axios|node-fetch|headless|lighthouse|vercel/i.test(ua)
}
