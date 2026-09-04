# Contribuindo com o Trama

Obrigado pelo interesse em melhorar o projeto.

## Antes de começar

1. Procure uma issue existente ou abra uma nova para alinhar mudanças maiores.
2. Faça um fork e crie uma branch a partir de `main`.
3. Use Node.js 22.5 ou mais recente e instale as dependências com `npm ci`.

## Durante o desenvolvimento

- mantenha cada pull request pequeno e focado;
- preserve a experiência responsiva e a acessibilidade;
- não inclua credenciais, arquivos `.env`, bancos locais ou artefatos de build;
- adicione ou atualize testes quando o comportamento mudar;
- evite mudanças de schema sem uma migração e uma explicação no pull request.

Execute antes de enviar:

```bash
npm test
npm run lint
npm run typecheck:api
npm run build
```

## Pull requests

Explique o problema, a solução e como a alteração foi validada. Inclua imagens para mudanças visuais e informe limitações ou decisões que mereçam revisão.

Falhas de segurança não devem ser publicadas em issues. Entre em contato diretamente com o mantenedor pelo perfil do GitHub.
