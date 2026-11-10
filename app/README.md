# Cronograma Direcionado · `app/`

Evolução do MVP (`src/App.jsx`, publicado em `/web/mvp/`) para um gerador de cronogramas
vendável. Vanilla JS, ES modules, sem build step, sem rede em runtime (só os JSONs do próprio
site). Segue a spec "Cronograma Direcionado"; o MVP permanece intacto como referência.

**No ar:** https://thiago-harry.github.io/web/app/

## Estado

| Fase | Entrega | Status |
|---|---|---|
| 1 | Engine (schema, score, allocate, revision, explain) + testes | concluída |
| 2 | UI das 5 telas | concluída |
| 3 | Export PDF (impressão) / .ics / .csv | concluída · página de vendas pendente (precisa de copy e link de checkout) |
| 4 | Pack real | pendente (curadoria humana; ver "pack builder" abaixo) |

```
app/
  index.html
  src/
    engine/            puro, sem DOM: schema, score, allocate, revision, explain, quiz, dates, index
    ui/
      main.js          roteador por hash, estado, chamadas memoizadas à engine
      screens/         concurso · nivelamento · disponibilidade · diagnostico · cronograma
      components.js    bolinhas de nível, botões, KPIs, segmented…
      export.js        .csv, .ics, horários dos blocos
      strings.pt-BR.js todas as strings de UI
      styles.css       tokens claro/escuro, layout, impressão
    state.js           localStorage `cron:v1:<concurso_id>`, versionado
  packs/
    index.json         lista de concursos exibida na tela 1
    _schema.json       JSON Schema do pack (gerado de PACK_SCHEMA; teste garante sincronia)
    _fixture.json      pack sintético: 3 matérias, 12 assuntos, 60 questões fictícias
  tests/engine.test.js node --test (22 testes)
  scripts/report.js    tabela de P + primeiras semanas
```

```bash
npm run test:engine
npm run report:engine
cd app && python3 -m http.server 8787   # ou qualquer servidor estático
```

## O que cada tela faz

1. **Concurso**: cards de `packs/index.json`. Selecionar carrega e valida o pack.
2. **Nivelamento**: simulado de 40 questões (amostra determinística do pack, estratificada pelo
   peso do edital) e/ou autoavaliação 0–4 + "nunca estudei", com atalhos de teclado e
   preenchimento por matéria. Os dois se combinam (híbrido).
3. **Disponibilidade**: horas por dia da semana em três modos editáveis (Normal 14h, Hard 28h,
   Super hard 42h por semana), data de início, data da prova (ou meta), horário de início em dias
   úteis e fim de semana, opção de preencher a sobra com questões. Prévia da capacidade e aviso
   de cobertura parcial.
4. **Diagnóstico**: três quadros por assunto (A histórico, B edital, C você) em 5 níveis de
   probabilidade, Δ de posição, horas orçadas, tempo médio; por matéria: questões × peso = pontos,
   % da prova, eliminatória/nota mínima. Clique no assunto abre a decomposição de P e o motivo.
5. **Cronograma**: semana a semana, filtro por matéria, motivo por bloco, avisos do gerador.
   Exporta impressão/PDF (todas as semanas, com caixa "Feito"), .ics e .csv.

## Decisões tomadas onde a spec não dizia

- **Capacidade para conteúdo novo** = horas úteis − reta final − simulados − reserva de revisões.
  Os orçamentos (§4.2) são distribuídos sobre essa capacidade.
- **Teto de assuntos novos/semana** = max(2, assuntos restantes ÷ semanas antes da reta final).
- **Peso por matéria** (`materias[].peso`, opcional, default 1): E usa questões × peso.
- **`provas_banca`** (opcional): totais das provas da banca para o denominador de B.
- **Nível 1–5** = P ÷ P máximo em faixas de 20% (≥0,8 → 5 … <0,2 → 1); por matéria, soma de P.
- **Simulado**: 40 itens, ≥1 por assunto com itens, resto proporcional ao peso do edital;
  amostra determinística por `concurso.id + pack_version`.
- **Sobra** fora da reta final: UI liga por padrão a segunda passada (30/70); engine mantém `free`.
- **Buffer de 10 %** por semana com arrasto; **15 % de revisões** estrito, semanas pequenas acumulam.
- **Capacidade insuficiente**: tela mostra déficit e assuntos cortados; "gerar mesmo assim" usa
  `accept_cut`.
- Constantes fora da spec marcadas `NOT IN SPEC` em `ALLOCATION_DEFAULTS` (`allocate.js`).

## Publicação

O GitHub Pages do repositório serve `/docs` do branch `claude/funny-edison-whtbw7`. O app é copiado
para `docs/app/` e `public/app/` desse branch (como o MVP em `/mvp/`). Para republicar:

```bash
# no branch claude/funny-edison-whtbw7
rm -rf docs/app public/app && mkdir -p docs/app public/app
cp -r app/index.html app/src app/packs docs/app/ && cp -r app/index.html app/src app/packs public/app/
```

## Próximo passo sugerido: pack builder (Fase 4)

Ferramenta offline (fora de `app/`): edital PDF + provas anteriores + gabaritos → LLM estrutura
assuntos e classifica questões → rascunho de `packs/<concurso>.json` com `fonte` e flag de
confiança → revisão humana → commit. Também gera `nivelamento.itens` a partir das provas oficiais.
