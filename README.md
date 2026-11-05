# Cronograma Inteligente · Mentorias 2G

Pitch interno do cronograma de estudos priorizado (TRT4 Técnico 2026 como exemplo).
App em **Vite + React 18 + TypeScript + Tailwind CSS v3**.

> Pesos da banca e horas por tópico são **ilustrativos** (demo).

## Rodar local

```bash
npm install
npm run dev
```

## Publicar (GitHub Pages)

O build sai em `docs/` e é versionado. Depois de qualquer mudança:

```bash
npm run build
```

Depois, faça commit da pasta `docs/` junto com o código.

GitHub → Settings → Pages → *Deploy from a branch* → branch deste código, pasta `/docs`.
Endereço: `https://thiago-harry.github.io/web/`. O repositório é público, então a página também é.

A proposta anterior (página estática com o método completo) fica em `public/proposta.html` → `https://thiago-harry.github.io/web/proposta.html`.

## Estrutura

- `src/data/editalTRT4Tecnico2026.ts` — 10 matérias, 99 tópicos do edital.
- `src/lib/pitch-planner.ts` — pesos, horas, seleção por pontos/hora, resumo por nível e roteiro diário.
- `src/pages/PitchCronograma.tsx` — a página.
- `src/components/ui/slider.tsx` — slider (Radix, estilo shadcn).
- `src/index.css` + `tailwind.config.ts` — tema escuro "Azul Tático & Gelo".
