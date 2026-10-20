-- 029: um lançamento pode receber eventos de mais de uma campanha do Sendflow.
-- Dezembro/2026 tem duas campanhas: "General - Oficial" (funil Geral) e "Trading - Oficial" (funil Trader).
-- Antes só existia lancamentos.sendflow_ref (um valor); os eventos dessas campanhas caíam em dezembro
-- apenas porque ele é o lançamento ativo. Agora a ligação é fixa.
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS sendflow_refs text[] NOT NULL DEFAULT '{}';

-- Mesma regra de antes (ref da campanha, id do grupo ou prefixo do nome do grupo; o mais longo vence;
-- senão o lançamento ativo), olhando sendflow_ref e também cada valor de sendflow_refs.
CREATE OR REPLACE FUNCTION public.resolver_lancamento_sendflow(p_ref text, p_grupo_id text, p_grupo_nome text)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT l.id
       FROM public.lancamentos l
       CROSS JOIN LATERAL unnest(array_remove(array_prepend(l.sendflow_ref, l.sendflow_refs), NULL)) AS r(ref)
      WHERE r.ref <> ''
        AND (   r.ref = p_ref
             OR r.ref = p_grupo_id
             OR (p_grupo_nome IS NOT NULL
                 AND lower(p_grupo_nome) LIKE lower(replace(replace(replace(r.ref, '\', '\\'), '%', '\%'), '_', '\_')) || '%'))
      ORDER BY length(r.ref) DESC
      LIMIT 1),
    (SELECT l.id FROM public.lancamentos l WHERE l.ativo LIMIT 1)
  )
$$;

-- Dezembro/2026: as duas campanhas (nome e id de cada uma no Sendflow)
UPDATE public.lancamentos
   SET sendflow_refs = ARRAY['General - Oficial', 'Trading - Oficial', 'Fk4wTJpzy9TLljYz1kG6', 'uR7VaVg6aEcktJVNdZI2']
 WHERE id = 5;
