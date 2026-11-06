# Cronograma Inteligente · Mentoria 2G

MVP de validação interna do gerador de cronograma de estudos. SPA em React 18 + Tailwind CSS + lucide-react.
Todo o produto está em **`src/App.jsx`** (arquivo único); o resto é scaffold Vite para rodar.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/
```

**No ar:** https://thiago-harry.github.io/web/mvp/

O GitHub Pages deste repositório publica a pasta `/docs` do branch `claude/funny-edison-whtbw7`
(o pitch fica em `/web/`). O MVP é servido de `docs/mvp/` desse branch, com cópia em `public/mvp/`
para sobreviver ao build do pitch. Para atualizar o MVP no ar:

```bash
npm run build
# copiar dist/ para docs/mvp/ e public/mvp/ no branch claude/funny-edison-whtbw7, commit e push
```

`.github/workflows/deploy.yml` (disparo manual) fica pronto para quando o `main` virar a fonte do Pages
(*Settings → Pages → Source: GitHub Actions*).

## Regras implementadas

| Fase | Entrada | Cálculo |
|---|---|---|
| 1 · Dossiê da Banca | Edital (questões × peso) + incidência histórica do assunto na banca | Pontos esperados = pontos da disciplina × incidência. Prioridade 1–5 por faixa (≥4 · ≥2,5 · ≥1,5 · ≥0,8 pts). P1 entra como descarte sugerido; cada assunto pode ser ligado/desligado. |
| 2 · Nivelamento | % de acerto no simulado diagnóstico → nível (≥75 Avançado · 50–74 Intermediário · <50 Iniciante), ajustável | Demanda = Σ prioridades dos assuntos ativos × fator de nível (1,6 · 1,0 · 0,5). "Horas realocadas" = diferença contra um plano com todas as disciplinas em Intermediário. |
| 3 · Prazo e carga | Data da prova, horas/dia, dias/semana, horário de início | Horas líquidas = dias de estudo até a véspera × horas/dia. Cada disciplina recebe horas proporcionais à demanda, em slots de 30 min alocados em passos de 1h, com arrasto de arredondamento entre semanas. |

Roteiro da Semana: blocos de até 2h com horário, assunto e tipo (Teoria / Questões / Revisão).
Assuntos de teoria seguem rodízio ponderado pela prioridade; revisões puxam assuntos estudados em semanas anteriores.
Nos últimos 14 dias (reta final), 70% da teoria migra para questões e revisão.

## Premissas do protótipo

- Edital, banca e simulado são **dados de exemplo** (`RAW_DISCIPLINES` em `src/App.jsx`). Trocar por dados reais é editar esse array.
- Sem backend e sem persistência: o estado vive na sessão do navegador.
- A semana 1 começa hoje; o dia da prova não recebe estudo.
- O componente usa só classes utilitárias padrão do Tailwind para layout; cores vêm de tokens CSS injetados pelo próprio componente (tema claro e escuro).
