/**
 * Limite do seletor de arquivos (FilePicker) às pastas liberadas pelo mestre.
 *
 * O limite vale para a navegação das janelas do seletor: a busca que a janela faz ao abrir, ao entrar em uma
 * pasta, ao voltar, ao trocar de fonte e ao receber um caminho digitado. Buscas que outros módulos fazem direto
 * em FilePicker.browse, sem janela, passam intactas: elas dependem de pastas que o mestre não tem por que
 * liberar aqui (efeitos com curinga, artes de token, índices).
 *
 * Pontos de entrada no FilePicker do Foundry 14:
 *  - FilePicker#browse: escolhe onde a janela abre e marca as opções da busca;
 *  - FilePicker.browse: nas buscas marcadas, troca a listagem de um caminho fora das pastas liberadas pela lista
 *    dessas pastas;
 *  - FilePicker#_prepareContext: tira os favoritos que apontam para fora das pastas liberadas;
 *  - FilePicker#canCreateFolder: sem criar pasta nem enviar arquivo fora das pastas liberadas;
 *  - gancho renderFilePicker: barra o envio quando o caminho digitado no campo de endereço sai das pastas.
 *
 * O limite é da interface. O servidor do Foundry continua respondendo a qualquer busca de quem tem a permissão
 * FILES_BROWSE.
 */

import { ID } from "./constantes.mjs";
import {
  codificar, favoritoLiberado, fontesLiberadas, listagemLiberadas, normalizar, pastaQueContem, pontoDeEntrada,
  rotulosDaListagem
} from "./caminhos.mjs";
import { lerPastas, usuarioSujeito } from "./pastas.mjs";

/** Chave que marca, nas opções de FilePicker.browse, as buscas vindas da navegação de uma janela limitada. */
const MARCA = Symbol(`${ID}.navegacao`);

/** Chave que marca os resultados montados pelo módulo no lugar da resposta do servidor. */
const LISTAGEM = Symbol(`${ID}.listagem`);

/** Seletores abertos pelo mestre para ver o que um jogador vê. */
const simulados = new WeakSet();

/** Seletores que já fizeram a primeira busca limitada. */
const iniciados = new WeakSet();

/** Fontes com que cada seletor limitado foi construído, para devolver as que o limite esconde. */
const fontesOriginais = new WeakMap();

/** Janelas que já receberam a guarda de envio. */
const guardadas = new WeakSet();

/** Classe alterada, funções originais e gancho registrado. Preenchido por instalar(). */
let instalado = null;

/* -------------------------------------------- */

/**
 * Testa se um seletor está limitado às pastas liberadas.
 * @param {FilePicker} seletor
 * @returns {boolean}
 */
function limitado(seletor) {
  if (!simulados.has(seletor) && !usuarioSujeito()) return false;
  return lerPastas().length > 0;
}

/**
 * Bucket em uso no seletor ("" fora do S3).
 * @param {FilePicker} seletor
 * @returns {string}
 */
function bucketDe(seletor) {
  return seletor.activeSource === "s3" ? (seletor.sources?.s3?.bucket ?? "") : "";
}

/**
 * Testa se um caminho da fonte ativa do seletor está dentro de uma pasta liberada.
 * @param {FilePicker} seletor
 * @param {string} caminho
 * @returns {boolean}
 */
function dentroDasLiberadas(seletor, caminho) {
  return pastaQueContem(lerPastas(), seletor.activeSource, bucketDe(seletor), normalizar(caminho)) !== null;
}

/**
 * Deixa no seletor só as fontes que têm pasta liberada. As abas de fonte da janela seguem `sources`.
 * @param {FilePicker} seletor
 */
function ajustarFontes(seletor) {
  let todas = fontesOriginais.get(seletor);
  if (!todas) {
    todas = { ...seletor.sources };
    fontesOriginais.set(seletor, todas);
  }
  const manter = fontesLiberadas(lerPastas(), Object.keys(todas));
  for (const [fonte, estado] of Object.entries(todas)) {
    if (manter.includes(fonte)) seletor.sources[fonte] ??= estado;
    else delete seletor.sources[fonte];
  }
  if (!(seletor.activeSource in seletor.sources)) seletor.activeSource = manter[0];
}

/**
 * Devolve ao seletor as fontes que o limite escondeu.
 * @param {FilePicker} seletor
 */
function restaurarFontes(seletor) {
  const todas = fontesOriginais.get(seletor);
  if (!todas) return;
  for (const [fonte, estado] of Object.entries(todas)) seletor.sources[fonte] ??= estado;
  fontesOriginais.delete(seletor);
}

/**
 * Define a fonte e o caminho da primeira busca de um seletor limitado.
 * @param {FilePicker} seletor
 * @param {string} destino                Caminho em que o seletor abriria.
 * @returns {string}                      Caminho, codificado, em que o seletor abre.
 */
function entrar(seletor, destino) {
  let pedido = typeof destino === "string" ? destino : "";
  if (pedido === CONST.DEFAULT_TOKEN) pedido = "";
  const fontes = Object.keys(seletor.sources);
  const ponto = pontoDeEntrada(lerPastas(), fontes, seletor.activeSource, bucketDe(seletor), pedido);
  seletor.activeSource = ponto.fonte;
  if ((ponto.fonte === "s3") && ponto.bucket && seletor.sources.s3) seletor.sources.s3.bucket = ponto.bucket;
  return codificar(ponto.caminho);
}

/* -------------------------------------------- */
/*  Substitutos das funções do FilePicker       */
/* -------------------------------------------- */

/**
 * FilePicker#browse.
 * @this {FilePicker}
 * @param {Function} original
 * @param {string} [alvo]
 * @param {object} [opcoes]
 * @returns {Promise<FilePicker>}
 */
async function navegar(original, alvo, opcoes) {
  if (!limitado(this)) {
    restaurarFontes(this);
    return original.call(this, alvo, opcoes);
  }
  ajustarFontes(this);
  let destino = alvo === undefined ? this.sources[this.activeSource].target : alvo;
  if (!iniciados.has(this)) {
    iniciados.add(this);
    destino = entrar(this, destino);
  }
  return original.call(this, destino, { ...opcoes, [MARCA]: true });
}

/**
 * FilePicker.browse.
 * @this {typeof FilePicker}
 * @param {Function} original
 * @param {string} fonte
 * @param {string} alvo
 * @param {object} [opcoes]
 * @returns {Promise<object>}
 */
async function buscar(original, fonte, alvo, opcoes) {
  if (!opcoes?.[MARCA]) return original.call(this, fonte, alvo, opcoes);
  const { [MARCA]: _marca, ...limpas } = opcoes;
  const pastas = lerPastas();
  if (!pastas.length) return original.call(this, fonte, alvo, limpas);
  const caminho = normalizar(alvo);
  if (pastaQueContem(pastas, fonte, limpas.bucket, caminho)) {
    return original.call(this, fonte, codificar(caminho), limpas);
  }
  const listagem = listagemLiberadas(pastas, fonte, limpas.bucket, limpas.extensions);
  Object.defineProperty(listagem, LISTAGEM, { value: true });
  return listagem;
}

/**
 * FilePicker#_prepareContext.
 * @this {FilePicker}
 * @param {Function} original
 * @param {object} [opcoes]
 * @returns {Promise<object>}
 */
async function prepararContexto(original, opcoes) {
  const contexto = await original.call(this, opcoes);
  if (!contexto || !limitado(this)) return contexto;
  if (contexto.favorites && (typeof contexto.favorites === "object")) {
    const pastas = lerPastas();
    const bucket = bucketDe(this);
    contexto.favorites = Object.fromEntries(Object.entries(contexto.favorites)
      .filter(([, favorito]) => favoritoLiberado(pastas, favorito, bucket)));
  }
  if (this.result?.[LISTAGEM] && Array.isArray(contexto.dirs)) {
    const rotulos = rotulosDaListagem(contexto.dirs.map(dir => dir.path));
    for (const dir of contexto.dirs) dir.name = rotulos.get(dir.path) ?? dir.name;
    contexto.dirs.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }
  if (simulados.has(this)) esconderDoMestre(this, contexto);
  return contexto;
}

/**
 * Tira do contexto de um seletor simulado o que o servidor só entrega ao mestre: o controle de privacidade e as
 * pastas privadas.
 * @param {FilePicker} seletor
 * @param {object} contexto
 */
function esconderDoMestre(seletor, contexto) {
  contexto.canTogglePrivacy = false;
  if (seletor.result?.private) {
    contexto.dirs = [];
    contexto.files = [];
    contexto.noResults = true;
  } else if (Array.isArray(contexto.dirs)) {
    contexto.dirs = contexto.dirs.filter(dir => !dir.private);
  }
}

/**
 * Testa se o papel Jogador tem a permissão de enviar arquivos neste mundo.
 * @returns {boolean}
 */
function jogadorPodeEnviar() {
  const papeis = game.permissions?.FILES_UPLOAD;
  return !Array.isArray(papeis) || papeis.includes(CONST.USER_ROLES.PLAYER);
}

/**
 * Leitura de FilePicker#canCreateFolder. FilePicker#canUpload depende dela. Um seletor simulado segue a
 * permissão de envio do papel Jogador, e não a do mestre que o abriu.
 * @this {FilePicker}
 * @param {Function} original
 * @returns {boolean}
 */
function podeCriarPasta(original) {
  const permitido = original.call(this);
  if (!permitido || !limitado(this)) return permitido;
  if (simulados.has(this) && !jogadorPodeEnviar()) return false;
  return dentroDasLiberadas(this, this.sources?.[this.activeSource]?.target);
}

/**
 * Gancho renderFilePicker. O envio de arquivo do FilePicker usa como destino o texto do campo de endereço, que
 * pode ser editado sem navegar. A guarda roda na fase de captura, antes dos ouvintes do FilePicker, e barra o
 * envio quando esse texto aponta para fora das pastas liberadas.
 * @param {FilePicker} seletor
 * @param {HTMLElement} elemento
 */
function guardarEnvios(seletor, elemento) {
  if (!elemento?.addEventListener || guardadas.has(elemento)) return;
  guardadas.add(elemento);
  const barrar = evento => {
    if (!limitado(seletor)) return;
    const campo = elemento.querySelector("input[name=target]");
    const destino = campo ? campo.value : seletor.sources?.[seletor.activeSource]?.target;
    if (dentroDasLiberadas(seletor, destino)) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();
    if (evento.type === "change") evento.target.value = "";
    ui.notifications.warn(game.i18n.localize("PASTASJOGADORES.Aviso.EnvioFora"));
  };
  elemento.addEventListener("change", evento => {
    if (evento.target?.matches?.("input[type=file]")) barrar(evento);
  }, true);
  elemento.addEventListener("drop", evento => {
    if (evento.dataTransfer?.files?.length) barrar(evento);
  }, true);
}

/* -------------------------------------------- */
/*  Interface do módulo                         */
/* -------------------------------------------- */

/**
 * Refaz a busca dos seletores abertos que estão ou estavam limitados. Chamada quando a lista de pastas ou os
 * papéis limitados mudam.
 */
export function atualizarAbertos() {
  if (!instalado) return;
  for (const app of foundry.applications.instances.values()) {
    if (!(app instanceof instalado.FilePicker) || !app.rendered) continue;
    if (!limitado(app) && !fontesOriginais.has(app)) continue;
    app.browse().catch(erro => console.error(`${ID} |`, erro));
  }
}

/**
 * Seletor aberto por abrirComoJogador().
 * @type {FilePicker|null}
 */
let previa = null;

/**
 * Abre um seletor de arquivos limitado como o de um jogador, para o mestre conferir as pastas liberadas. Usa a
 * classe FilePicker do Foundry, e não a implementação configurada para o mestre, com o id padrão dela: o CSS do
 * Foundry para o seletor está preso ao id "file-picker", e uma janela com outro id fica sem o layout.
 * @returns {Promise<FilePicker>}
 */
export async function abrirComoJogador() {
  if (previa?.rendered && previa.element?.isConnected) {
    previa.bringToFront();
    return previa;
  }
  previa = new foundry.applications.apps.FilePicker({ type: "any" });
  simulados.add(previa);
  Object.defineProperty(previa, "title", {
    get: () => game.i18n.localize("PASTASJOGADORES.Config.VerComoJogador")
  });
  await previa.render({ force: true });
  return previa;
}

/**
 * Troca as funções do FilePicker pelas versões limitadas e registra a guarda de envio. As trocas ficam na classe
 * base, de modo que implementações que a estendem (CONFIG.ux.FilePicker) também passam por elas.
 */
export function instalar() {
  if (instalado) return;
  const FilePicker = foundry.applications.apps.FilePicker;
  const proto = FilePicker.prototype;
  const original = {
    buscar: FilePicker.browse,
    navegar: proto.browse,
    prepararContexto: proto._prepareContext,
    podeCriarPasta: Object.getOwnPropertyDescriptor(proto, "canCreateFolder")
  };
  FilePicker.browse = function browse(fonte, alvo, opcoes) {
    return buscar.call(this, original.buscar, fonte, alvo, opcoes);
  };
  proto.browse = function browse(alvo, opcoes) {
    return navegar.call(this, original.navegar, alvo, opcoes);
  };
  proto._prepareContext = function _prepareContext(opcoes) {
    return prepararContexto.call(this, original.prepararContexto, opcoes);
  };
  if (original.podeCriarPasta?.get) {
    Object.defineProperty(proto, "canCreateFolder", {
      ...original.podeCriarPasta,
      get() {
        return podeCriarPasta.call(this, original.podeCriarPasta.get);
      }
    });
  }
  const gancho = Hooks.on("renderFilePicker", guardarEnvios);
  instalado = { FilePicker, original, gancho };
}

/**
 * Desfaz instalar(): devolve as funções originais do FilePicker e remove a guarda de envio das próximas janelas.
 */
export function desinstalar() {
  if (!instalado) return;
  const { FilePicker, original, gancho } = instalado;
  FilePicker.browse = original.buscar;
  FilePicker.prototype.browse = original.navegar;
  FilePicker.prototype._prepareContext = original.prepararContexto;
  if (original.podeCriarPasta) {
    Object.defineProperty(FilePicker.prototype, "canCreateFolder", original.podeCriarPasta);
  }
  Hooks.off("renderFilePicker", gancho);
  instalado = null;
}
