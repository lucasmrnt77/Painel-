# Painel Sendflow

Painel separado do sistema de pagamentos para acompanhar o funil
**página de captura → grupo de WhatsApp (Sendflow)**.

- A página de captura envia nome, e-mail, telefone e UTMs para `/api/captura`.
- O Sendflow avisa por webhook quem entrou e quem saiu do grupo (`/api/webhooks/sendflow`).
- O painel cruza as duas listas pelo telefone e mostra, para cada inscrito,
  se ele está no grupo, se saiu ou se passou de 10 minutos sem entrar
  (**fora do grupo**, que é a lista para o reenvio do link).

Stack: Next.js 16 + TypeScript + Tailwind, Supabase (Postgres + PostgREST), deploy na Vercel.

---

## 1. Criar o Supabase

1. Em <https://supabase.com/dashboard>, **New project** (região São Paulo). Guarde a senha do banco.
2. Abra **SQL Editor** e rode, nesta ordem, colando o conteúdo de cada arquivo:

   | Ordem | Arquivo | Resultado esperado |
   |---|---|---|
   | 1 | `supabase/checks/000-pre.sql` | `pronto_para_migrar = true` |
   | 2 | `supabase/migrations/000-base.sql` | "Success. No rows returned" |
   | 3 | `supabase/checks/000-post.sql` | `tudo_ok = true` |
   | 4 | `supabase/checks/001-pre.sql` | `pronto_para_migrar = true` |
   | 5 | `supabase/migrations/001-views.sql` | "Success. No rows returned" |
   | 6 | `supabase/checks/001-post.sql` | `tudo_ok = true` |
   | 7 | `supabase/checks/002-pre.sql` | `pronto_para_migrar = true` |
   | 8 | `supabase/migrations/002-monitor.sql` | "Success. No rows returned" |
   | 9 | `supabase/checks/002-post.sql` | `tudo_ok = true` |
   | 10 | `supabase/checks/003-pre.sql` | `pronto_para_migrar = true` |
   | 11 | `supabase/migrations/003-historico.sql` | "Success. No rows returned" |
   | 12 | `supabase/checks/003-post.sql` | `tudo_ok = true` |

   | 13 | `supabase/checks/004-pre.sql` | `pronto_para_migrar = true` |
   | 14 | `supabase/migrations/004-paginas-captura.sql` | "Success. No rows returned" |
   | 15 | `supabase/checks/004-post.sql` | `tudo_ok = true` |
   | 16 | `supabase/checks/005-pre.sql` | `pronto_para_migrar = true` |
   | 17 | `supabase/migrations/005-demografia-e-grupos.sql` | "Success. No rows returned" |
   | 18 | `supabase/checks/005-post.sql` | `tudo_ok = true` |
   | 19 | `supabase/checks/006-pre.sql` | `pronto_para_migrar = true` |
   | 20 | `supabase/migrations/006-estatisticas.sql` | "Success. No rows returned" |
   | 21 | `supabase/checks/006-post.sql` | `tudo_ok = true` |

   Rode só as migrations que ainda não foram aplicadas, sempre na ordem.

   Se algum check não der `true`, pare e me mande o resultado.
3. Em **Project Settings → API** copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

   A `service_role` só fica na Vercel, nunca vai para o navegador nem para a página de captura.

## 2. Subir na Vercel

1. Suba esta pasta para um repositório novo no GitHub (ou use `npx vercel` direto da pasta).
2. Na Vercel: **Add New → Project**, importe o repositório. Framework: Next.js (detecta sozinho).
3. Em **Settings → Environment Variables**, cadastre (modelo em `.env.example`):

   | Variável | O que é |
   |---|---|
   | `SUPABASE_URL` | Project URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role |
   | `PAINEL_SENHA` | senha para entrar no painel |
   | `SESSAO_SEGREDO` | texto aleatório longo (assina o cookie de login) |
   | `CAPTURA_TOKEN` | token que a página de captura manda |
   | `SENDFLOW_WEBHOOK_TOKEN` | token que vai na URL do webhook do Sendflow |
   | `CAPTURA_ORIGENS` | só se a página chamar a API direto do navegador: domínio(s) da página, separados por vírgula |
   | `CRON_SECRET` | código aleatório; a Vercel usa para chamar o monitor a cada 2 min |
   | `SENDFLOW_API_TOKEN` | (opcional) token da API do Sendflow, para enviar os alertas — ver "Monitor de tráfego" |
   | `SENDFLOW_ACCOUNT_ID` | (opcional) id da conta/número do Sendflow que envia |
   | `SENDFLOW_ALERTAS_CAMPANHA_ID` | (opcional) id da campanha cujo(s) grupo(s) recebem os alertas |
   | `WHATSAPP_WEBHOOK_URL` | (opcional) alternativa: URL (Make/n8n) que dispara o WhatsApp dos alertas |
   | `WHATSAPP_WEBHOOK_TOKEN` | (opcional) enviado como `Authorization: Bearer ...` nessa URL |

   Para gerar tokens/segredos: `openssl rand -hex 32` (ou `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   Use um valor diferente para cada um.
4. **Deploy**. Entre em `https://SEU-PROJETO.vercel.app`, faça login com `PAINEL_SENHA`.

## 3. Configurar no painel

Aba **Lançamentos → Novo lançamento**:

- **Slug**: identificador curto (`out-2026`). Pode ir na URL da captura (`&lancamento=out-2026`).
- **Link do grupo**: o link de convite que será reenviado.
- **Referência no Sendflow**: id da campanha **ou** o começo do nome dos grupos
  (ex.: `Expert Trader Out` casa com "Expert Trader Out #1", "#2"...). É assim que o
  webhook sabe de qual lançamento é cada entrada. Se ficar vazio, vai para o lançamento ativo.
- **Minutos**: janela antes de marcar como "fora do grupo" (padrão 10).

Depois clique em **Tornar ativo**. Só um lançamento fica ativo por vez; a captura sem
`lancamento` e os eventos sem referência caem nele.

No fim da aba Lançamentos aparecem as URLs prontas com o domínio certo.

## 4. Conectar a página de captura

`POST https://SEU-PROJETO.vercel.app/api/captura?token=CAPTURA_TOKEN`

- Aceita JSON, formulário (`x-www-form-urlencoded`) ou `multipart`.
- Campos reconhecidos (qualquer um dos nomes): `nome`/`name`, `email`, `telefone`/`phone`/`whatsapp`/`celular`,
  `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `lancamento`.
  Também entende o formato de webhook do Elementor (`fields[email][value]`).
- Resposta: `{"ok": true, "inscricao_id": 123, "link_grupo": "https://chat.whatsapp.com/..."}`.
- Com `&redirect=1` responde com redirecionamento 303 para o link do grupo.
- Erros: `401 nao_autorizado`, `400 telefone_obrigatorio | telefone_invalido`, `404 lancamento_inexistente`,
  `409 sem_lancamento_ativo`.

**Importante para o reenvio:** peça o telefone **com código do país** (DDI) no formulário
(ex.: seletor de país). O cruzamento com o grupo funciona sem DDI, mas para enviar a mensagem
de reenvio o número precisa estar completo.

Teste rápido:

```bash
curl -X POST "https://SEU-PROJETO.vercel.app/api/captura?token=SEU_TOKEN" \
  -H "content-type: application/json" \
  -d '{"nome":"Teste","email":"teste@x.com","telefone":"+598 99 123 456"}'
```

## 5. Conectar o Sendflow

No Sendflow, nos webhooks/integrações da campanha, cadastre:

- Gatilho de **entrada no grupo** → `https://SEU-PROJETO.vercel.app/api/webhooks/sendflow?token=SENDFLOW_WEBHOOK_TOKEN&tipo=entrou`
- Gatilho de **saída do grupo** → `https://SEU-PROJETO.vercel.app/api/webhooks/sendflow?token=SENDFLOW_WEBHOOK_TOKEN&tipo=saiu`

Se o Sendflow tiver um webhook único para tudo, use a URL sem `&tipo=`: o sistema tenta descobrir
o tipo pelo conteúdo (`join`, `add`, `leave`, `remove`, `entrou`, `saiu`...).

Todo webhook é gravado com o payload bruto na aba **Eventos Sendflow**, mesmo quando não dá para
entender. Depois do primeiro evento real, confira ali se o telefone e o tipo foram reconhecidos;
se aparecer "desconhecido", me mande o payload que eu ajusto o mapeamento (`src/lib/sendflow.ts`).

**Quem já estava no grupo** antes do webhook: aba **Membros do grupo → Importar números**
(cole a lista exportada do Sendflow, um número por linha).

## Como o cruzamento funciona

A chave é o **final do telefone (últimos 8 dígitos)**, dentro do mesmo lançamento. Isso casa:

- Uruguai: `099 123 456` (formulário) com `59899123456` (WhatsApp)
- Argentina: `11 15 1234-5678` com `5491112345678`
- Brasil: `(11) 91234-5678` com `551112345678` (WhatsApp sem o 9)

Risco conhecido: duas pessoas diferentes com os mesmos 8 últimos dígitos no mesmo lançamento
seriam tratadas como a mesma. Com algumas centenas/milhares de inscritos a chance é muito baixa.

Status de cada inscrito (view `v_leads`):

| Status | Significado |
|---|---|
| `no_grupo` | está no grupo agora |
| `aguardando` | inscreveu há menos de N minutos e ainda não entrou |
| `fora_do_grupo` | passou de N minutos e não entrou → **alvo do reenvio** |
| `saiu` | entrou e saiu |
| `telefone_invalido` | telefone com menos de 8 dígitos |

Inscrições repetidas do mesmo telefone contam uma vez (coluna "Envios" mostra quantas vezes preencheu).

## Banco de dados

| Objeto | Tipo | Conteúdo |
|---|---|---|
| `lancamentos` | tabela | lançamentos, link do grupo, referência Sendflow, lançamento ativo |
| `inscricoes` | tabela | todos os envios da página de captura (sem UPDATE) |
| `webhooks_sendflow` | tabela append-only | payload bruto de cada chamada |
| `eventos_sendflow` | tabela append-only | um evento por pessoa (entrou/saiu/importacao/desconhecido) |
| `membros_grupo` | tabela | estado atual de cada número em cada grupo |
| `v_leads`, `v_membros`, `v_resumo_lancamentos`, `v_serie_diaria` | views | o que o painel lê |
| `registrar_inscricao()`, `sendflow_registrar_webhook()` | RPCs | chamadas pelo app |

Segurança: RLS ligado em todas as tabelas, nada liberado para `anon`/`authenticated`; só a
`service_role` (usada no servidor da Vercel) lê e grava.

Para apagar inscrições de teste (SQL Editor):

```sql
DELETE FROM inscricoes WHERE email = 'teste@x.com';
```

## Monitor de tráfego

Na **Visão geral**, botão **Ligar monitor** (ligue quando o tráfego começar, desligue quando pausar).
Com o monitor ligado, o Cron da Vercel (`vercel.json`, a cada 2 min — precisa do plano Pro) roda
`/api/cron/monitor` e:

- **Sem entradas:** se passar N minutos (padrão 20) sem ninguém entrar no grupo, cria um alerta.
  Se o silêncio continuar, alerta de novo a cada N minutos. A mensagem diz se houve inscrições no
  período (problema na página de obrigado / link) ou não (tráfego parado).
- **Entradas retomadas:** avisa quando alguém entra depois de um alerta.
- **Resumo periódico** (padrão de hora em hora): inscrições, entradas, saídas e % dos inscritos do
  período que já estão no grupo.

Configuração por lançamento (aba Lançamentos → Editar): minutos sem entrada e intervalo do resumo.
Os alertas aparecem sempre no painel. O **envio por WhatsApp** usa, em ordem de prioridade:

1. **Sendflow → grupo da equipe** (`SENDFLOW_API_TOKEN` + `SENDFLOW_ACCOUNT_ID` +
   `SENDFLOW_ALERTAS_CAMPANHA_ID`). O painel chama `POST /sendapi/actions/send-text-message`
   e o Sendflow manda a mensagem em **todos os grupos da campanha indicada**. Use uma campanha
   que tenha só o grupo da equipe (ou o grupo de teste) — nunca a campanha dos leads.
2. **Sendflow → mensagem direta** (sem `SENDFLOW_ALERTAS_CAMPANHA_ID`): um envio por telefone
   cadastrado no lançamento (`POST /sendapi/send-text-message/{accountId}`).
3. **Webhook genérico** (`WHATSAPP_WEBHOOK_URL`): um POST por telefone com
   `{ telefone, mensagem, tipo, origem }` (Make/n8n).

Os números dos alertas vêm sempre do **grupo dos leads** do lançamento (definido pela
"Referência no Sendflow" do lançamento). Entradas e saídas na campanha de alertas são ignoradas
(ficam registradas em Eventos como "ignorado (grupo da equipe)"); outros grupos a ignorar vão em
`SENDFLOW_IGNORAR`.

O botão **Enviar alerta de teste** confere a configuração; o status do envio aparece ao lado de
cada alerta (passe o mouse para ver a mensagem).

Os alertas não duplicam, mesmo se o Cron disparar duas vezes (chave única por alerta).

## Histórico (planilha) e Análise

**Importar:** aba **Importar** → escolha o lançamento e a página de captura → selecione a planilha
inteira em **.xlsx** (Google Sheets → Arquivo → Fazer download → Microsoft Excel). O painel lê todas as
abas e marca sozinho as que são **Leads** e **Entradas no grupo**; abas que parecem cópia ("Copia de…")
ou sem Fecha/Hora/Telefono ficam desmarcadas. Confira e clique em **Importar**. Também aceita .csv
(uma aba por vez).

- Colunas usadas: Fecha, Hora, Experiencia, Telefono, Campana (→ utm_campaign), Anuncio (→ utm_content),
  utm_source, utm_medium, utm_term, Landing, Pagina de gracias, Grupo. CHEQUEO e Pais são ignoradas
  (o país é calculado pelo DDI).
- Data/hora interpretadas no horário do Uruguai.
- Telefones com lixo são limpos (`598...,`, `598...#96`, `54+549...`). Linhas sem telefone válido são
  listadas e ignoradas.
- Reimportar a planilha atualizada é seguro: não duplica, só atualiza a coluna Grupo.
- Para os leads da planilha, "no grupo" vem da coluna Grupo; se o Sendflow tiver dados da pessoa,
  eles prevalecem.

**Análise:** taxa de entrada no grupo quebrada por anúncio, conjunto, campanha, posicionamento,
canal, país, experiência, landing, página de obrigado, dia, hora do dia, dia da semana ou
lançamento, com filtros. As UTMs do Meta são quebradas assim:

| UTM | Formato | Vira |
|---|---|---|
| `utm_source` | `{conjunto}\|{anúncio}` | Conjunto, Anúncio |
| `utm_medium` | `{posicionamento}\|{campanha}` | Posicionamento, Campanha (Meta) |
| `utm_term` | `{anúncio}\|{id do anúncio}` | id do anúncio |
| `utm_content` | código curto (ex.: `105v15`) | Anúncio (agrupamento principal) |

Para os próximos lançamentos, a página de captura deve mandar os mesmos campos: além de nome,
e-mail, telefone e UTMs, os campos ocultos `experiencia`, `landing`, `pagina_obrigado` e `pagina_captura`.

## Páginas de captura (Trader / Nunca operou)

Cada lançamento usa duas páginas de captura. Cada inscrição guarda:

- **Página de captura** (`trader` ou `nunca_operou`): por onde a pessoa entrou.
- **Perfil real**, calculado pela resposta de experiência: "nunca…" = *Nunca operou*; qualquer outra
  resposta = *Já opera*.

A Visão geral mostra a tabela **Por página de captura** (leads, % no grupo, perfil e quantos estão
fora do público da página, ex.: quem entrou pela página Trader mas nunca operou). Na Análise há as
dimensões e filtros **Página de captura**, **Perfil real** e **Página × Perfil**.

- **Planilhas:** ao importar, escolha a página correspondente. Reimportar uma planilha já importada
  escolhendo a página preenche a página nas linhas existentes, sem duplicar.
- **Captura:** cada página manda o campo oculto `pagina_captura` com `trader` ou `nunca_operou`
  (no Elementor, campo Oculto com ID `pagina_captura` e valor fixo).

## Planilha "Nunca operou" e lista de entradas nos grupos

A planilha da página Nunca operou tem outras colunas: Edad, Genero, Respuesta_dinero e
Pagina_captura (a variante da página: Gen-Argentina, Jub-Uruguay...). Elas são importadas como
**faixa etária**, **gênero**, **disponibilidade de dinheiro** e **landing** (a Análise também mostra a
**variante**: Gen, Jub, Trader). Ela não tem a coluna Grupo (TRUE/FALSE): quem entrou no grupo vem da
aba **Leads Grupo** (Fecha, Hora, Telefono, Grupo), importada em **Importar → Entradas no grupo**.
Essa lista grava a data/hora real de entrada, então "no grupo" e "minutos até entrar" funcionam para
o histórico. Se o importador perceber que um arquivo de lista de grupo foi escolhido como "Leads",
ele avisa.

Cada pessoa conta uma vez por lançamento (a primeira inscrição): quem se inscreveu nas duas páginas
aparece na página em que se inscreveu primeiro.

Na captura, as páginas podem mandar também `faixa_etaria` (ou `edad`), `genero` e
`resposta_dinheiro` (ou `respuesta_dinero`).

## Reenvio automático (próxima etapa)

Ainda não implementado — aguardando a definição da ferramenta de envio. A base já está pronta:
`v_leads` com `status = 'fora_do_grupo'` é exatamente a lista de quem deve receber o link.
Enquanto isso, a Visão geral tem o botão **Baixar CSV de quem está fora do grupo**.

## Testes diários dos eventos Meta

Todo dia o painel confere se os eventos da Meta continuam certos e mostra o resultado em
**Alertas → Testes diários dos eventos Meta**. Se algo falhar aparece uma faixa vermelha no topo de
todas as páginas, um número no menu "Alertas", uma linha no histórico de alertas e um aviso no
WhatsApp (o mesmo envio dos alertas). Quando volta a funcionar, chega um aviso de "voltou".
Tudo vai como **teste**: a Meta recebe em "Eventos de teste" e nada entra nas campanhas.

**Servidor** (Cron da Vercel, 07:17 de Brasília, e botão "Rodar testes do servidor agora"):
- as 148 variações das regras (Lead Qualificado da General, Trader, Lead General/Trader,
  inválidos) contra o serviço de tracking, e o mesmo event_id 2× (tem que virar 1 evento);
- cada evento gravado em `eventos_meta`, enviado e aceito pela Meta (`events_received = 1`);
- a página do grupo enviando o "Lead" pela API de Conversões (modo teste da captura-grupo);
- o serviço de tracking configurado (pixel, token e registro).

**Navegador** (GitHub Actions, `.github/workflows/testes-eventos.yml`, 07:37 de Brasília):
abre a página do grupo e a página de obrigado da General num Chromium de verdade, preenche como
um lead e confere que o pixel dispara o MESMO evento com o MESMO event_id do servidor (a
deduplicação). O disparo do pixel é interceptado no navegador e não chega na Meta.

Variáveis:

| Onde | Variável | Valor |
|---|---|---|
| Painel (Vercel) | `TESTES_TOKEN` | um segredo longo qualquer (o mesmo nos 3 lugares) |
| captura-grupo (Vercel) | `TESTES_TOKEN` | o mesmo valor |
| captura-grupo (Vercel) | `META_TEST_EVENT_CODE` | código de "Eventos de teste" do pixel do grupo (Production) — só é usado em requisições de teste |
| tracking-eventos (Vercel) | `META_TEST_EVENT_CODE` | código de "Eventos de teste" do pixel da General |
| GitHub do painel → Settings → Secrets → Actions | `TESTES_TOKEN` | o mesmo valor |

Opcionais no painel: `TRACKING_EVENTOS_URL`, `TESTES_ORIGEM`, `CAPTURA_GRUPO_URL`. No GitHub
(Variables): `PAINEL_URL`, `GRUPO_URL`, `GENERAL_URL`. Banco: migração `014-testes-automaticos.sql`.

## Saúde na Meta (dados da própria Meta)

Aba **Saúde na Meta**: o painel pede ao serviço de tracking (`GET /api/meta-saude`, protegido
pelo `TESTES_TOKEN`) os números que a Meta calcula com o tráfego real do pixel — Dataset Quality API
(event_id no navegador e no servidor = deduplicação, cobertura da API de Conversões, qualidade
de correspondência, frequência de envio; média dos últimos 7 dias) e o volume de cada evento nas
últimas 24 h. O token da Meta fica só no serviço de tracking (é o mesmo do envio).
Atualiza todo dia às 07:47 (Cron) e pelo botão "Atualizar agora". Vai para o WhatsApp só se um
evento de lead tiver menos de 80% com event_id (a Meta pode contar em dobro) ou se a consulta falhar.
Variáveis: `TESTES_TOKEN` também no projeto tracking-eventos. Banco: migração `016-meta-saude.sql`.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher
npm run dev
npm test                      # testes dos parsers
npm run lint && npm run build
```

Reconstrução do banco do zero (000→N) num Postgres local, com checks e testes de comportamento:

```bash
PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/reconstruir.sh
```
