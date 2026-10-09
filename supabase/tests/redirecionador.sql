-- Testes do redirecionador (rodar depois do 010 num banco de teste)
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL ROLE service_role;
UPDATE redir_funis SET limite_cliques = 5, verificar_a_cada = 2, link_reserva = 'https://exemplo.com/reserva' WHERE slug = 'trader';
INSERT INTO redir_grupos (funil, ordem, codigo, sendflow_group_id) VALUES
  ('trader', 1, 'AAAAAAAAAAAAAAAAAAAA01', 'g1'), ('trader', 2, 'AAAAAAAAAAAAAAAAAAAA02', 'g2');

DO $$
DECLARE r jsonb; i int; g1 bigint; g2 bigint;
BEGIN
  SELECT id INTO g1 FROM redir_grupos WHERE codigo = 'AAAAAAAAAAAAAAAAAAAA01';
  SELECT id INTO g2 FROM redir_grupos WHERE codigo = 'AAAAAAAAAAAAAAAAAAAA02';

  r := redir_clique('trader', 'teste');
  ASSERT r->>'link' = 'https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAAAA01', 'clique 1 vai para o grupo 1';
  ASSERT (r->>'verificar')::boolean = false, 'clique 1 não verifica';
  r := redir_clique('trader', 'teste');
  ASSERT (r->>'verificar')::boolean = true, 'clique 2 (a cada 2) verifica';
  ASSERT (SELECT cliques_desde_verificacao FROM redir_grupos WHERE id = g1) = 0, 'contador de verificação zera';

  -- bot/preview não conta
  r := redir_clique('trader', 'bot', false);
  ASSERT (SELECT cliques FROM redir_grupos WHERE id = g1) = 2, 'clique sem contar não soma';

  -- convite inválido tira da fila e o próximo assume
  r := redir_registrar_verificacao(g1, 'invalido', NULL, 'teste');
  ASSERT (r->>'saiu_da_fila')::boolean, 'inválido sai da fila';
  r := redir_clique('trader', 'teste');
  ASSERT r->>'link' = 'https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAAAA02', 'depois do inválido vai para o grupo 2';

  -- inconclusivo NÃO tira da fila
  r := redir_registrar_verificacao(g2, 'inconclusivo');
  ASSERT (r->>'saiu_da_fila')::boolean = false, 'inconclusivo mantém';

  -- link novo devolve o grupo 1 à fila (antes do 2, pela ordem)
  PERFORM redir_trocar_codigo(g1, 'BBBBBBBBBBBBBBBBBBBB01', 'sendflow');
  r := redir_clique('trader', 'teste');
  ASSERT r->>'link' = 'https://chat.whatsapp.com/BBBBBBBBBBBBBBBBBBBB01', 'grupo 1 volta com o link novo';

  -- limite: grupo 1 tinha 3 cliques; mais 2 → 5 = cheio
  r := redir_clique('trader', 'teste');
  r := redir_clique('trader', 'teste');
  ASSERT (SELECT status FROM redir_grupos WHERE id = g1) = 'cheio', 'grupo 1 cheio no limite';
  ASSERT (SELECT cliques FROM redir_grupos WHERE id = g1) = 5, 'exatamente 5 cliques';
  r := redir_clique('trader', 'teste');
  ASSERT r->>'link' = 'https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAAAA02', 'cheio → próximo';

  -- sem grupos: vai para a reserva e cria UM aviso
  UPDATE redir_grupos SET status = 'pausado' WHERE id = g2;
  r := redir_clique('trader', 'teste');
  ASSERT (r->>'reserva')::boolean AND r->>'link' = 'https://exemplo.com/reserva', 'sem grupos usa a reserva';
  r := redir_clique('trader', 'teste');
  ASSERT (SELECT count(*) FROM redir_eventos WHERE tipo = 'sem_grupos') = 1, 'aviso de sem grupos não repete';

  ASSERT (SELECT count(*) FROM redir_eventos WHERE tipo = 'cheio') = 1, 'evento cheio';
  ASSERT (SELECT count(*) FROM redir_eventos WHERE tipo = 'invalido') = 1, 'evento inválido';
  ASSERT (SELECT count(*) FROM redir_eventos WHERE tipo = 'link_novo') = 1, 'evento link novo';
  ASSERT jsonb_array_length(redir_resumo()) = (SELECT count(*) FROM redir_funis), 'resumo com um item por funil';
  RAISE NOTICE 'redirecionador: todos os testes passaram';
END $$;
ROLLBACK;

-- Corrida: 2 sessões não podem estourar o limite (coberto pelo FOR UPDATE; teste manual com pgbench se quiser)
