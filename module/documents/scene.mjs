/**
 * Scenes of the system (author, 2026-11-15): «Create Scene» asks what the new scene is — «Битва» (the default) or «Мапа».
 * A battle gets the «Бойова мапа» set-up (light sand, grid of 100 px, the `battleScene` flag), so the GM's «Битва» panel
 * shows there; a map is Foundry's own empty scene, which gets the «Мапа Пустки» panels (map-dock.mjs isBattleScene).
 * The choice is a field added to Foundry's own dialog; `create` reads it (marker `pustSceneKind`) and drops it.
 */
import { battleSceneData } from "../helpers/default-scene.mjs";
import { AUTO, SAND, SAND_NAME, BATTLE_BACKGROUNDS } from "../rules/battle-backgrounds.mjs";
import { bgChoice } from "../helpers/battle-background.mjs";

const KIND_FIELD = "pustSceneKind";

export class WastelandersScene extends foundry.documents.Scene {
  /** @override — Foundry's dialog with the «Що це за сцена» choice added (GM only; the hook catches this dialog's render) */
  static async createDialog(data = {}, createOptions = {}, options = {}, renderOptions = {}) {
    const id = Hooks.once("renderDialogV2", (dialog) => {
      const form = dialog.element?.querySelector("form");
      const grp = form?.querySelector("input[name='name']")?.closest(".form-group");
      if (!grp || form.querySelector(`[name='${KIND_FIELD}']`)) return;
      grp.insertAdjacentHTML("afterend", `<div class="form-group">
        <label>Тип сцени</label>
        <div class="form-fields"><select name="${KIND_FIELD}">
          <option value="battle" selected>Битва</option>
          <option value="map">Мапа</option>
        </select></div>
        <p class="hint">Битва: панель «Битва» із зонами, пісок і сітка «Бойової мапи». Мапа: панелі «Мапи Пустки», тло обереш сам.</p></div>`);
      dialog.setPosition?.({ height: "auto" });
    });
    try { return await super.createDialog(data, createOptions, options, renderOptions); }
    finally { Hooks.off("renderDialogV2", id); }
  }

  /** @override — a scene made from that dialog: a battle takes the battle map's set-up; the field never reaches the scene */
  static async create(data, operation = {}) {
    if (data && !Array.isArray(data) && KIND_FIELD in data) {
      const { [KIND_FIELD]: kind, ...rest } = data;
      if (kind === "battle") {
        const base = battleSceneData(game.system.id);
        delete base.name; delete base.navName;
        const made = foundry.utils.mergeObject(base, rest, { inplace: false });
        if (!made.name?.trim()) made.name = "Бойова мапа";
        return super.create(made, operation);
      }
      return super.create(rest, operation);
    }
    return super.create(data, operation);
  }
}

/** The scene's settings (author, 2026-11-15): «Тип сцени» under its name, to turn a map into a battle or back. Only the
 *  panels follow it (the `battleScene` flag): the scene's background and grid stay as they are. */
export function addSceneKindField(app, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  const doc = app.document;
  if (!root || !doc || !game.user.isGM) return;
  const name = root.querySelector('.tab[data-tab="basics"] input[name="name"]')?.closest(".form-group");
  if (!name || root.querySelector("[data-pust-scene-kind]")) return;
  const path = `flags.${game.system.id}.battleScene`;
  const on = !!doc.getFlag(game.system.id, "battleScene");
  name.insertAdjacentHTML("afterend", `<div class="form-group" data-pust-scene-kind>
    <label>Тип сцени</label>
    <div class="form-fields"><select name="${path}">
      <option value="${on ? doc.getFlag(game.system.id, "battleScene") : battleSceneData(game.system.id).flags[game.system.id].battleScene}" ${on ? "selected" : ""}>Битва</option>
      <option value="" ${on ? "" : "selected"}>Мапа</option>
    </select></div>
    <p class="hint">Битва: панель «Битва» із зонами. Мапа: панелі «Мапи Пустки». Тло й сітка сцени не змінюються.</p></div>`);
  // the battle scene's background (author, 2026-11-18): the same choice as beside «Місце» in the «Битва» panel
  if (!on) return;
  const bgPath = `flags.${game.system.id}.battleBg`;
  const cur = bgChoice(doc);
  const opt = (v, l) => `<option value="${v}" ${v === cur ? "selected" : ""}>${foundry.utils.escapeHTML(l)}</option>`;
  root.querySelector("[data-pust-scene-kind]").insertAdjacentHTML("afterend", `<div class="form-group" data-pust-scene-bg>
    <label>Фон сцени</label>
    <div class="form-fields"><select name="${bgPath}">
      ${opt(AUTO, "Авто за місцем")}${opt(SAND, SAND_NAME)}${BATTLE_BACKGROUNDS.map((b) => opt(b.key, b.name)).join("")}
    </select></div>
    <p class="hint">Авто: фон за «Місцем» панелі «Битва», власну картинку сцени не змінює. Інший пункт ставить вибраний фон.</p></div>`);
}
