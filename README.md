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

## Reenvio automático (próxima etapa)

Ainda não implementado — aguardando a definição da ferramenta de envio. A base já está pronta:
`v_leads` com `status = 'fora_do_grupo'` é exatamente a lista de quem deve receber o link.
Enquanto isso, a Visão geral tem o botão **Baixar CSV de quem está fora do grupo**.

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
