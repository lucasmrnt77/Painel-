-- 043: REGRA (28/10/2026) — nenhum teste de páginas pode sobrepor outro do mesmo lançamento.
-- Os dados de cada teste são separados por dia (horário do Uruguai): dois testes não podem ter
-- nenhum dia em comum, nem o dia da troca. O painel já avisa antes de salvar; isto é a trava no banco.

CREATE OR REPLACE FUNCTION public.testes_paginas_sem_sobreposicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  c record;
BEGIN
  IF NEW.fim < NEW.inicio THEN
    RAISE EXCEPTION 'teste "%": a data de fim (%) é antes do início (%)', NEW.nome, NEW.fim, NEW.inicio;
  END IF;
  SELECT t.nome, t.inicio, t.fim INTO c
    FROM public.testes_paginas t
   WHERE t.lancamento_id = NEW.lancamento_id
     AND t.id <> NEW.id
     AND t.inicio <= NEW.fim AND NEW.inicio <= t.fim
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'teste "%" (% a %) sobrepõe o teste "%" (% a %): nenhum teste pode ter dia em comum com outro',
      NEW.nome, NEW.inicio, NEW.fim, c.nome, c.inicio, c.fim;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.testes_paginas_sem_sobreposicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS testes_paginas_sem_sobreposicao ON public.testes_paginas;
CREATE TRIGGER testes_paginas_sem_sobreposicao
  BEFORE INSERT OR UPDATE OF lancamento_id, inicio, fim ON public.testes_paginas
  FOR EACH ROW EXECUTE FUNCTION public.testes_paginas_sem_sobreposicao();
