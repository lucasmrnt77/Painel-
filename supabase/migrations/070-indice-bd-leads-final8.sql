-- 070 (22/11/2026): buscas pelos 8 últimos dígitos do telefone em bd_leads (membros_grupo_contatos → "Baixar membros",
-- exportações) liam a tabela inteira (115 mil linhas) a cada chamada.
CREATE INDEX IF NOT EXISTS bd_leads_tel_final8 ON public.bd_leads (right(telefone, 8)) WHERE telefone IS NOT NULL;
ANALYZE public.bd_leads;
