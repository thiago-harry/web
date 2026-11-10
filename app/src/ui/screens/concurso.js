import { h, fmtDMY } from "../dom.js";
import { t } from "../strings.pt-BR.js";
import { btn, notice, tag, sectionHead } from "../components.js";

const dt = (k, v) => h("div", { class: "kv" }, h("dt", {}, k), h("dd", {}, v));

let confirmClear = false;

export function render(ctx) {
  const { app, actions } = ctx;
  const root = h("section", { class: "screen" }, sectionHead(t.concurso.titulo, t.concurso.sub));
  if (app.packsError) root.append(notice("error", t.app.erroPacks, " ", app.packsError));
  else if (!app.packs.length) root.append(notice("info", app.loading ? t.app.carregando : t.concurso.semPacks));

  const grid = h("div", { class: "cards" });
  for (const meta of app.packs) {
    const selected = app.packMeta?.id === meta.id && app.pack;
    grid.append(
      h(
        "article",
        { class: `card pack-card${selected ? " selected" : ""}` },
        h("div", { class: "pack-top" }, h("h2", { class: "h2" }, meta.nome), meta.status === "sintetico" ? tag(t.app.sintetico, "tag-warn") : null),
        h("p", { class: "muted" }, meta.orgao),
        h("dl", { class: "pack-meta" }, dt(t.concurso.banca, meta.banca), dt(t.concurso.cargo, meta.cargo), dt(t.concurso.prova, fmtDMY(meta.data_prova))),
        meta.descricao ? h("p", { class: "small" }, meta.descricao) : null,
        selected
          ? h(
              "p",
              { class: "small muted" },
              `${app.pack.estrutura_prova.total_questoes} ${t.concurso.questoes} · ${app.pack.assuntos.length} ${t.concurso.assuntos} · ${app.pack.nivelamento.itens.length} ${t.concurso.itens}`
            )
          : null,
        h(
          "div",
          { class: "card-actions" },
          selected
            ? btn(`${t.passos.nivelamento} →`, { kind: "primary", onClick: () => actions.go("nivelamento") })
            : btn(t.concurso.selecionar, { kind: "primary", onClick: () => actions.selectPack(meta.id) })
        )
      )
    );
  }
  root.append(grid);

  if (app.validation && !app.validation.ok) {
    root.append(
      notice(
        "error",
        h("p", {}, t.app.erroPack),
        h("ul", { class: "small" }, app.validation.errors.slice(0, 12).map((e) => h("li", {}, h("code", {}, e.path), " ", e.message)))
      )
    );
  }
  root.append(h("p", { class: "small muted" }, t.concurso.novoPack));

  if (app.pack) {
    root.append(
      h(
        "div",
        { class: "danger-zone" },
        confirmClear
          ? [
              h("span", { class: "small" }, t.app.limparConfirma),
              btn(t.app.sim, {
                kind: "danger",
                small: true,
                onClick: () => {
                  confirmClear = false;
                  actions.clearData();
                },
              }),
              btn(t.app.nao, {
                kind: "ghost",
                small: true,
                onClick: () => {
                  confirmClear = false;
                  ctx.rerender();
                },
              }),
            ]
          : btn(t.app.limpar, {
              kind: "ghost",
              small: true,
              onClick: () => {
                confirmClear = true;
                ctx.rerender();
              },
            })
      )
    );
  }
  return root;
}
