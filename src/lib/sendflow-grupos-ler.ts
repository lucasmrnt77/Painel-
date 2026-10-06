import { extrairCodigo } from "./convite"

export type GrupoSendflow = { id: string; nome: string; codigo: string | null; participantes: number | null }

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
        id: texto(o, ["id", "_id", "groupId", "jid", "wid"]),
        nome: texto(o, ["name", "subject", "title", "nome"]),
        codigo: extrairCodigo(texto(o, ["inviteCode", "invite_code", "inviteLink", "invite", "link", "url"])),
        participantes: Array.isArray(p) ? p.length : typeof p === "number" ? p : null,
      }
    })
    .filter((g) => g.id)
}

