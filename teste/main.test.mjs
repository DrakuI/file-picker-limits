import assert from "node:assert/strict";
import { test } from "node:test";

import { montar } from "./dubles.mjs";

const ARVORES = { data: ["jogadores/tokens/anao.webp", "worlds/mesa/npcs/vilao.png"], public: ["icons/svg/a.svg"] };

test("iniciar: registra configurações, menu, API e o limite; a mudança da lista atualiza as janelas", async () => {
  const dubles = montar({ arvores: ARVORES, papel: 1, pastas: [] });
  const { api, iniciar } = await import("../scripts/main.mjs");
  const { desinstalar } = await import("../scripts/restricao.mjs");
  assert.equal(dubles.ganchos.get("init")?.length, 1);
  iniciar();
  try {
    const pastas = dubles.registradas.get("file-picker-limits.pastas");
    assert.equal(pastas.scope, "world");
    assert.equal(pastas.config, false);
    assert.equal(pastas.type, Array);
    assert.deepEqual(pastas.default, []);
    const confiaveis = dubles.registradas.get("file-picker-limits.confiaveisLivres");
    assert.equal(confiaveis.scope, "world");
    assert.equal(confiaveis.config, true);
    assert.equal(confiaveis.default, false);
    const menu = dubles.menus.get("file-picker-limits.config");
    assert.equal(menu.restricted, true);
    assert.ok(menu.type.prototype instanceof globalThis.foundry.applications.api.ApplicationV2);
    assert.equal(globalThis.game.modules.get("file-picker-limits").api, api);
    assert.equal(api.limitado(), false);

    const seletor = new dubles.FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
    await seletor.render();
    assert.equal(seletor.target, "worlds/mesa/npcs");
    const novas = [{ fonte: "data", caminho: "jogadores", bucket: "" }];
    await globalThis.game.settings.set("file-picker-limits", "pastas", novas);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(api.limitado(), true);
    assert.equal(seletor.target, "jogadores");
    assert.deepEqual(api.pastas(), [{ fonte: "data", caminho: "jogadores", bucket: "" }]);
  } finally {
    desinstalar();
  }
});

test("textos: pt-BR e en têm as mesmas chaves, e todas as usadas no código existem", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const raiz = new URL("../", import.meta.url);
  const ler = async nome => JSON.parse(await readFile(new URL(`lang/${nome}.json`, raiz), "utf8"));
  const achatar = (objeto, prefixo = "") => Object.entries(objeto).flatMap(([chave, valor]) => {
    return typeof valor === "object" ? achatar(valor, `${prefixo}${chave}.`) : [`${prefixo}${chave}`];
  });
  const pt = achatar(await ler("pt-BR")).sort();
  const en = achatar(await ler("en")).sort();
  assert.deepEqual(pt, en);

  const usadas = new Set();
  for (const arquivo of await readdir(new URL("scripts/", raiz))) {
    const fonte = await readFile(new URL(`scripts/${arquivo}`, raiz), "utf8");
    for (const [chave] of fonte.matchAll(/PASTASJOGADORES(\.[A-Za-z]+)+/g)) usadas.add(chave);
    for (const [, chave] of fonte.matchAll(/texto\("([A-Za-z]+)"/g)) usadas.add(`PASTASJOGADORES.Config.${chave}`);
    for (const [, chave] of fonte.matchAll(/botao\("[A-Za-z]+", "[a-z-]+", "([A-Za-z]+)"\)/g)) {
      usadas.add(`PASTASJOGADORES.Config.${chave}`);
    }
  }
  usadas.delete("PASTASJOGADORES.Config");
  for (const chave of usadas) assert.ok(pt.includes(chave), `chave sem texto: ${chave}`);
  for (const chave of pt) assert.ok(usadas.has(chave), `texto sem uso: ${chave}`);
});

test("module.json: arquivos declarados existem", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const raiz = new URL("../", import.meta.url);
  const manifesto = JSON.parse(await readFile(new URL("module.json", raiz), "utf8"));
  assert.equal(manifesto.id, "file-picker-limits");
  const arquivos = [...manifesto.esmodules, ...manifesto.styles, ...manifesto.languages.map(l => l.path)];
  for (const arquivo of arquivos) await access(new URL(arquivo, raiz));
  assert.deepEqual(manifesto.languages.map(l => l.lang).sort(), ["en", "pt-BR"]);
});
