# Cronograma Inteligente · Mentorias 2G

Página de apresentação interna da proposta de cronograma de estudos priorizado por dados.

- **Camada 1 · Dossiê do concurso:** edital + perfil da banca + provas anteriores → prioridade de 1 a 5 por assunto (retorno esperado por hora de estudo).
- **Camada 2 · Nivelamento:** simulado diagnóstico ajusta as horas de cada assunto para o aluno.
- **Camada 3 · Prazo:** data da prova e horas disponíveis definem o que entra, o que fica parcial e o que fica de fora.

A página inclui um simulador com **dados fictícios**, só para demonstrar a mecânica.

## Arquivos

- `index.html` — página completa (HTML, CSS e JS num arquivo só, sem dependências externas).
- Dados do simulador: bloco `DISCIPLINAS` / `ASSUNTOS` no início do `<script>` em `index.html`.
- Parâmetros do modelo no mesmo bloco: `MULT` (multiplicadores do nivelamento), `CORTES` (faixas P5–P1) e `RESERVA` (fração para revisão).

## Publicação (GitHub Pages)

Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
O repositório é público: a página também fica pública.

## Ver localmente

Abrir `index.html` no navegador. Não precisa de servidor.
