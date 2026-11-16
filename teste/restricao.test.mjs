import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { montar } from "./dubles.mjs";
import { abrirComoJogador, atualizarAbertos, desinstalar, instalar } from "../scripts/restricao.mjs";

const ARVORES = {
  data: [
    "jogadores/tokens/anao.webp",
    "jogadores/tokens/elfa.webp",
    "jogadores/retratos/anao.png",
    "coleção/Icons/Baldurs Gate/espada.webp",
    "coleção/tokens/lobo.webp",
    "worlds/mesa/mapas/covil.webp",
    "worlds/mesa/npcs/vilao.png",
    "solto.png"
  ],
  public: [
    "icons/svg/mystery-man.svg",
    "icons/weapons/sword.webp",
    "ui/parchment.jpg"
  ]
};

const pasta = (caminho, fonte = "data", bucket = "") => ({ fonte, caminho, bucket });

/** Monta a cena com o módulo instalado. */
function cena(opcoes = {}) {
  const dubles = montar({ arvores: ARVORES, ...opcoes });
  instalar();
  return dubles;
}

afterEach(() => desinstalar());

/* -------------------------------------------- */

test("mestre: nada muda", async () => {
  const { FilePicker, servidor } = cena({ papel: 4, pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "worlds/mesa/npcs");
  assert.deepEqual(Object.keys(seletor.sources), ["data", "public"]);
  assert.deepEqual(seletor.context.files.map(f => f.name), ["vilao.png"]);
  assert.deepEqual(servidor.chamadas.at(-1).chaves.filter(c => typeof c === "symbol"), []);
});

test("jogador sem pastas na lista: nada muda", async () => {
  const { FilePicker } = cena({ pastas: [] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "worlds/mesa/npcs");
  assert.deepEqual(Object.keys(seletor.sources), ["data", "public"]);
});

test("jogador: abre na única pasta liberada quando o pedido está fora", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.activeSource, "data");
  assert.equal(seletor.target, "jogadores");
  assert.deepEqual(seletor.context.dirs.map(d => d.name), ["retratos", "tokens"]);
  assert.deepEqual(servidor.alvos, ["data:jogadores"]);
});

test("jogador: fica no pedido quando ele está dentro de uma pasta liberada", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({ current: "jogadores/tokens/anao.webp" });
  await seletor.render();
  assert.equal(seletor.target, "jogadores/tokens");
  assert.deepEqual(seletor.context.files.map(f => f.name), ["anao.webp", "elfa.webp"]);
  assert.deepEqual(servidor.alvos, ["data:jogadores/tokens"]);
});

test("jogador: com mais de uma pasta, abre na lista delas", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores"), pasta("coleção/Icons")] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["cole%C3%A7%C3%A3o/Icons", "jogadores"]);
  assert.deepEqual(seletor.context.files, []);
  assert.deepEqual(servidor.alvos, []);
});

test("jogador: voltar da pasta liberada mostra só as liberadas, sem consultar o servidor", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores/tokens")] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.equal(seletor.target, "jogadores/tokens");
  await seletor.browse("jogadores");
  assert.equal(seletor.target, "");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores/tokens"]);
  await seletor.browse("");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores/tokens"]);
  assert.deepEqual(servidor.alvos, ["data:jogadores/tokens"]);
});

test("jogador: caminho digitado fora das liberadas, com .. ou codificado, não chega ao servidor", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({});
  await seletor.render();
  const fora = [
    "worlds/mesa/npcs",
    "jogadores/../worlds/mesa/npcs",
    "jogadores/%2E%2E/worlds",
    "jogadores/..%2Fworlds",
    "jogadores\\..\\worlds",
    "/worlds",
    "..",
    "jogadoresX",
    "JOGADORES"
  ];
  for (const alvo of fora) {
    await seletor.browse(alvo);
    assert.equal(seletor.target, "", alvo);
    assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores"], alvo);
    assert.deepEqual(seletor.context.files, [], alvo);
  }
  assert.deepEqual(servidor.alvos, ["data:jogadores"]);
});

test("jogador: caminho digitado dentro das liberadas chega ao servidor na forma canônica", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("coleção/Icons")] });
  const seletor = new FilePicker({});
  await seletor.render();
  await seletor.browse("/coleção//Icons/Baldurs Gate/");
  assert.equal(seletor.target, "cole%C3%A7%C3%A3o/Icons/Baldurs%20Gate");
  assert.deepEqual(seletor.context.files.map(f => f.name), ["espada.webp"]);
  await seletor.browse("coleção/Icons/Baldurs Gate/../Baldurs Gate");
  assert.equal(seletor.target, "cole%C3%A7%C3%A3o/Icons/Baldurs%20Gate");
  assert.equal(servidor.alvos.at(-1), "data:cole%C3%A7%C3%A3o/Icons/Baldurs%20Gate");
});

test("a marca da navegação não chega ao servidor", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({});
  await seletor.render();
  await seletor.browse("jogadores/tokens", { render: false });
  assert.equal(servidor.chamadas.length, 2);
  for (const chamada of servidor.chamadas) {
    assert.deepEqual(chamada.chaves.filter(c => typeof c === "symbol"), []);
    assert.equal(chamada.opcoes.type, "any");
  }
});

test("buscas diretas de outros módulos passam intactas para o jogador", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores")] });
  const resultado = await FilePicker.browse("data", "worlds/mesa/mapas", { wildcard: true });
  assert.deepEqual(resultado.files, ["worlds/mesa/mapas/covil.webp"]);
  assert.deepEqual(servidor.chamadas.at(-1).opcoes, { wildcard: true });
  const semOpcoes = await FilePicker.browse("data", "worlds/mesa/npcs");
  assert.deepEqual(semOpcoes.files, ["worlds/mesa/npcs/vilao.png"]);
});

test("fontes: some a aba sem pasta liberada e a janela abre em uma fonte que tem", async () => {
  const { FilePicker } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({ current: "icons/svg/mystery-man.svg" });
  assert.equal(seletor.activeSource, "data");
  const outro = new FilePicker({ current: "icons/weapons/sword.webp" });
  assert.equal(outro.activeSource, "public");
  await outro.render();
  assert.deepEqual(outro.tabs, ["data"]);
  assert.equal(outro.activeSource, "data");
  assert.equal(outro.target, "jogadores");
});

test("fontes: com pasta nas duas, as duas abas ficam e cada uma lista as suas", async () => {
  const { FilePicker, servidor } = cena({ pastas: [pasta("jogadores"), pasta("icons", "public")] });
  const seletor = new FilePicker({ current: "icons/weapons/sword.webp" });
  await seletor.render();
  assert.deepEqual(seletor.tabs, ["data", "public"]);
  assert.equal(seletor.activeSource, "public");
  assert.equal(seletor.target, "icons/weapons");
  await seletor.browse("ui");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["icons"]);
  seletor.activeSource = "data";
  await seletor.browse(seletor.source.target);
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores"]);
  assert.deepEqual(servidor.alvos, ["public:icons/weapons"]);
});

test("fontes: favorito de fonte escondida não quebra a navegação", async () => {
  const { FilePicker } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({});
  await seletor.render();
  seletor.activeSource = "public";
  await seletor.browse("icons");
  assert.equal(seletor.activeSource, "data");
  assert.equal(seletor.target, "");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores"]);
});

test("pasta liberada apagada do servidor: avisa e cai na lista das liberadas", async () => {
  const { FilePicker, avisos } = cena({ pastas: [pasta("sumiu")] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /does not exist/);
  assert.equal(seletor.target, "");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["sumiu"]);
});

test("favoritos: só os de dentro das pastas liberadas, sem alterar os gravados", async () => {
  const favoritos = {
    "data-/": { source: "data", path: "/", label: "root" },
    "data-worlds/mesa/": { source: "data", path: "worlds/mesa/", label: "mesa" },
    "data-jogadores/tokens/": { source: "data", path: "jogadores/tokens/", label: "tokens" },
    "public-icons/": { source: "public", path: "icons/", label: "icons" }
  };
  const { FilePicker } = cena({ pastas: [pasta("jogadores")], favoritos });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.deepEqual(Object.keys(seletor.context.favorites), ["data-jogadores/tokens/"]);
  assert.equal(Object.keys(favoritos).length, 4);
  assert.equal(Object.keys(seletor.favorites).length, 4);
});

test("criar pasta e enviar: só dentro das pastas liberadas", async () => {
  const { FilePicker } = cena({ pastas: [pasta("jogadores"), pasta("coleção/Icons")] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.equal(seletor.target, "");
  assert.equal(seletor.canCreateFolder, false);
  assert.equal(seletor.canUpload, false);
  await seletor.browse("jogadores/tokens");
  assert.equal(seletor.canCreateFolder, true);
  assert.equal(seletor.canUpload, true);
  assert.equal(seletor.context.canUpload, true);
});

test("criar pasta: a regra do Foundry continua valendo dentro das liberadas", async () => {
  const { FilePicker } = cena({ pastas: [pasta("worlds")] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.equal(seletor.target, "worlds");
  assert.equal(seletor.canCreateFolder, false);
});

test("lista das liberadas: nomes repetidos aparecem com o caminho inteiro", async () => {
  const pastas = [pasta("jogadores/tokens"), pasta("coleção/tokens"), pasta("worlds/mesa/mapas")];
  const { FilePicker } = cena({ pastas });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.deepEqual(seletor.context.dirs.map(d => d.name), ["coleção/tokens", "jogadores/tokens", "mapas"]);
  await seletor.browse("worlds/mesa/mapas");
  assert.deepEqual(seletor.context.files.map(f => f.name), ["covil.webp"]);
});

test("fonte inteira liberada: navega por tudo naquela fonte", async () => {
  const { FilePicker } = cena({ pastas: [pasta("", "public"), pasta("jogadores")] });
  const seletor = new FilePicker({ current: "ui/parchment.jpg" });
  await seletor.render();
  assert.equal(seletor.activeSource, "public");
  assert.equal(seletor.target, "ui");
  await seletor.browse("");
  assert.deepEqual(seletor.context.dirs.map(d => d.name), ["icons", "ui"]);
});

test("jogador confiável: limitado por padrão, livre com a configuração", async () => {
  const limitada = cena({ papel: 2, pastas: [pasta("jogadores")] });
  const a = new limitada.FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await a.render();
  assert.equal(a.target, "jogadores");
  desinstalar();
  const livre = cena({ papel: 2, pastas: [pasta("jogadores")], confiaveisLivres: true });
  const b = new livre.FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await b.render();
  assert.equal(b.target, "worlds/mesa/npcs");
});

test("mestre assistente: nunca limitado", async () => {
  const { FilePicker } = cena({ papel: 3, pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "worlds/mesa/npcs");
});

test("mudança da lista com a janela aberta: passa a valer e deixa de valer na hora", async () => {
  const { FilePicker, configuracoes } = cena({ pastas: [] });
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "worlds/mesa/npcs");

  configuracoes.set("file-picker-limits.pastas", [pasta("jogadores")]);
  atualizarAbertos();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seletor.target, "jogadores");
  assert.deepEqual(Object.keys(seletor.sources), ["data"]);

  configuracoes.set("file-picker-limits.pastas", [pasta("jogadores"), pasta("icons", "public")]);
  atualizarAbertos();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seletor.target, "jogadores");
  assert.deepEqual(Object.keys(seletor.sources).sort(), ["data", "public"]);

  configuracoes.set("file-picker-limits.pastas", []);
  atualizarAbertos();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Object.keys(seletor.sources).sort(), ["data", "public"]);
  await seletor.browse("worlds/mesa/npcs");
  assert.equal(seletor.target, "worlds/mesa/npcs");
});

test("S3: lista só as pastas do bucket em uso", async () => {
  const dubles = montar({
    arvores: { data: ["a/x.png"], "s3:mesa": ["arte/npc/x.png", "segredo/y.png"], "s3:outro": ["mapas/z.png"] },
    pastas: [pasta("arte", "s3", "mesa"), pasta("mapas", "s3", "outro")],
    fontes: ["data", "s3"]
  });
  instalar();
  const seletor = new dubles.FilePicker({});
  await seletor.render();
  assert.equal(seletor.activeSource, "s3");
  assert.equal(seletor.source.bucket, "mesa");
  assert.equal(seletor.target, "arte");
  assert.deepEqual(seletor.tabs, ["s3"]);
  await seletor.browse("segredo");
  assert.equal(seletor.target, "");
  assert.equal(seletor.source.bucket, "mesa");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["arte"]);
  seletor.sources.s3.bucket = "outro";
  await seletor.browse("/");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["mapas"]);
  assert.equal(seletor.source.bucket, "outro");
});

test("ver como jogador: o mestre abre um seletor limitado, sem afetar os outros", async () => {
  const { FilePicker, instancias } = cena({ papel: 4, pastas: [pasta("jogadores")] });
  const previa = await abrirComoJogador();
  assert.equal(previa.id, "file-picker");
  assert.equal(previa.title, "PASTASJOGADORES.Config.VerComoJogador");
  assert.equal(previa.target, "jogadores");
  assert.deepEqual(previa.tabs, ["data"]);
  await previa.browse("worlds");
  assert.deepEqual(previa.context.dirs.map(d => d.path), ["jogadores"]);
  assert.equal(instancias.get(previa.id), previa);
  assert.equal(await abrirComoJogador(), previa);
  assert.equal(previa.trazido, true);

  const normal = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await normal.render();
  assert.equal(normal.target, "worlds/mesa/npcs");
  assert.equal(normal.title, "FILES.Titleany");
  await normal.close();
});

test("ver como jogador: abre de novo depois de fechada ou de perder o lugar para outro seletor", async () => {
  const { FilePicker, instancias } = cena({ papel: 4, pastas: [pasta("jogadores")] });
  const primeira = await abrirComoJogador();
  await primeira.close();
  const segunda = await abrirComoJogador();
  assert.notEqual(segunda, primeira);
  assert.equal(segunda.target, "jogadores");

  const normal = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await normal.render();
  assert.equal(instancias.get("file-picker"), normal);
  assert.equal(segunda.element.isConnected, false);
  const terceira = await abrirComoJogador();
  assert.notEqual(terceira, segunda);
  assert.equal(instancias.get("file-picker"), terceira);
  await terceira.browse("worlds/mesa/npcs");
  assert.deepEqual(terceira.context.dirs.map(d => d.path), ["jogadores"]);
  await terceira.close();
});

test("ver como jogador: sem o que só o mestre recebe do servidor", async () => {
  const { FilePicker } = cena({
    papel: 4,
    pastas: [pasta("jogadores")],
    privadas: ["jogadores/retratos", "worlds/mesa/npcs"]
  });
  const previa = await abrirComoJogador();
  assert.equal(previa.context.canTogglePrivacy, false);
  assert.deepEqual(previa.context.dirs.map(d => d.name), ["tokens"]);
  await previa.browse("jogadores/retratos");
  assert.deepEqual(previa.context.files, []);
  assert.deepEqual(previa.context.dirs, []);
  assert.equal(previa.context.noResults, true);
  await previa.close();

  const normal = new FilePicker({ current: "jogadores/tokens/anao.webp" });
  await normal.render();
  await normal.browse("jogadores");
  assert.equal(normal.context.canTogglePrivacy, true);
  assert.deepEqual(normal.context.dirs.map(d => d.name), ["retratos", "tokens"]);
});

test("ver como jogador: envio segue a permissão do papel Jogador", async () => {
  cena({ papel: 4, pastas: [pasta("jogadores")], enviam: [2, 3, 4] });
  const previa = await abrirComoJogador();
  assert.equal(previa.target, "jogadores");
  assert.equal(previa.canCreateFolder, false);
  assert.equal(previa.canUpload, false);
  await previa.close();
  desinstalar();
  cena({ papel: 4, pastas: [pasta("jogadores")] });
  const outra = await abrirComoJogador();
  assert.equal(outra.canUpload, true);
  await outra.close();
});

test("jogador sem permissão de envio: continua sem enviar dentro das liberadas", async () => {
  const { FilePicker } = cena({ papel: 1, pastas: [pasta("jogadores")], enviam: [2, 3, 4] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.equal(seletor.target, "jogadores");
  assert.equal(seletor.canUpload, false);
});

test("jogador: pasta privada dentro de uma liberada continua fora do alcance", async () => {
  const { FilePicker, avisos } = cena({ pastas: [pasta("jogadores")], privadas: ["jogadores/retratos"] });
  const seletor = new FilePicker({});
  await seletor.render();
  assert.deepEqual(seletor.context.dirs.map(d => d.name), ["tokens"]);
  await seletor.browse("jogadores/retratos");
  assert.equal(avisos.length, 1);
  assert.equal(seletor.target, "");
  assert.deepEqual(seletor.context.dirs.map(d => d.path), ["jogadores"]);
});

test("ver como jogador sem pastas na lista: seletor sem limite", async () => {
  cena({ papel: 4, pastas: [] });
  const previa = await abrirComoJogador();
  await previa.browse("worlds/mesa/npcs");
  assert.equal(previa.target, "worlds/mesa/npcs");
  await previa.close();
});

/* -------------------------------------------- */

/** Evento mínimo de envio de arquivo: escolha no campo de arquivo ("change") ou arquivo solto ("drop"). */
function eventoFalso(tipo, extras = {}) {
  return {
    type: tipo,
    barrado: false,
    target: { matches: seletor => seletor === "input[type=file]", value: "C:\\fakepath\\x.png" },
    preventDefault() {
      this.evitado = true;
    },
    stopImmediatePropagation() {
      this.barrado = true;
    },
    ...extras
  };
}

test("envio: barrado quando o endereço digitado sai das pastas liberadas", async () => {
  const { FilePicker, avisos } = cena({ pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({});
  const elemento = { campo: { value: "jogadores" }, ouvintes: [] };
  elemento.addEventListener = (tipo, funcao, captura) => elemento.ouvintes.push({ tipo, funcao, captura });
  elemento.querySelector = consulta => (consulta === "input[name=target]" ? elemento.campo : null);
  const disparar = evento => {
    for (const ouvinte of elemento.ouvintes) if (ouvinte.tipo === evento.type) ouvinte.funcao(evento);
    return evento;
  };
  seletor.element = elemento;
  await seletor.render();
  await seletor.render();
  assert.equal(elemento.ouvintes.length, 2);
  assert.ok(elemento.ouvintes.every(o => o.captura === true));

  assert.equal(disparar(eventoFalso("change")).barrado, false);
  elemento.campo.value = "jogadores/tokens";
  assert.equal(disparar(eventoFalso("drop", { dataTransfer: { files: [{}] } })).barrado, false);

  elemento.campo.value = "worlds/mesa";
  const troca = disparar(eventoFalso("change"));
  assert.equal(troca.barrado, true);
  assert.equal(troca.evitado, true);
  assert.equal(troca.target.value, "");
  elemento.campo.value = "jogadores/../worlds";
  assert.equal(disparar(eventoFalso("drop", { dataTransfer: { files: [{}] } })).barrado, true);
  assert.equal(avisos.length, 2);

  assert.equal(disparar(eventoFalso("drop", { dataTransfer: { files: [] } })).barrado, false);
  const outroCampo = eventoFalso("change");
  outroCampo.target.matches = () => false;
  assert.equal(disparar(outroCampo).barrado, false);
});

test("envio: o mestre não é barrado", async () => {
  const { FilePicker, avisos } = cena({ papel: 4, pastas: [pasta("jogadores")] });
  const seletor = new FilePicker({});
  const ouvintes = [];
  seletor.element = {
    addEventListener: (tipo, funcao) => ouvintes.push({ tipo, funcao }),
    querySelector: () => ({ value: "worlds/mesa" })
  };
  await seletor.render();
  const evento = eventoFalso("change");
  for (const ouvinte of ouvintes) if (ouvinte.tipo === "change") ouvinte.funcao(evento);
  assert.equal(evento.barrado, false);
  assert.equal(avisos.length, 0);
});

test("desinstalar devolve o FilePicker original", async () => {
  const { FilePicker } = montar({ arvores: ARVORES, pastas: [pasta("jogadores")] });
  const antes = {
    estatico: FilePicker.browse,
    instancia: FilePicker.prototype.browse,
    contexto: FilePicker.prototype._prepareContext,
    getter: Object.getOwnPropertyDescriptor(FilePicker.prototype, "canCreateFolder").get
  };
  instalar();
  assert.notEqual(FilePicker.browse, antes.estatico);
  assert.notEqual(FilePicker.prototype.browse, antes.instancia);
  desinstalar();
  assert.equal(FilePicker.browse, antes.estatico);
  assert.equal(FilePicker.prototype.browse, antes.instancia);
  assert.equal(FilePicker.prototype._prepareContext, antes.contexto);
  assert.equal(Object.getOwnPropertyDescriptor(FilePicker.prototype, "canCreateFolder").get, antes.getter);
  const seletor = new FilePicker({ current: "worlds/mesa/npcs/vilao.png" });
  await seletor.render();
  assert.equal(seletor.target, "worlds/mesa/npcs");
});
