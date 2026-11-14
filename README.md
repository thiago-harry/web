# Cronograma Personalizado para Você

MVP do produto, caso de estudo **PMSC 2026 · Soldado** (Instituto AOCP), com dados reais do edital e de provas
anteriores. SPA em React 18 + Tailwind CSS + lucide-react, sobre o engine determinístico de `app/src/engine`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
npm test         # engine + pack builder
```

**No ar:** https://thiago-harry.github.io/web/ (vira `/crono/` quando o repositório for renomeado)

O GitHub Pages deste repositório publica a pasta `/docs` do branch `claude/funny-edison-whtbw7`.
A cada push no `main`, `.github/workflows/publish.yml` reconstrói o MVP e o publica na raiz do site
(também em `/mvp/`, para links antigos) e copia `app/` para `/app/`. Nenhuma configuração manual do
Pages é necessária.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/App.jsx` | UI: dossiê, top 80%, nivelamento + simulado, prazo, agenda, comparativo |
| `src/plan.js` | Camada de produto sobre o engine: pontos esperados, top 80%, genérico × personalizado, capacidade por data, blocos de videoaula/leitura/exercícios, `.ics` |
| `src/pdf.js` | PDF A4 completo (jsPDF, carregado só no clique) |
| `src/theme.js` | Tokens claro/escuro e classes `cg-*` |
| `app/packs/pmsc-2026-soldado.json` | Content pack gerado por `tools/pack-builder` a partir de `packs-src/pmsc-2026/` |

## Fluxo

| Etapa | Entrada | Cálculo |
|---|---|---|
| 1 · Dossiê | Edital 2026 + prova PMSC 2023 (Cebraspe) + prova AOCP PM-PE 2024 | Prioridade P = (0,35·cargo + 0,20·banca + 0,45·edital) · (1+lacuna) · M; níveis 1–5 |
| Top 80% | Pontos esperados por assunto ÷ horas no nível do aluno | Assuntos em ordem de pontos por hora até somar 80% da prova |
| 2 · Nivelamento | Fraco/Médio/Forte por matéria + simulado de 40 questões (reais + geradas por IA, marcadas) | Lacuna por assunto (autoavaliação e simulado com encolhimento) |
| Reajustar | Botão no fim do nivelamento | Aplica o nivelamento ao plano e calcula a **carga sugerida**: menor carga (seg–sex x, sáb 1,5x, dom folga; teto 6h/9h/6h) que cobre 100% do top 80% até a prova |
| 3 · Carga | Sugestão, Normal/Hard/Super hard ou horas por dia; data do edital ou simulada | Capacidade do engine (folga 10%, reta final, revisões, simulados); **% do top 80% coberto** ao vivo e diferença contra a sugestão |
| 4 · Agenda | Escopo top 80% ou edital completo; −/+ 30 min em qualquer dia | Engine aloca semanas (exceções por data); teoria começa com videoaula e segue com leitura; depois exercícios; revisões 1/7/21/60 dias |
| 5 · Resultado | — | Curva de pontos cobertos por hora: genérico (ordem do edital, carga igual) × personalizado |

Exporta **PDF** (parâmetros, prioridades, comparativo, semanas com caixa "Feito", lista de videoaulas) e
**.ics** (Google Agenda › Configurações › Importar e exportar). Estado salvo no `localStorage` do navegador.

## Premissas

- Só prova objetiva (sem redação e sem TAF).
- Penal Militar, Legislação Especial e Trânsito não têm prova anterior no histórico: prioridade só pelo edital.
- Datas e conteúdo seguem o edital curado em 14/11/2026; confira atualizações no edital.

## Próxima geração: `app/`

`app/` é o **Cronograma Personalizado para Você**: content packs por concurso, scoring em três quadros,
alocação determinística e UI em 5 telas, sem build step. No ar em
https://thiago-harry.github.io/web/app/ · detalhes em `app/README.md`.
