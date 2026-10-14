import { test } from "node:test";
import assert from "node:assert/strict";
import { monitorVaiProWhatsapp, redirecionadorVaiProWhatsapp, testesVaiProWhatsapp } from "../src/lib/politica-alertas";

test("monitor: só falta de entradas (e o teste manual) vão para o WhatsApp", () => {
  assert.equal(monitorVaiProWhatsapp("sem_entradas"), true);
  assert.equal(monitorVaiProWhatsapp("teste"), true);
  assert.equal(monitorVaiProWhatsapp("resumo"), false);
  assert.equal(monitorVaiProWhatsapp("entradas_retomadas"), false);
});

test("redirecionador: só o que precisa de ajuste", () => {
  for (const t of ["sem_grupos", "redefinicao_sem_retorno", "redefinicao_falhou"]) assert.equal(redirecionadorVaiProWhatsapp(t, true), true, t);
  assert.equal(redirecionadorVaiProWhatsapp("cheio", true), false);
  assert.equal(redirecionadorVaiProWhatsapp("cheio", false), true);
  assert.equal(redirecionadorVaiProWhatsapp("invalido", true), false);
  assert.equal(redirecionadorVaiProWhatsapp("invalido", false), true);
  assert.equal(redirecionadorVaiProWhatsapp("link_novo", false), false);
});

test("testes diários: só quando falham", () => {
  assert.equal(testesVaiProWhatsapp(false), true);
  assert.equal(testesVaiProWhatsapp(true), false);
});

test("grupo gratuito: falta de leads vai para o WhatsApp; leads retomados só no painel", async () => {
  assert.equal(monitorVaiProWhatsapp("sem_leads"), true);
  assert.equal(monitorVaiProWhatsapp("leads_retomados"), false);
  const { mensagemAlerta } = await import("../src/lib/mensagens");
  const m = mensagemAlerta("sem_leads", "OP Futuros (grupo gratuito)", {
    minutos_sem_lead: 1500, ultimo_lead_em: "2026-10-13T15:44:00Z",
  });
  assert.match(m, /OP Futuros/);
  assert.match(m, /Nenhum lead novo na página há \*1 dia 1 h\*/);
  assert.match(m, /Último lead: 13\/10/);
  const r = mensagemAlerta("leads_retomados", "OP Futuros", { retomada_em: "2026-10-14T12:00:00Z", minutos_sem_lead: 1600 });
  assert.match(r, /Leads retomados/);
});

test("planilha parada vai para o WhatsApp com a orientação", async () => {
  assert.equal(monitorVaiProWhatsapp("planilha_parada"), true);
  const { mensagemAlerta } = await import("../src/lib/mensagens");
  const m = mensagemAlerta("planilha_parada", 'Planilha "unificada"', { minutos_parada: 18, ultima_em: "2026-10-14T18:00:00Z" });
  assert.match(m, /não busca dados do painel há \*18 min\*/);
  assert.match(m, /recupera tudo/);
});
