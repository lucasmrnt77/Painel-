import { test } from "node:test";
import assert from "node:assert/strict";
import { diasAte, ordenarLinhas, proximaRecarga, situacaoRecarga, type Linha } from "../src/lib/linhas";

test("próxima recarga = 6 meses depois, ajustando o fim do mês", () => {
  assert.equal(proximaRecarga("2026-08-03"), "2027-02-03");
  assert.equal(proximaRecarga("2026-08-31"), "2027-02-28");
  assert.equal(proximaRecarga("2027-08-31"), "2028-02-29");
  assert.equal(proximaRecarga("2026-11-13"), "2027-05-13");
});

test("situação: vencida, vence em breve (até 15 dias), ok, sem data, perdida", () => {
  const hoje = "2026-11-13";
  assert.equal(diasAte("2026-11-28", hoje), 15);
  assert.equal(situacaoRecarga({ estado: "ativa", proxima_recarga: "2026-08-03" }, hoje), "vencida");
  assert.equal(situacaoRecarga({ estado: "ativa", proxima_recarga: "2026-11-13" }, hoje), "breve");
  assert.equal(situacaoRecarga({ estado: "ativa", proxima_recarga: "2026-11-28" }, hoje), "breve");
  assert.equal(situacaoRecarga({ estado: "ativa", proxima_recarga: "2026-11-29" }, hoje), "ok");
  assert.equal(situacaoRecarga({ estado: "ativa", proxima_recarga: null }, hoje), "sem_data");
  assert.equal(situacaoRecarga({ estado: "perdida", proxima_recarga: "2026-08-03" }, hoje), "perdida");
});

test("ordem: vencidas, em breve, ok, sem data, perdidas", () => {
  const l = (id: number, estado: "ativa" | "perdida", proxima_recarga: string | null): Linha => ({
    id, linha: `+598 9${id}`, celular: null, whatsapp: null, descricao: null, pin: null, puk: null, chip: null, estado, ultima_recarga: null, proxima_recarga,
  });
  const r = ordenarLinhas([l(1, "perdida", null), l(2, "ativa", null), l(3, "ativa", "2027-02-03"), l(4, "ativa", "2026-11-20"), l(5, "ativa", "2026-08-03")], "2026-11-13");
  assert.deepEqual(r.map((x) => x.id), [5, 4, 3, 2, 1]);
});
