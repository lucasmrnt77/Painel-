-- 045: Recuperação por WhatsApp (28/10/2026) — quantas mensagens o fluxo do Unnichat enviou e quantas
-- dessas pessoas entraram no grupo depois. O Apps Script do chequeo avisa o painel a cada envio
-- (POST /api/recuperacao); o histórico da "Hoja 4" pode ser importado uma vez (origem = 'historico',
-- só com o dia do envio).

CREATE TABLE public.recuperacao_envios (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id   bigint NOT NULL REFERENCES public.lancamentos (id),
  telefone        text NOT NULL,
  telefone_chave  text NOT NULL,
  enviado_em      timestamptz NOT NULL,
  conta           smallint,
  http            smallint,
  origem          text NOT NULL DEFAULT 'script' CHECK (origem IN ('script', 'historico')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recuperacao_envios_unico UNIQUE (lancamento_id, telefone_chave, enviado_em)
);
CREATE INDEX recuperacao_envios_lanc_chave ON public.recuperacao_envios (lancamento_id, telefone_chave);

-- A chave do telefone é a mesma das inscrições (public.telefone_chave), calculada no banco
CREATE FUNCTION public.recuperacao_envios_chave()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.telefone_chave := COALESCE(public.telefone_chave(NEW.telefone), NEW.telefone);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.recuperacao_envios_chave() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER recuperacao_envios_chave BEFORE INSERT ON public.recuperacao_envios
  FOR EACH ROW EXECUTE FUNCTION public.recuperacao_envios_chave();

-- Uma linha por pessoa que recebeu: primeiro envio, se/quando entrou no grupo depois, e de que página veio.
CREATE VIEW public.v_recuperacao AS
 WITH env AS (
   SELECT e.lancamento_id, e.telefone_chave, min(e.telefone) AS telefone, min(e.enviado_em) AS primeiro_envio,
          count(*) AS envios, (array_agg(e.conta ORDER BY e.enviado_em))[1] AS conta,
          bool_and(e.origem = 'historico') AS historico
     FROM public.recuperacao_envios e
    WHERE e.http IS NULL OR (e.http >= 200 AND e.http < 300)
    GROUP BY e.lancamento_id, e.telefone_chave
 ), m AS (
   SELECT g.lancamento_id, g.telefone_chave, min(g.primeira_entrada_em) AS entrou_em
     FROM public.membros_grupo g
    WHERE g.primeira_entrada_em IS NOT NULL
    GROUP BY g.lancamento_id, g.telefone_chave
 )
 SELECT env.lancamento_id, env.telefone_chave, env.telefone, env.primeiro_envio, env.envios, env.conta, env.historico,
        COALESCE(l.site, '—') AS site,
        m.entrou_em,
        (m.entrou_em IS NOT NULL AND m.entrou_em >= env.primeiro_envio) AS entrou_depois,
        CASE WHEN m.entrou_em >= env.primeiro_envio
             THEN round((EXTRACT(epoch FROM (m.entrou_em - env.primeiro_envio)) / 60)::numeric, 1) END AS minutos_ate_entrar
   FROM env
   LEFT JOIN m ON m.lancamento_id = env.lancamento_id AND m.telefone_chave = env.telefone_chave
   LEFT JOIN public.v_leads l ON l.lancamento_id = env.lancamento_id AND l.telefone_chave = env.telefone_chave;

REVOKE ALL ON public.recuperacao_envios, public.v_recuperacao FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.recuperacao_envios TO service_role;
GRANT SELECT ON public.v_recuperacao TO service_role;
