/**
 * Atalhos para as páginas do autor, ao lado do título do módulo em Configurar Opções.
 */

import { ID } from "./constantes.mjs";

/** Páginas do autor. */
export const PAGINAS = Object.freeze([
  { id: "patreon", nome: "Patreon", icone: "fa-brands fa-patreon", url: "https://patreon.com/noiterpg" },
  { id: "discord", nome: "Discord", icone: "fa-brands fa-discord", url: "https://discord.gg/RNTmfrcmUC" }
]);

/**
 * Cria os atalhos: um ícone por página, com o nome dela na dica. Cada um abre a página em outra aba.
 * @returns {HTMLSpanElement}
 */
export function criarAtalhos() {
  const atalhos = document.createElement("span");
  atalhos.className = `${ID}-paginas`;
  for (const pagina of PAGINAS) {
    const atalho = document.createElement("a");
    atalho.className = `${ID}-pagina ${ID}-pagina-${pagina.id}`;
    atalho.href = pagina.url;
    atalho.target = "_blank";
    atalho.rel = "noopener";
    atalho.dataset.tooltip = pagina.nome;
    atalho.setAttribute("aria-label", pagina.nome);
    const icone = document.createElement("i");
    icone.className = pagina.icone;
    icone.setAttribute("inert", "");
    atalho.append(icone);
    atalhos.append(atalho);
  }
  return atalhos;
}

/**
 * Põe os atalhos ao lado do título da seção do módulo. O Foundry não dá título às seções de Configurar Opções:
 * quando outro módulo criou um, os atalhos entram logo depois do texto dele, antes dos botões que esse módulo
 * acrescenta; sem título, a seção ganha um com o nome do módulo.
 * @param {HTMLElement} secao
 */
function porNaSecao(secao) {
  if (secao.querySelector(`.${ID}-paginas`)) return;
  let titulo = secao.querySelector(":scope > h2");
  if (!titulo) {
    titulo = document.createElement("h2");
    titulo.className = `${ID}-titulo`;
    titulo.textContent = game.modules.get(ID)?.title ?? ID;
    secao.prepend(titulo);
  }
  const texto = [...titulo.childNodes].find(no => (no.nodeType === Node.TEXT_NODE) && no.textContent.trim());
  if (texto) texto.after(criarAtalhos());
  else titulo.append(criarAtalhos());
}

/**
 * Roda no gancho renderSettingsConfig. Os atalhos entram depois dos outros ganchos da mesma renderização, porque é
 * neles que outros módulos criam o título da seção.
 * @param {Application} _app
 * @param {HTMLElement|JQuery} html
 */
export function atalhosNasConfiguracoes(_app, html) {
  const raiz = (html instanceof HTMLElement) ? html : html?.[0];
  const secao = raiz?.querySelector(`section[data-category="${ID}"]`)
    ?? raiz?.querySelector(`section[data-tab="${ID}"]`);
  if (secao) queueMicrotask(() => porNaSecao(secao));
}
