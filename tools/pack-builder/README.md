# Pack builder

Ferramenta **offline** que transforma edital + provas anteriores + gabaritos em um content pack
(`app/packs/<id>.json`) e em um relatório de revisão. Roda em Node 22, fora do site. É a única
etapa que usa LLM (classificação de questões por assunto), e mesmo essa é opcional: o arquivo
`classification.json` pode ser preenchido à mão.

```
node tools/pack-builder/cli.js init     packs-src/trt4-2026     # cria workspace + config.json modelo
#   edite config.json; coloque os PDFs em packs-src/trt4-2026/input/
node tools/pack-builder/cli.js extract  packs-src/trt4-2026     # PDF -> work/*.txt (pdftotext ou pdf.js)
node tools/pack-builder/cli.js parse    packs-src/trt4-2026     # questões + gabarito + itens do edital -> work/*.json
node tools/pack-builder/cli.js classify packs-src/trt4-2026     # LLM: questão -> assunto (precisa de ANTHROPIC_API_KEY)
node tools/pack-builder/cli.js assemble packs-src/trt4-2026     # pack + review.md + entrada em app/packs/index.json
```

`npm run test:builder` roda os testes com fixtures no formato dos cadernos da FCC.

## Fluxo e pontos de revisão humana

| Etapa | Saída | O que revisar |
|---|---|---|
| `extract` | `work/*.txt` | Se o texto veio vazio ou embaralhado (PDF escaneado, colunas), tente `--backend=pdfjs` ou OCR. |
| `parse` | `work/provas.json`, `work/edital.json`, `work/assuntos.json` | Contagem de questões por prova e por matéria; `anomalias`; nomes e profundidade dos assuntos. `assuntos.json` é seu: junte, divida, renomeie. Não é sobrescrito sem `--force`. |
| `classify` | `work/classification.json` | Itens com `confianca < 0,6` e `assunto_id: null`. Edite o JSON e rode `assemble` de novo. Retomável: só classifica o que falta. |
| `assemble` | `app/packs/<id>.json`, `review.md` | `review.md` lista tudo o que foi inferido: carga horária padrão, tipo padrão, questões sem assunto, desatualizadas. Ajustes por assunto vão em `overrides.json`. |

## config.json

- `estrutura_prova.materias[]`: além dos campos do pack, `aliases` (como a matéria aparece no
  caderno e no edital) e `tipo_default` (`lei_seca`, `doutrina`, `jurisprudencia`, `calculo`,
  `memorizacao`, `pratica`).
- `provas[]`: `tipo: "cargo"` (histórico do próprio cargo, por ano) ou `"banca"` (outros concursos da
  mesma banca, com `concurso`), `caderno`, `gabarito`, `fonte`, `total_questoes`.
- `edital`: `pdf`, `secao_inicio`/`secao_fim` para recortar o conteúdo do cargo no anexo.
- `classificacao`: `modelo` (padrão `claude-opus-5-5`), `lote`, `effort`, `confianca_minima`.

## Valores padrão (sempre listados em review.md)

- `carga_horaria_base` = 2 + 2 × profundidade + 0,5 × subitens, entre 2h e 24h.
- `tipo` = `tipo_default` da matéria.
- `prereq` vazio, `volatil` false. Preencha em `overrides.json`.

## Classificação com LLM

Usa `@anthropic-ai/sdk` com fallback de recusa habilitado; lotes de 10 questões por chamada,
candidatos restritos aos assuntos da matéria da questão. Custo típico: algumas centenas de tokens por
questão. A chave vai na variável `ANTHROPIC_API_KEY` (ou perfil do `ant auth login`); nunca no
repositório.
