/**
 * Janela do mestre com a lista de pastas liberadas. Cada mudança é gravada na hora.
 */

import { ID } from "./constantes.mjs";
import { adicionarPasta, lerPastas, removerPasta } from "./pastas.mjs";
import { abrirComoJogador } from "./restricao.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Cria um elemento.
 * @param {string} tag
 * @param {object} [dados]
 * @param {string[]} [dados.classes]
 * @param {string} [dados.texto]
 * @param {Record<string, string>} [dados.atributos]
 * @param {Node[]} [dados.filhos]
 * @returns {HTMLElement}
 */
function criar(tag, { classes = [], texto, atributos = {}, filhos = [] } = {}) {
  const elemento = document.createElement(tag);
  if (classes.length) elemento.classList.add(...classes);
  if (texto !== undefined) elemento.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) elemento.setAttribute(nome, valor);
  elemento.append(...filhos);
  return elemento;
}

/**
 * Nome de exibição de uma fonte de arquivos, igual ao da aba do seletor.
 * @param {{fonte: string, bucket: string}} pasta
 * @returns {string}
 */
function rotuloDaFonte({ fonte, bucket }) {
  const chave = `FILES.TABS.${fonte}`;
  const nome = game.i18n.has(chave) ? game.i18n.localize(chave) : fonte;
  return bucket ? `${nome} · ${bucket}` : nome;
}

export class ConfigPastas extends ApplicationV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${ID}-config`,
    classes: [ID],
    window: {
      title: "PASTASJOGADORES.Config.Titulo",
      icon: "fa-solid fa-folder-tree",
      contentClasses: ["standard-form"]
    },
    position: {
      width: 520,
      height: "auto"
    },
    actions: {
      adicionar: ConfigPastas.#aoAdicionar,
      remover: ConfigPastas.#aoRemover,
      verComoJogador: ConfigPastas.#aoVerComoJogador
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_opcoes) {
    return {
      pastas: lerPastas(),
      mostrarFonte: (game.data.files?.storages?.length ?? 1) > 1
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(contexto, _opcoes) {
    const texto = chave => game.i18n.localize(`PASTASJOGADORES.Config.${chave}`);

    const linhas = contexto.pastas.map(pasta => {
      const filhos = [
        criar("i", { classes: ["fa-solid", "fa-folder", "fa-fw"], atributos: { inert: "" } }),
        criar("span", { classes: ["pdj-caminho"], texto: pasta.caminho || texto("FonteInteira") })
      ];
      if (contexto.mostrarFonte || (pasta.fonte !== "data")) {
        filhos.push(criar("span", { classes: ["pdj-fonte"], texto: rotuloDaFonte(pasta) }));
      }
      filhos.push(criar("button", {
        classes: ["icon", "fa-solid", "fa-trash"],
        atributos: {
          type: "button",
          "data-action": "remover",
          "data-tooltip": texto("Remover"),
          "aria-label": texto("Remover")
        }
      }));
      return criar("li", {
        classes: ["pdj-pasta"],
        atributos: { "data-fonte": pasta.fonte, "data-bucket": pasta.bucket, "data-caminho": pasta.caminho },
        filhos
      });
    });

    const corpo = linhas.length
      ? criar("ul", { classes: ["pdj-pastas"], filhos: linhas })
      : criar("p", { classes: ["pdj-vazio", "hint"], texto: texto("Vazio") });

    const botao = (acao, icone, chave) => criar("button", {
      atributos: { type: "button", "data-action": acao },
      filhos: [
        criar("i", { classes: ["fa-solid", icone], atributos: { inert: "" } }),
        criar("span", { texto: texto(chave) })
      ]
    });
    const rodape = criar("footer", {
      classes: ["form-footer"],
      filhos: [
        botao("adicionar", "fa-folder-plus", "Adicionar"),
        botao("verComoJogador", "fa-eye", "VerComoJogador")
      ]
    });

    return [corpo, rodape];
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(resultado, conteudo, _opcoes) {
    conteudo.replaceChildren(...resultado);
  }

  /* -------------------------------------------- */

  /**
   * Abre o seletor de arquivos em modo pasta. A pasta confirmada entra na lista.
   * @this {ConfigPastas}
   */
  static async #aoAdicionar() {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const seletor = new FilePicker({
      type: "folder",
      callback: (caminho, origem) => this.#receber(caminho, origem ?? seletor)
    });
    await seletor.render({ force: true });
  }

  /* -------------------------------------------- */

  /**
   * Grava a pasta escolhida no seletor.
   * @param {string} caminho              Caminho devolvido pelo seletor.
   * @param {FilePicker} seletor          Seletor que devolveu o caminho; informa a fonte e o bucket.
   */
  async #receber(caminho, seletor) {
    const fonte = seletor?.activeSource ?? "data";
    const bucket = fonte === "s3" ? (seletor?.sources?.s3?.bucket ?? "") : "";
    const { estado, pasta, por } = await adicionarPasta({ fonte, caminho, bucket });
    const nome = item => item.caminho || game.i18n.localize("PASTASJOGADORES.Config.FonteInteira");
    if (estado === "invalida") {
      ui.notifications.warn("PASTASJOGADORES.Aviso.Invalida", { format: { pasta: String(caminho) } });
    } else if (estado === "coberta") {
      ui.notifications.info("PASTASJOGADORES.Aviso.Coberta", { format: { pasta: nome(pasta), por: nome(por) } });
    }
    if (this.rendered) await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Tira da lista a pasta da linha clicada.
   * @this {ConfigPastas}
   * @param {PointerEvent} _evento
   * @param {HTMLElement} alvo
   */
  static async #aoRemover(_evento, alvo) {
    const linha = alvo.closest("[data-caminho]");
    if (!linha) return;
    const { fonte, bucket, caminho } = linha.dataset;
    await removerPasta({ fonte, bucket, caminho });
    if (this.rendered) await this.render();
  }

  /* -------------------------------------------- */

  /**
   * Abre o seletor como um jogador o vê.
   * @this {ConfigPastas}
   */
  static async #aoVerComoJogador() {
    await abrirComoJogador();
  }
}
