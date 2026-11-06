-- 053: Comportamento na página por visita (a partir de 06/11/2026) — headline × página × formulário.
--
-- Cada visita com código (052) recebe, quando a pessoa sai ou troca de aba:
--   segundos       tempo com a aba VISÍVEL (trocar de app pausa)
--   rolagem        até onde rolou a página (0–100%)
--   formulario     tocou/começou a preencher o formulário
--   carregamento_ms quanto a página levou para abrir (separa "headline fraca" de "página lenta")
-- Os avisos podem chegar mais de uma vez (cada saída de aba): fica o maior valor.
--
-- engajamento_paginas_periodo: por site × página × país, cada visita numa só etapa:
--   inscreveu  >  começou o formulário e não enviou  >  saiu em menos de 5 s  >  ficou sem tocar no formulário
--   (visita sem o aviso de saída e sem inscrição = sem_dado; não entra nas %)
BEGIN;

ALTER TABLE public.visitas_sessao
  ADD COLUMN IF NOT EXISTS segundos        int,
  ADD COLUMN IF NOT EXISTS rolagem         int,
  ADD COLUMN IF NOT EXISTS formulario      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carregamento_ms int,
  ADD COLUMN IF NOT EXISTS atualizado_em   timestamptz;

CREATE OR REPLACE FUNCTION public.registrar_tempo_visita(p_visita uuid, p_segundos int, p_rolagem int, p_formulario boolean, p_carregamento_ms int)
RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $$
  WITH u AS (
    UPDATE public.visitas_sessao s
       SET segundos        = greatest(coalesce(s.segundos, 0), least(greatest(coalesce(p_segundos, 0), 0), 3600)),
           rolagem         = greatest(coalesce(s.rolagem, 0), least(greatest(coalesce(p_rolagem, 0), 0), 100)),
           formulario      = s.formulario OR coalesce(p_formulario, false),
           carregamento_ms = coalesce(s.carregamento_ms, CASE WHEN p_carregamento_ms BETWEEN 1 AND 60000 THEN p_carregamento_ms END),
           atualizado_em   = now()
     WHERE s.id = p_visita AND s.criado_em > now() - interval '2 days'
    RETURNING 1
  )
  SELECT jsonb_build_object('ok', EXISTS (SELECT 1 FROM u))
$$;
REVOKE ALL ON FUNCTION public.registrar_tempo_visita(uuid, int, int, boolean, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tempo_visita(uuid, int, int, boolean, int) TO service_role;

CREATE OR REPLACE FUNCTION public.engajamento_paginas_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE(site text, landing text, pais text, visitas bigint, com_dado bigint, inscreveu bigint, abandonou_form bigint,
              saiu_rapido bigint, ficou_sem_form bigint, rolou_metade bigint, mediana_segundos numeric, mediana_carregamento_ms numeric,
              mediana_carregamento_saiu_rapido numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH vs AS (
    SELECT s.site, public.pagina_padrao(s.landing) AS landing, public.pais_grupo(s.pais) AS pais,
           s.segundos, s.rolagem, s.formulario, s.carregamento_ms,
           EXISTS (SELECT 1 FROM public.inscricoes i
                    WHERE i.lancamento_id = s.lancamento_id AND i.payload ? 'visita_id' AND i.payload->>'visita_id' = s.id::text) AS inscrito
      FROM public.visitas_sessao s
     WHERE s.lancamento_id = p_lancamento
       AND (p_de IS NULL OR s.dia >= p_de) AND (p_ate IS NULL OR s.dia <= p_ate)
  ), e AS (
    SELECT vs.*,
           CASE
             WHEN inscrito THEN 'inscreveu'
             WHEN segundos IS NULL THEN 'sem_dado'
             WHEN formulario THEN 'abandonou_form'
             WHEN segundos < 5 THEN 'saiu_rapido'
             ELSE 'ficou_sem_form'
           END AS etapa
      FROM vs
  )
  SELECT e.site, e.landing, e.pais,
         count(*)::bigint,
         count(*) FILTER (WHERE etapa <> 'sem_dado')::bigint,
         count(*) FILTER (WHERE etapa = 'inscreveu')::bigint,
         count(*) FILTER (WHERE etapa = 'abandonou_form')::bigint,
         count(*) FILTER (WHERE etapa = 'saiu_rapido')::bigint,
         count(*) FILTER (WHERE etapa = 'ficou_sem_form')::bigint,
         count(*) FILTER (WHERE rolagem >= 50)::bigint,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY segundos))::numeric, 1),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY carregamento_ms))::numeric, 0),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY carregamento_ms) FILTER (WHERE etapa = 'saiu_rapido'))::numeric, 0)
    FROM e
   GROUP BY e.site, e.landing, e.pais
$$;
REVOKE ALL ON FUNCTION public.engajamento_paginas_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engajamento_paginas_periodo(bigint, date, date) TO service_role;

COMMIT;
