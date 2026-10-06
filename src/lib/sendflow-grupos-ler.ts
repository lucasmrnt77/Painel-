import { extrairCodigo } from "./convite"

export type GrupoSendflow = { id: string; gid: string | null; nome: string; codigo: string | null; participantes: number | null }

/** "120363...@g.us" → "120363..." */
export const gidLimpo = (v: string) => v.trim().replace(/@g\.us$/i, "") || null

function texto(o: Record<string, unknown>, chaves: string[]): string {
  for (const k of chaves) {
    const v = o[k]
    if (typeof v === "string" || typeof v === "number") return String(v)
  }
  return ""
}

/** Normaliza a resposta (lista, lista de listas ou { groups: [...] }) — puro, testável. */
export function lerGruposSendflow(dados: unknown): GrupoSendflow[] {
  let lista: unknown[] = []
  if (Array.isArray(dados)) lista = (dados as unknown[]).flat()
  else if (dados && typeof dados === "object") {
    for (const k of ["groups", "data", "items", "results"]) {
      const v = (dados as Record<string, unknown>)[k]
      if (Array.isArray(v)) { lista = (v as unknown[]).flat(); break }
    }
  }
  return lista
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => {
      const p = o.participants ?? o.participantsCount ?? o.size ?? o.membersCount
      return {
        id: texto(o, ["id", "_id", "releaseGroupId"]) || texto(o, ["groupId", "gid", "jid"]),
        gid: gidLimpo(texto(o, ["gid", "groupJid", "jid", "wid", "groupId", "whatsappId", "remoteJid"])),
        nome: texto(o, ["name", "subject", "title", "nome"]),
        codigo: extrairCodigo(texto(o, ["inviteCode", "invite_code", "inviteLink", "invite", "link", "url"])),
        participantes: Array.isArray(p) ? p.length : typeof p === "number" ? p : null,
      }
    })
    .filter((g) => g.id)
}


/** Nomes dos campos que o Sendflow devolveu (para diagnóstico no histórico). */
export function camposExemplo(dados: unknown): string[] {
  const lista = Array.isArray(dados) ? (dados as unknown[]).flat() : []
  const o = lista.find((x) => x && typeof x === "object") as Record<string, unknown> | undefined
  return o ? Object.keys(o).slice(0, 40) : []
}
