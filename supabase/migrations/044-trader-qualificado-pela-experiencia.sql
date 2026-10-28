-- 044: Trader — "qualificado" pela experiência quando o clique não chegou a gravar (28/10/2026).
-- Na página de obrigado do Trader, o qualificado só era gravado depois de abrir o WhatsApp; no celular o
-- navegador congela a página e a gravação se perdia. A regra do Trader é conhecida no cadastro:
-- quem tem experiência qualifica, "Nunca hice" não. Só a partir de dezembro (lancamento_id >= 4);
-- setembro e lançamentos anteriores não mudam. Nenhum dado gravado é alterado: só a leitura.

CREATE OR REPLACE VIEW public.v_leads_funil AS
 WITH perfil AS (
         SELECT inscricoes.lancamento_id,
            inscricoes.telefone_chave,
            bool_or((inscricoes.resposta_dinheiro IS NOT NULL)) AS respondeu,
            bool_or(((inscricoes.faixa_etaria IS NOT NULL) OR (inscricoes.genero IS NOT NULL) OR (inscricoes.resposta_dinheiro IS NOT NULL))) AS comecou,
            bool_or(COALESCE(inscricoes.qualificado,
              CASE WHEN inscricoes.lancamento_id >= 4 AND inscricoes.pagina_captura = 'trader' AND inscricoes.experiencia IS NOT NULL
                   THEN public.qualifica_trader(inscricoes.experiencia) END)) AS qualificado
           FROM public.inscricoes
          WHERE (inscricoes.telefone_chave IS NOT NULL)
          GROUP BY inscricoes.lancamento_id, inscricoes.telefone_chave
        )
 SELECT v.lancamento_id,
    COALESCE(public.pagina_padrao(NULLIF(v.landing, ''::text)), '(sem landing)'::text) AS landing,
    COALESCE(public.pagina_padrao(NULLIF(v.pagina_obrigado, ''::text)), '(sem gracias)'::text) AS pagina_obrigado,
    COALESCE(public.pais_do_telefone(v.telefone), 'Sem DDI'::text) AS pais,
    v.no_grupo,
    COALESCE(p.comecou, false) AS comecou,
    COALESCE(p.respondeu, false) AS respondeu,
    p.qualificado,
    v.site,
    v.inscrito_em
   FROM (public.v_leads v
     LEFT JOIN perfil p ON (((p.lancamento_id = v.lancamento_id) AND (p.telefone_chave = v.telefone_chave))));
