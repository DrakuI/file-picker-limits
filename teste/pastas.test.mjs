import assert from "node:assert/strict";
import { test } from "node:test";

import { montar } from "./dubles.mjs";
import { adicionarPasta, lerPastas, removerPasta, usuarioLimitado, usuarioSujeito } from "../scripts/pastas.mjs";

const ARVORES = {
  data: [
    "jogadores/tokens/anao.webp",
    "jogadores/retratos/anao.png",
    "coleção/Icons/Baldurs Gate/espada.webp",
    "v1.2/notas/a.txt",
    "solto.png"
  ],
  public: ["icons/svg/mystery-man.svg"]
};

const pasta = (caminho, fonte = "data", bucket = "") => ({ fonte, caminho, bucket });

test("adicionarPasta: grava o caminho canônico da pasta escolhida", async () => {
  montar({ arvores: ARVORES, papel: 4 });
  const retorno = await adicionarPasta({ fonte: "data", caminho: "cole%C3%A7%C3%A3o/Icons/Baldurs%20Gate" });
  assert.equal(retorno.estado, "adicionada");
  assert.deepEqual(lerPastas(), [pasta("coleção/Icons/Baldurs Gate")]);
  await adicionarPasta({ fonte: "public", caminho: "icons" });
  assert.deepEqual(lerPastas(), [pasta("coleção/Icons/Baldurs Gate"), pasta("icons", "public")]);
});

test("adicionarPasta: pasta já coberta não entra de novo", async () => {
  montar({ arvores: ARVORES, papel: 4, pastas: [pasta("jogadores")] });
  const retorno = await adicionarPasta({ caminho: "jogadores/tokens" });
  assert.equal(retorno.estado, "coberta");
  assert.deepEqual(retorno.por, pasta("jogadores"));
  assert.deepEqual(lerPastas(), [pasta("jogadores")]);
  assert.equal((await adicionarPasta({ caminho: "jogadores" })).estado, "coberta");
});

test("adicionarPasta: a pasta nova absorve as que estão dentro dela", async () => {
  const pastas = [pasta("jogadores/tokens"), pasta("icons", "public"), pasta("jogadores/retratos")];
  montar({ arvores: ARVORES, papel: 4, pastas });
  const retorno = await adicionarPasta({ caminho: "jogadores" });
  assert.equal(retorno.estado, "adicionada");
  assert.deepEqual(lerPastas(), [pasta("icons", "public"), pasta("jogadores")]);
});

test("adicionarPasta: caminho de arquivo vira a pasta que o contém", async () => {
  montar({ arvores: ARVORES, papel: 4 });
  const retorno = await adicionarPasta({ caminho: "jogadores/tokens/anao.webp" });
  assert.equal(retorno.estado, "adicionada");
  assert.deepEqual(retorno.pasta, pasta("jogadores/tokens"));
});

test("adicionarPasta: pasta com ponto no nome entra como pasta", async () => {
  montar({ arvores: ARVORES, papel: 4 });
  const retorno = await adicionarPasta({ caminho: "v1.2" });
  assert.deepEqual(retorno.pasta, pasta("v1.2"));
});

test("adicionarPasta: recusa o que não existe e nunca libera a raiz por um arquivo", async () => {
  const { servidor } = montar({ arvores: ARVORES, papel: 4 });
  assert.equal((await adicionarPasta({ caminho: "nao-existe" })).estado, "invalida");
  assert.equal((await adicionarPasta({ caminho: "jogadores/sumiu" })).estado, "invalida");
  assert.equal((await adicionarPasta({ caminho: "solto.png" })).estado, "invalida");
  assert.equal((await adicionarPasta({ caminho: "../fora" })).estado, "invalida");
  assert.deepEqual(lerPastas(), []);
  assert.ok(!servidor.alvos.includes("data:"));
});

test("adicionarPasta: a raiz escolhida diretamente libera a fonte inteira", async () => {
  montar({ arvores: ARVORES, papel: 4, pastas: [pasta("icons/svg", "public"), pasta("jogadores")] });
  const retorno = await adicionarPasta({ fonte: "public", caminho: "" });
  assert.equal(retorno.estado, "adicionada");
  assert.deepEqual(lerPastas(), [pasta("jogadores"), pasta("", "public")]);
});

test("removerPasta: tira só a pasta pedida", async () => {
  montar({ arvores: ARVORES, papel: 4, pastas: [pasta("jogadores"), pasta("icons", "public")] });
  assert.equal(await removerPasta({ fonte: "data", caminho: "icons" }), false);
  assert.equal(await removerPasta({ fonte: "public", caminho: "icons", bucket: "" }), true);
  assert.deepEqual(lerPastas(), [pasta("jogadores")]);
  assert.equal(await removerPasta({ fonte: "data", caminho: "jogadores" }), true);
  assert.deepEqual(lerPastas(), []);
});

test("lerPastas: valor inválido ou configuração não registrada vira lista vazia", () => {
  const { configuracoes } = montar({ arvores: ARVORES, pastas: "lixo" });
  assert.deepEqual(lerPastas(), []);
  configuracoes.delete("file-picker-limits.pastas");
  assert.deepEqual(lerPastas(), []);
});

test("usuarioSujeito e usuarioLimitado: por papel, configuração e lista", () => {
  const casos = [
    { papel: 0, sujeito: true },
    { papel: 1, sujeito: true },
    { papel: 2, sujeito: true },
    { papel: 2, confiaveisLivres: true, sujeito: false },
    { papel: 3, sujeito: false },
    { papel: 4, sujeito: false }
  ];
  for (const { papel, confiaveisLivres = false, sujeito } of casos) {
    montar({ arvores: ARVORES, papel, confiaveisLivres, pastas: [pasta("jogadores")] });
    assert.equal(usuarioSujeito(), sujeito, `papel ${papel}`);
    assert.equal(usuarioLimitado(), sujeito, `papel ${papel}`);
  }
  montar({ arvores: ARVORES, papel: 1, pastas: [] });
  assert.equal(usuarioSujeito(), true);
  assert.equal(usuarioLimitado(), false);
  globalThis.game.user = null;
  assert.equal(usuarioSujeito(), false);
});
