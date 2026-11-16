import assert from "node:assert/strict";
import { test } from "node:test";

import {
  codificar, estaDentro, favoritoLiberado, fontesLiberadas, limparPastas, listagemLiberadas, normalizar,
  pastaQueContem, pontoDeEntrada, rotulosDaListagem
} from "../scripts/caminhos.mjs";

const pasta = (caminho, fonte = "data", bucket = "") => ({ fonte, caminho, bucket });

test("normalizar: barras, segmentos vazios e codificação", () => {
  assert.equal(normalizar(""), "");
  assert.equal(normalizar("/"), "");
  assert.equal(normalizar("assets/"), "assets");
  assert.equal(normalizar("/cole%C3%A7%C3%A3o//Icons/"), "coleção/Icons");
  assert.equal(normalizar("coleção/Icons/Baldurs%20Gate"), "coleção/Icons/Baldurs Gate");
  assert.equal(normalizar("a\\b\\c"), "a/b/c");
  assert.equal(normalizar(undefined), "");
  assert.equal(normalizar(null), "");
});

test("normalizar: resolve . e .. e recusa sair da raiz", () => {
  assert.equal(normalizar("jogadores/../worlds"), "worlds");
  assert.equal(normalizar("jogadores/./tokens"), "jogadores/tokens");
  assert.equal(normalizar("jogadores/%2E%2E/worlds"), "worlds");
  assert.equal(normalizar("jogadores/..%2Fworlds"), "worlds");
  assert.equal(normalizar("jogadores/..%5Cworlds"), "worlds");
  assert.equal(normalizar("jogadores\\..\\worlds"), "worlds");
  assert.equal(normalizar(".."), null);
  assert.equal(normalizar("a/../../b"), null);
  assert.equal(normalizar("a/.../b"), "a/.../b");
});

test("normalizar: % inválido fica literal; caminho canônico não é decodificado de novo", () => {
  assert.equal(normalizar("100% loot"), "100% loot");
  assert.equal(normalizar("a%2520b"), "a%20b");
  assert.equal(normalizar("a%20b", { codificado: false }), "a%20b");
});

test("codificar: formato do servidor e ida e volta", () => {
  assert.equal(codificar("coleção/Icons/Baldurs Gate"), "cole%C3%A7%C3%A3o/Icons/Baldurs%20Gate");
  assert.equal(codificar(""), "");
  for (const caminho of ["a%20b", "100% loot", "x/y z/ç", "a#b/c?d"]) {
    assert.equal(normalizar(codificar(caminho)), caminho);
  }
});

test("estaDentro: a própria pasta, descendentes, prefixos parecidos e raiz", () => {
  assert.equal(estaDentro("a/b", "a/b"), true);
  assert.equal(estaDentro("a/b/c", "a/b"), true);
  assert.equal(estaDentro("a/bc", "a/b"), false);
  assert.equal(estaDentro("a", "a/b"), false);
  assert.equal(estaDentro("qualquer/coisa", ""), true);
  assert.equal(estaDentro("", ""), true);
  assert.equal(estaDentro(null, "a"), false);
  assert.equal(estaDentro("A/B", "a/b"), false);
});

test("limparPastas: descarta malformadas, repetidas e contidas", () => {
  const limpa = limparPastas([
    pasta("jogadores/tokens"),
    pasta("jogadores"),
    pasta("jogadores"),
    pasta("icons", "public"),
    pasta("icons/svg", "public"),
    { fonte: "data" },
    { fonte: "", caminho: "x" },
    { fonte: "data", caminho: "../fora" },
    null,
    "texto",
    { fonte: "data", caminho: "/retratos//", bucket: "ignorado" },
    { fonte: "s3", caminho: "arte", bucket: "mesa" },
    { fonte: "s3", caminho: "arte/npc", bucket: "outro" }
  ]);
  assert.deepEqual(limpa, [
    pasta("jogadores"),
    pasta("icons", "public"),
    pasta("retratos"),
    pasta("arte", "s3", "mesa"),
    pasta("arte/npc", "s3", "outro")
  ]);
  assert.deepEqual(limparPastas(undefined), []);
  assert.deepEqual(limparPastas({}), []);
});

test("limparPastas: a fonte inteira absorve as demais pastas da fonte", () => {
  assert.deepEqual(limparPastas([pasta("a"), pasta(""), pasta("b", "public")]), [pasta(""), pasta("b", "public")]);
});

test("pastaQueContem: fonte, bucket e caminho", () => {
  const pastas = [pasta("jogadores"), pasta("icons", "public"), pasta("arte", "s3", "mesa")];
  assert.deepEqual(pastaQueContem(pastas, "data", "", "jogadores/tokens/a"), pasta("jogadores"));
  assert.equal(pastaQueContem(pastas, "data", "", "icons"), null);
  assert.equal(pastaQueContem(pastas, "public", "", "icons/svg")?.caminho, "icons");
  assert.equal(pastaQueContem(pastas, "data", "", ""), null);
  assert.equal(pastaQueContem(pastas, "data", "", null), null);
  assert.equal(pastaQueContem(pastas, "s3", "mesa", "arte/x")?.caminho, "arte");
  assert.equal(pastaQueContem(pastas, "s3", "outro", "arte/x"), null);
});

test("fontesLiberadas: só as fontes com pasta; sem nenhuma, a primeira", () => {
  const pastas = [pasta("icons", "public")];
  assert.deepEqual(fontesLiberadas(pastas, ["data", "public"]), ["public"]);
  assert.deepEqual(fontesLiberadas([pasta("a"), ...pastas], ["data", "public"]), ["data", "public"]);
  assert.deepEqual(fontesLiberadas([pasta("x", "s3", "b")], ["data", "public"]), ["data"]);
});

test("listagemLiberadas: formato do servidor, só com as pastas da fonte", () => {
  const pastas = [pasta("coleção/Icons"), pasta("jogadores"), pasta("icons", "public")];
  assert.deepEqual(listagemLiberadas(pastas, "data", "", [".png"]), {
    target: "",
    private: false,
    gridSize: null,
    dirs: ["cole%C3%A7%C3%A3o/Icons", "jogadores"],
    privateDirs: [],
    files: [],
    extensions: [".png"]
  });
  assert.deepEqual(listagemLiberadas(pastas, "public", undefined, undefined).dirs, ["icons"]);
  const s3 = listagemLiberadas([pasta("arte", "s3", "mesa"), pasta("mapas", "s3", "outro")], "s3", "mesa");
  assert.deepEqual(s3.dirs, ["arte"]);
  assert.equal(s3.bucket, "mesa");
});

test("pontoDeEntrada: mantém o pedido liberado", () => {
  const pastas = [pasta("jogadores"), pasta("icons", "public")];
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "public"], "data", "", "jogadores/tokens"),
    { fonte: "data", bucket: "", caminho: "jogadores/tokens" });
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "public"], "public", "", "icons/svg"),
    { fonte: "public", bucket: "", caminho: "icons/svg" });
});

test("pontoDeEntrada: fora das liberadas, a única pasta da fonte ou a lista delas", () => {
  const uma = [pasta("jogadores")];
  assert.deepEqual(pontoDeEntrada(uma, ["data", "public"], "data", "", "worlds/mesa/segredo"),
    { fonte: "data", bucket: "", caminho: "jogadores" });
  assert.deepEqual(pontoDeEntrada(uma, ["data", "public"], "data", "", "jogadores/../worlds"),
    { fonte: "data", bucket: "", caminho: "jogadores" });
  const duas = [pasta("jogadores"), pasta("retratos")];
  assert.deepEqual(pontoDeEntrada(duas, ["data", "public"], "data", "", ""),
    { fonte: "data", bucket: "", caminho: "" });
});

test("pontoDeEntrada: troca de fonte quando a pedida não tem pasta", () => {
  const pastas = [pasta("jogadores")];
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "public"], "public", "", "icons/svg"),
    { fonte: "data", bucket: "", caminho: "jogadores" });
  assert.deepEqual(pontoDeEntrada([pasta("icons", "public")], ["data", "public"], "data", "", "worlds"),
    { fonte: "public", bucket: "", caminho: "icons" });
});

test("pontoDeEntrada: S3 escolhe o bucket que tem pasta", () => {
  const pastas = [pasta("arte", "s3", "mesa"), pasta("mapas", "s3", "outro")];
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "s3"], "data", "", "worlds"),
    { fonte: "s3", bucket: "mesa", caminho: "arte" });
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "s3"], "s3", "outro", ""),
    { fonte: "s3", bucket: "outro", caminho: "mapas" });
  assert.deepEqual(pontoDeEntrada(pastas, ["data", "s3"], "s3", "vazio", ""),
    { fonte: "s3", bucket: "mesa", caminho: "arte" });
  assert.deepEqual(pontoDeEntrada(pastas, ["s3"], "s3", "", ""),
    { fonte: "s3", bucket: "mesa", caminho: "arte" });
});

test("favoritoLiberado: raiz, barra final e caminho codificado", () => {
  const pastas = [pasta("coleção/Icons")];
  assert.equal(favoritoLiberado(pastas, { source: "data", path: "/" }), false);
  assert.equal(favoritoLiberado(pastas, { source: "data", path: "assets/" }), false);
  assert.equal(favoritoLiberado(pastas, { source: "data", path: "cole%C3%A7%C3%A3o/Icons/Lol/" }), true);
  assert.equal(favoritoLiberado(pastas, { source: "public", path: "coleção/Icons/" }), false);
  assert.equal(favoritoLiberado(pastas, null), false);
  assert.equal(favoritoLiberado([pasta("")], { source: "data", path: "/" }), true);
});

test("rotulosDaListagem: último segmento, ou o caminho inteiro quando ele se repete", () => {
  const rotulos = rotulosDaListagem(["mesa/tokens", "cole%C3%A7%C3%A3o/tokens", "retratos"]);
  assert.equal(rotulos.get("mesa/tokens"), "mesa/tokens");
  assert.equal(rotulos.get("cole%C3%A7%C3%A3o/tokens"), "coleção/tokens");
  assert.equal(rotulos.get("retratos"), "retratos");
});
