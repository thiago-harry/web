# Cronograma Direcionado · `app/`

Evolução do MVP (`src/App.jsx`, publicado em `/web/mvp/`) para um gerador de cronogramas
vendável. Vanilla JS, ES modules, sem build step. Este diretório segue a spec
"Cronograma Direcionado"; o MVP permanece intacto como referência.

## Estado: Fase 1 (engine) — aguardando aprovação para a Fase 2 (UI)

```
app/
  src/engine/
    schema.js     validação do content pack (estrutural + semântica)
    score.js      Quadros A/B/C -> prioridade P por assunto, com breakdown
    allocate.js   P + disponibilidade -> cronograma semana a semana
    revision.js   revisão espaçada (1, 7, 21, 60 dias)
    explain.js    "motivo" de cada bloco (templates, sem LLM)
    dates.js      aritmética de datas em UTC
    index.js      API pública: generate({ pack, nivelamento, disponibilidade, options })
  packs/
    _schema.json  JSON Schema do pack (gerado de PACK_SCHEMA; o teste garante sincronia)
    _fixture.json pack sintético: 3 matérias, 12 assuntos, 2 provas do cargo, 1 da banca
  tests/engine.test.js   node --test
  scripts/report.js      tabela de P + primeiras semanas do roteiro
```

```bash
npm run test:engine     # 17 testes, sem dependências
npm run report:engine   # relatório do gate da Fase 1
```

A engine não toca o DOM e não faz rede. Constantes de scoring vêm da spec (§3);
constantes de alocação que a spec não fixa estão marcadas `NOT IN SPEC` em
`ALLOCATION_DEFAULTS` (`allocate.js`).

## Decisões tomadas onde a spec não dizia

- **Capacidade para conteúdo novo** = horas úteis − reta final − simulados − reserva de revisões.
  Os orçamentos (§4.2) são distribuídos sobre essa capacidade; sobre a capacidade total,
  os assuntos de menor P nunca abriam.
- **`provas_banca`** (novo campo opcional do pack): totais das provas da banca, necessários
  para o denominador de B. `incidencia_banca[].concurso` referencia esse array.
- **Abertura de assuntos** é "just-in-time": mantém 2 assuntos ativos de matérias diferentes
  e abre outro só quando há capacidade ociosa, respeitando ≤ 2 novos/semana. Se o teto
  deixaria o dia vazio, ele é relaxado e registrado em `avisos` (`cap_novos_relaxado`).
- **Pré-requisito** precisa estar *aberto* (não concluído) para o dependente abrir.
- **Buffer de 10 %** aplicado por semana, com arrasto do arredondamento entre semanas.
- **Teto de 15 % para revisões** é estrito por semana; semanas menores que um bloco acumulam.
- **Sobra** de capacidade fora da reta final fica livre (`leftover: "free"`); `"second_pass"`
  preenche com blocos 30/70 por prioridade.
- **Capacidade insuficiente**: retorna `cobertura_parcial` sem cronograma (spec);
  `options.allocate.accept_cut = true` gera o cronograma sem os assuntos cortados.
