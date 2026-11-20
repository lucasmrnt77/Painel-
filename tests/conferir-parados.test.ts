import { test } from "node:test"
import assert from "node:assert/strict"
import { paradosParaConferir } from "../src/lib/redir-parados"
import { redirecionadorVaiProWhatsapp } from "../src/lib/politica-alertas"
import { mensagemRedirecionador } from "../src/lib/mensagens"

const agora = Date.parse("2026-11-20T15:00:00Z")
const h = (horas: number) => new Date(agora - horas * 3600000).toISOString()

test("conferência diária: só cheios/pausados sem convite inválido e há 24 h ou mais, mais antigo primeiro", () => {
  const r = paradosParaConferir([
    { status: "cheio", verificacao: "valido", verificado_em: h(30) },
    { status: "cheio", verificacao: "valido", verificado_em: h(5) },
    { status: "pausado", verificacao: "valido", verificado_em: h(200) },
    { status: "cheio", verificacao: "invalido", verificado_em: h(300) },
    { status: "ativo", verificacao: "valido", verificado_em: h(300) },
    { status: "cheio", verificacao: null, verificado_em: null },
  ], agora)
  assert.deepEqual(r.map((g) => g.verificado_em), [null, h(200), h(30)])
})

test("alerta de grupo parado suspenso vai sempre ao WhatsApp e cita membros", () => {
  assert.equal(redirecionadorVaiProWhatsapp("parado_invalido", true), true)
  const m = mensagemRedirecionador("parado_invalido", "Geral", { grupo: "#58", estado: "cheio", membros: 587 }) ?? ""
  assert.match(m, /#58/)
  assert.match(m, /já cheio/)
  assert.match(m, /587/)
})
