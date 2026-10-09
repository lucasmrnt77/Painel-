import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarSaude, mensagemSaude, type EventoQualidade, type RespostaSaude } from "../src/lib/meta-saude-regras";

const ev = (evento: string, nav: number | null, srv: number | null, cob: number | null = 90): EventoQualidade => ({
  evento, emq: 7, cobertura: cob, cobertura_meta: 75, frequencia: "real_time",
  dedup: nav == null && srv == null ? [] : [{ chave: "event_id", navegador: nav, servidor: srv, cobertura_navegador: null }],
});
const resp = (eventos: EventoQualidade[], volumeOk = true): RespostaSaude => ({
  ok: true, pixel: "1", consultado_em: "x",
  qualidade: { ok: true, eventos },
  volume_24h: volumeOk ? { ok: true, eventos: [] } : { ok: false, erro: "sem permissão" },
});

test("saúde: tudo certo", () => {
  assert.deepEqual(avaliarSaude(resp([ev("Lead Qualificado", 99, 100), ev("PageView", 0, 0)])).problemas, []);
});

test("saúde: event_id baixo no navegador ou servidor é problema", () => {
  const r = avaliarSaude(resp([ev("Lead General", 30, 100), ev("Lead", 95, 50)]));
  assert.equal(r.problemas.length, 2);
  assert.match(r.problemas[0], /Lead General: só 30% .*navegador/);
  assert.match(r.problemas[1], /Lead: só 50% .*servidor/);
});

test("saúde: eventos fora da lista não geram problema; cobertura baixa é só aviso", () => {
  const r = avaliarSaude(resp([ev("PageView", 0, 0), ev("Lead Qualificado", 99, 99, 40)], false));
  assert.deepEqual(r.problemas, []);
  assert.ok(r.avisos.some((a) => /cobertura .*40%/.test(a)));
  assert.ok(r.avisos.some((a) => /Volume/.test(a)));
});

test("saúde: falha na consulta é problema", () => {
  assert.match(avaliarSaude(null, "TESTES_TOKEN não configurado").problemas[0], /Não consegui consultar a Meta: TESTES_TOKEN/);
  assert.match(avaliarSaude({ ok: false, erro: "token inválido" }).problemas[0], /token inválido/);
  const q = avaliarSaude({ ok: true, pixel: "1", consultado_em: "x", qualidade: { ok: false, erro: "(#200) Permissions error" }, volume_24h: { ok: true, eventos: [] } });
  assert.match(q.problemas[0], /recusou .*Permissions/);
});

test("saúde: sem dados de dedup vira aviso", () => {
  const r = avaliarSaude(resp([ev("Lead Qualificado", null, null)]));
  assert.deepEqual(r.problemas, []);
  assert.match(r.avisos[0], /não informou/);
});

test("saúde: mensagem", () => {
  assert.match(mensagemSaude(["a", "b"]), /Problema nos eventos da Meta[\s\S]*• a\n• b/);
});
