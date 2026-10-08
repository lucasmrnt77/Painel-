import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairEventosSendflow, classificarTipo, tipoDaQuery } from "../src/lib/sendflow";
import { extrairCaptura, nomeDoCampo } from "../src/lib/captura";
import { normalizarTelefone, chaveTelefone } from "../src/lib/telefone";

test("normalizarTelefone", () => {
  assert.equal(normalizarTelefone("5511999999999@s.whatsapp.net"), "5511999999999");
  assert.equal(normalizarTelefone("5511999999999:12@s.whatsapp.net"), "5511999999999");
  assert.equal(normalizarTelefone("+598 99 123 456"), "59899123456");
  assert.equal(normalizarTelefone(59899123456), "59899123456");
  assert.equal(normalizarTelefone("120363025246125486@g.us"), null);
  assert.equal(normalizarTelefone("123456789012345@lid"), null);
  assert.equal(normalizarTelefone("abc123456789"), null);
  assert.equal(normalizarTelefone("1234"), null);
});

test("chaveTelefone igual à do banco", () => {
  assert.equal(chaveTelefone("099 123 456"), chaveTelefone("59899123456"));
  assert.equal(chaveTelefone("11 15 1234-5678"), chaveTelefone("5491112345678"));
  assert.equal(chaveTelefone("(11) 91234-5678"), chaveTelefone("551112345678"));
});

test("classificarTipo", () => {
  for (const t of ["member_added", "participant.join", "group-participants.add", "entrou_no_grupo", "Entrada no grupo", "add", "NEW_MEMBER"])
    assert.equal(classificarTipo(t), "entrou", t);
  for (const t of ["member_removed", "participant.leave", "remove", "saiu_do_grupo", "Saída do grupo", "left"])
    assert.equal(classificarTipo(t), "saiu", t);
  for (const t of ["message", "update", null, "address_changed"])
    assert.equal(classificarTipo(t as string | null), "desconhecido", String(t));
  assert.equal(tipoDaQuery("entrou"), "entrou");
  assert.equal(tipoDaQuery("xyz"), null);
});

test("payload simples com lead", () => {
  const ev = extrairEventosSendflow({
    event: "lead.joined_group",
    campaign: { id: "camp-123", name: "Expert Trader Set" },
    group: { id: "120363025246125486@g.us", name: "Expert Trader Set #3" },
    lead: { name: "Ana", phone: "+55 11 91234-5678", id: "lead-9" },
  });
  assert.equal(ev.length, 1);
  assert.deepEqual(ev[0], {
    tipo: "entrou",
    tipo_original: "lead.joined_group",
    telefone: "5511912345678",
    grupo_id: "120363025246125486@g.us",
    grupo_nome: "Expert Trader Set #3",
    sendflow_ref: "camp-123",
  });
});

test("estilo Evolution: vários participantes e autor ignorado", () => {
  const ev = extrairEventosSendflow({
    event: "group-participants.update",
    instance: "minha-instancia",
    data: {
      id: "120363025246125486@g.us",
      author: "5511000000000@s.whatsapp.net",
      action: "remove",
      participants: ["59899123456@s.whatsapp.net", "5491112345678@s.whatsapp.net", "999@lid"],
    },
  });
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.tipo === "saiu"));
  assert.deepEqual(ev.map((e) => e.telefone), ["59899123456", "5491112345678"]);
  assert.equal(ev[0].grupo_id, "120363025246125486@g.us");
});

test("tipo forçado pela URL e payload sem tipo", () => {
  const ev = extrairEventosSendflow({ numero: "59899123456", grupo: "Expert #1" }, "entrou");
  assert.equal(ev[0].tipo, "entrou");
  assert.equal(ev[0].telefone, "59899123456");
});

test("payload sem telefone vira um evento desconhecido", () => {
  const ev = extrairEventosSendflow({ event: "ping" });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, "desconhecido");
  assert.equal(ev[0].telefone, null);
});

test("array no topo", () => {
  const ev = extrairEventosSendflow([
    { type: "join", phone: "59899123456" },
    { type: "leave", phone: "59899777888" },
  ]);
  assert.deepEqual(ev.map((e) => [e.tipo, e.telefone]), [["entrou", "59899123456"], ["saiu", "59899777888"]]);
});

test("captura: JSON simples", () => {
  const d = extrairCaptura({ name: "Ana", email: "a@x.com", whatsapp: "099123456", utm_source: "ig" });
  assert.equal(d.nome, "Ana");
  assert.equal(d.email, "a@x.com");
  assert.equal(d.telefone, "099123456");
  assert.deepEqual(d.utm, { utm_source: "ig" });
});

test("captura: Elementor form-urlencoded e query", () => {
  const d = extrairCaptura(
    { "form[name]": "Captura", "fields[name][value]": "Beto", "fields[email][value]": "b@x.com", "fields[phone][value]": "11 1234-5678" },
    new URLSearchParams("token=zzz&lancamento=set-2026&utm_campaign=c1"),
  );
  assert.equal(d.nome, "Beto");
  assert.equal(d.telefone, "11 1234-5678");
  assert.equal(d.lancamento, "set-2026");
  assert.deepEqual(d.utm, { utm_campaign: "c1" });
});

test("captura: formato {id, value}", () => {
  const d = extrairCaptura({ fields: { a: { id: "email", value: "c@x.com" }, b: { id: "telefone", value: "099000111" } } });
  assert.equal(d.email, "c@x.com");
  assert.equal(d.telefone, "099000111");
  assert.equal(nomeDoCampo("form_fields.phone"), "phone");
});

test("captura: experiência, landing e página de obrigado", () => {
  const d = extrairCaptura({ nome: "A", telefone: "59899123456", "fields[experiencia][value]": "nunca", landing: "Trader-Uruguay", pagina_gracias: "/gracias-video-general" });
  assert.equal(d.experiencia, "nunca");
  assert.equal(d.landing, "Trader-Uruguay");
  assert.equal(d.pagina_obrigado, "/gracias-video-general");
});

test("mensagens do monitor", async () => {
  const { mensagemAlerta } = await import("../src/lib/mensagens");
  const j = { de: "2026-10-01T13:00:00Z", ate: "2026-10-01T13:21:00Z", inscricoes: 0, entradas: 0, saidas: 0, inscritos_no_grupo: 0 };
  const m1 = mensagemAlerta("sem_entradas", "ET Out", { minutos_sem_entrada: 21, ultima_entrada_em: "2026-10-01T13:00:00Z", janela: j });
  assert.match(m1, /21 min/);
  assert.match(m1, /10:00/);
  assert.match(m1, /tráfego parece parado/);
  const m2 = mensagemAlerta("sem_entradas", "ET Out", { minutos_sem_entrada: 21, ultima_entrada_em: null, janela: { ...j, inscricoes: 5 } });
  assert.match(m2, /página de obrigado/);
  const m3 = mensagemAlerta("resumo", "ET Out", { janela: { ...j, inscricoes: 50, entradas: 40, inscritos_no_grupo: 41 } });
  assert.match(m3, /82%/);
});

test("página v0 (registrar-usuario): Trader-Uruguay vira trader e o original vai para landing", () => {
  const d = extrairCaptura({
    telefono: "59899123456", tipo: "trading", accion: "crear",
    utm_source: "fb", utm_medium: null, utm_campaign: "camp", utm_content: "ad1", utm_term: null,
    experiencia: "menos-3-meses", pagina_captura: "Trader-Uruguay", pagina_gracias: "/gracias-video-trading",
  });
  assert.equal(d.telefone, "59899123456");
  assert.equal(d.pagina_captura, "trader");
  assert.equal(d.landing, "Trader-Uruguay");
  assert.equal(d.experiencia, "menos-3-meses");
  assert.equal(d.pagina_obrigado, "/gracias-video-trading");
  assert.deepEqual(d.utm, { utm_source: "fb", utm_campaign: "camp", utm_content: "ad1" });
});

test("página geral: Gen-Uruguay vira nunca_operou e o original vai para landing", () => {
  const d = extrairCaptura({ telefono: "59899123456", pagina_captura: "Gen-Uruguay", pagina_gracias: "/gracias-video2", utm_campaign: null });
  assert.equal(d.pagina_captura, "nunca_operou");
  assert.equal(d.landing, "Gen-Uruguay");
  assert.equal(d.pagina_obrigado, "/gracias-video2");
  assert.equal(extrairCaptura({ telefono: "1", pagina_captura: "Gen-Otro" }).pagina_captura, "nunca_operou");
  assert.equal(extrairCaptura({ telefono: "1", pagina_captura: "Trader-Chile" }).pagina_captura, "trader");
});

test("perfil da página de obrigado: age_range, gender, respuesta", () => {
  const d = extrairCaptura({ telefono: "59899123456", age_range: "25_34", gender: "mujer", video_id: "Video1", respuesta: "No hoy, pero podría organizarme para conseguirlo" });
  assert.equal(d.faixa_etaria, "25_34");
  assert.equal(d.genero, "mujer");
  assert.equal(d.resposta_dinheiro, "No hoy, pero podría organizarme para conseguirlo");
});

test("formatação do perfil na aba Inscrições", async () => {
  const f = await import("../src/lib/formato");
  assert.equal(f.faixaBonita("menor_25"), "até 24");
  assert.equal(f.faixaBonita("35_44"), "35–44");
  assert.equal(f.faixaBonita("mayor_65"), "65+");
  assert.equal(f.faixaBonita(null), "—");
  assert.equal(f.generoBonito("mujer"), "Mulher");
  assert.equal(f.investimentoBonito("Sí, podría hacerlo sin problema"), "Pode investir");
  assert.equal(f.investimentoBonito("No hoy, pero podría organizarme para conseguirlo"), "Pode se organizar");
  assert.equal(f.investimentoBonito("No, hoy sería imposible"), "Não pode");
  assert.equal(f.paginaBonita("nunca_operou"), "Nunca operou");
});

test("página geral com nome e e-mail (campos em espanhol)", () => {
  const d = extrairCaptura({ telefono: "59899123456", nombre: "Juan Pérez", email: "Juan@Ejemplo.com", pagina_captura: "Gen-Uruguay" });
  assert.equal(d.nome, "Juan Pérez");
  assert.equal(d.email, "Juan@Ejemplo.com");
  assert.equal(extrairCaptura({ telefono: "1", correo: "a@b.co" }).email, "a@b.co");
});

test("alertas: duração legível e resumo do grupo gratuito", async () => {
  const { duracao, mensagemAlerta } = await import("../src/lib/mensagens");
  assert.equal(duracao(45), "45 min");
  assert.equal(duracao(180), "3 h");
  assert.equal(duracao(200), "3 h 20 min");
  assert.equal(duracao(3000), "2 dias 2 h");
  const j = { de: "2026-10-08T10:00:00Z", ate: "2026-10-08T13:00:00Z", inscricoes: 0, entradas: 0, saidas: 0, inscritos_no_grupo: 0 };
  const m = mensagemAlerta("sem_entradas", "Grupo gratuito", { minutos_sem_entrada: 185, ultima_entrada_em: null, janela: j });
  assert.match(m, /3 h 5 min/);
  const r = mensagemAlerta("resumo", "Grupo gratuito", { janela: { ...j, inscricoes: 12, entradas: 9 }, inscricoes_externas: true });
  assert.match(r, /Inscrições: 12/);
  assert.doesNotMatch(r, /Dos inscritos/);
});
