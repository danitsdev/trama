# Trama

Trama é um jogo social de agrupamento: cada desafio tem 16 palavras divididas em 4 grupos de 4. Qualquer pessoa pode criar uma Trama e mandar o link curto para os amigos.

A direção do MVP é **Conexo-first**: tema dark, tabuleiro compacto 4×4, ícones consistentes, tentativa errada com shake + desmarcação, onboarding curto e tentativas sem limite.

## O que funciona

- tabuleiro 4×4 responsivo;
- seleção muda de cor no próprio click;
- ao selecionar a quarta palavra, a tentativa é enviada automaticamente;
- arraste um quadrado sobre outro para trocar apenas os dois de lugar;
- tentativa correta revela o grupo;
- tentativa errada anima, mostra feedback e desmarca as quatro palavras;
- tentativas infinitas com contador;
- embaralhar e limpar seleção;
- onboarding no primeiro acesso e ajuda reabrível;
- criador com progresso `0/16`, validação e pré-visualização/jogo;
- links curtos via API Vercel + Postgres serverless;
- API local SQLite nativa para validar links curtos sem Postgres;
- fallback explícito para link `#p=` quando o servidor local não estiver disponível;
- suporte a acentos e caracteres Unicode;
- resultado compartilhável sem revelar as respostas.

## Arquitetura de compartilhamento

### Produção

```text
POST /api/puzzles
  recebe o puzzle validado
  salva o JSON no Postgres
  retorna um slug aleatório de 8 caracteres

GET /api/puzzles/:slug
  carrega o puzzle salvo

/p/:slug
  Vercel reescreve para o SPA
  o cliente busca o puzzle pela API
```

A partida continua no navegador. O servidor não guarda seleção, tentativas ou pontuação — apenas o puzzle necessário para abrir o link curto.

### Desenvolvimento local

O `npm run dev` instala um middleware local com SQLite nativo do Node e mantém o mesmo contrato da API de produção:

```text
POST /api/puzzles       -> salva em data/trama.local.sqlite
GET  /api/puzzles/:slug -> carrega o puzzle pelo slug curto
```

O arquivo é criado automaticamente, fica fora do Git e sobrevive a reinícios do Vite. Durante essa validação, o criador identifica o armazenamento como **SQLITE LOCAL**. O middleware requer Node `22.5+` (o ambiente atual usa Node 24). Se a API local estiver indisponível, o criador mostra claramente **MODO LOCAL** e gera o fallback `#p=`. Esse fallback não é usado em produção: no Vercel, uma falha da API aparece como erro para não esconder configuração incompleta.

## Configurar Postgres/Vercel

1. Crie um banco Postgres serverless, por exemplo Neon ou Supabase.
2. Execute [`db/schema.sql`](db/schema.sql) no banco — a API também usa `CREATE TABLE IF NOT EXISTS` como proteção.
3. Na Vercel, configure a variável de ambiente:

```text
DATABASE_URL=postgresql://...?...sslmode=require
```

4. Faça o deploy do projeto. O `vercel.json` já reescreve `/p/:slug` para o `index.html`.

O `.env.example` contém apenas o formato da variável; credenciais reais não devem entrar no Git.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

Para validar as funções da API sem gerar artefatos:

```bash
npm run typecheck:api
```

## Qualidade

```bash
npm test
npm run lint
npm run typecheck:api
npm run build
npm audit --omit=dev
```

A suíte atual cobre engine, codec, validação, rotas de slug, cliente da API, persistência SQLite, onboarding, seleção automática, tentativa errada, swap por arraste e publicação do link curto.

## Limitações conscientes do beta

- não há login, autoria, edição ou exclusão de puzzles;
- não há rate limiting/anti-spam no endpoint de criação;
- o slug é curto e difícil de adivinhar, mas não é uma camada de privacidade;
- o cliente recebe o puzzle completo para poder validar as jogadas, então um usuário técnico pode inspecionar as respostas;
- o banco persistente precisa ser conectado no projeto Vercel antes do link curto funcionar em produção.

## Stack

React 19, TypeScript, Vite, Vitest, Testing Library, Lucide React, SQLite nativo do Node no desenvolvimento, Neon serverless e Oxlint.
