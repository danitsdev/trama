# Trama

Jogo de conexões em que cada desafio reúne 16 palavras em quatro grupos. Crie uma Trama, publique um link curto e desafie outras pessoas sem revelar as respostas.

## Recursos

- tabuleiro responsivo com seleção, arraste e embaralhamento;
- dicas progressivas e histórico de tentativas;
- rascunhos salvos automaticamente no navegador;
- criação e compartilhamento por links curtos;
- catálogo de Tramas publicadas e progresso local;
- API Vercel com Postgres em produção e SQLite no desenvolvimento.

## Desenvolvimento

Requer [Node.js](https://nodejs.org/) 22.5 ou mais recente.

```bash
npm ci
npm run dev
```

Acesse `http://localhost:5173`. No ambiente local, a API usa automaticamente o arquivo ignorado `data/trama.local.sqlite`; não é necessário configurar um banco para começar.

## Verificação

```bash
npm test
npm run lint
npm run typecheck:api
npm run build
```

## Produção

A aplicação usa `DATABASE_URL` para persistir as Tramas em Postgres. Execute `db/schema.sql` no banco, configure a variável na Vercel e publique o projeto; o `vercel.json` já contém o build e as rotas necessárias.

## Stack

React, TypeScript, Vite, Vitest, Testing Library, Vercel Functions, Neon Postgres e SQLite.

## Contribuição

Issues e pull requests são bem-vindos. Antes de começar, consulte [CONTRIBUTING.md](CONTRIBUTING.md).
