-- Testes do encurtador de links (rodar depois do 012 num banco de teste)
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE r jsonb; lid bigint; d1 bigint; d2 bigint; a int := 0; b int := 0; i int;
BEGIN
  -- validações
  r := link_salvar(NULL, 'com espaço', NULL, true, true, '[{"url":"https://a.com"}]');
  ASSERT (r->>'ok')::boolean = false, 'slug com espaço é recusado';
  r := link_salvar(NULL, 'X', NULL, true, true, '[{"url":"ftp://a.com"}]');
  ASSERT (r->>'ok')::boolean = false, 'destino sem http(s) é recusado';
  r := link_salvar(NULL, 'X', NULL, true, true, '[]');
  ASSERT (r->>'ok')::boolean = false, 'sem destino é recusado';
  r := link_salvar(NULL, 'MP', NULL, true, true, '[{"url":"https://mpago.la/a","peso":60},{"url":"https://mpago.la/b","peso":30}]');
  ASSERT (r->>'ok')::boolean = false AND r->>'erro' LIKE '%somar 100%%(agora somam 90%%)%', 'pesos precisam somar 100: ' || (r->>'erro');

  -- link simples: peso vira 100
  r := link_salvar(NULL, 'GruposWpp', 'Semana', true, true, '[{"url":"https://eventotra.metodoconsistente.com/?utm_source=WhatsApp","peso":7}]');
  ASSERT (r->>'ok')::boolean, 'cria link simples';
  ASSERT (SELECT peso FROM link_destinos d JOIN links l ON l.id = d.link_id WHERE l.slug = 'GruposWpp') = 100, 'um destino = 100%';
  r := link_clique('gruposwpp');
  ASSERT r->>'url' = 'https://eventotra.metodoconsistente.com/?utm_source=WhatsApp', 'slug sem diferenciar maiúsculas';
  ASSERT (SELECT cliques FROM links WHERE slug = 'GruposWpp') = 1, 'clique contado';
  r := link_clique('GruposWpp', false);
  ASSERT (SELECT cliques FROM links WHERE slug = 'GruposWpp') = 1, 'robô não conta';
  ASSERT (SELECT count(*) FROM link_cliques) = 1, 'robô não grava clique';

  -- slug repetido (maiúsculas diferentes) é recusado
  r := link_salvar(NULL, 'GRUPOSWPP', NULL, true, true, '[{"url":"https://a.com"}]');
  ASSERT (r->>'ok')::boolean = false, 'slug repetido recusado';

  -- divisão 50/50
  r := link_salvar(NULL, 'MercadoPago', NULL, true, true, '[{"url":"https://mpago.la/19kD6oa","peso":50},{"url":"https://mpago.la/1ijXoQ2","peso":50}]');
  lid := (r->>'id')::bigint;
  FOR i IN 1..2000 LOOP
    r := link_clique('MercadoPago', true, 'uy', 'https://web.whatsapp.com/');
    IF r->>'url' = 'https://mpago.la/19kD6oa' THEN a := a + 1; ELSE b := b + 1; END IF;
  END LOOP;
  ASSERT a BETWEEN 880 AND 1120 AND b BETWEEN 880 AND 1120, format('50/50 dividiu %s/%s', a, b);
  ASSERT (SELECT cliques FROM links WHERE id = lid) = 2000, 'total do link';
  ASSERT (SELECT sum(cliques) FROM link_destinos WHERE link_id = lid) = 2000, 'soma dos destinos';
  ASSERT (SELECT pais FROM link_cliques WHERE link_id = lid LIMIT 1) = 'UY', 'país em maiúsculas';

  -- editar: muda para 80/20 mantendo os cliques do destino que ficou; o outro é trocado
  SELECT id INTO d1 FROM link_destinos WHERE link_id = lid ORDER BY ordem LIMIT 1;
  r := link_salvar(lid, 'MercadoPago', 'MP', true, true,
        jsonb_build_array(jsonb_build_object('id', d1, 'url', 'https://mpago.la/19kD6oa', 'peso', 80),
                          jsonb_build_object('url', 'https://mpago.la/novo', 'peso', 20)));
  ASSERT (r->>'ok')::boolean, 'edita link: ' || coalesce(r->>'erro', '');
  ASSERT (SELECT count(*) FROM link_destinos WHERE link_id = lid) = 2, 'continua com 2 destinos';
  ASSERT (SELECT cliques FROM link_destinos WHERE id = d1) = a, 'destino mantido conserva os cliques';
  SELECT id INTO d2 FROM link_destinos WHERE link_id = lid AND url = 'https://mpago.la/novo';
  ASSERT (SELECT cliques FROM link_destinos WHERE id = d2) = 0, 'destino novo começa zerado';
  a := 0; b := 0;
  FOR i IN 1..2000 LOOP
    r := link_clique('mercadopago');
    IF (r->>'destino_id')::bigint = d1 THEN a := a + 1; ELSE b := b + 1; END IF;
  END LOOP;
  ASSERT a BETWEEN 1500 AND 1700, format('80/20 dividiu %s/%s', a, b);

  -- peso 0 = destino desligado
  r := link_salvar(lid, 'MercadoPago', 'MP', true, true,
        jsonb_build_array(jsonb_build_object('id', d1, 'url', 'https://mpago.la/19kD6oa', 'peso', 100),
                          jsonb_build_object('id', d2, 'url', 'https://mpago.la/novo', 'peso', 0)));
  FOR i IN 1..50 LOOP
    r := link_clique('MercadoPago');
    ASSERT (r->>'destino_id')::bigint = d1, 'peso 0 nunca recebe';
  END LOOP;

  -- pausado
  UPDATE links SET ativo = false WHERE id = lid;
  r := link_clique('MercadoPago');
  ASSERT (r->>'ok')::boolean = false AND r->>'erro' = 'pausado', 'link pausado não redireciona';
  r := link_clique('nao-existe');
  ASSERT r->>'erro' = 'nao_encontrado', 'inexistente';

  -- importação: cria, pula repetidos e inválidos
  r := links_importar('[{"slug":"Clase1","url":"https://youtube.com/x","titulo":"Clase 1","rebrandly_id":"r1"},
                        {"slug":"gruposWPP","url":"https://outro.com"},
                        {"slug":"mal slug","url":"https://a.com"},
                        {"slug":"SemUrl","url":"javascript:alert(1)"}]');
  ASSERT (r->>'criados')::int = 1 AND (r->>'existentes')::int = 1 AND (r->>'invalidos')::int = 2, 'importação: ' || r::text;
  ASSERT (SELECT origem FROM links WHERE slug = 'Clase1') = 'rebrandly', 'origem rebrandly';

  -- resumo
  r := links_resumo();
  ASSERT jsonb_array_length(r) = 3, 'resumo lista 3 links';
  ASSERT (SELECT (x->>'cliques_7d')::int FROM jsonb_array_elements(r) x WHERE x->'link'->>'slug' = 'MercadoPago') = 4050, 'cliques 7d';

  -- excluir apaga destinos e cliques
  DELETE FROM links WHERE id = lid;
  ASSERT NOT EXISTS (SELECT 1 FROM link_destinos WHERE link_id = lid), 'destinos apagados junto';

  RAISE NOTICE 'links: todos os testes passaram';
END $$;

ROLLBACK;
