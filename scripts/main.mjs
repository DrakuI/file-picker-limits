/**
 * File Picker Limits: limita o seletor de arquivos dos jogadores às pastas escolhidas pelo mestre.
 */

import { CONFIGURACOES, ID } from "./constantes.mjs";
import { ConfigPastas } from "./config.mjs";
import { adicionarPasta, lerPastas, removerPasta, usuarioLimitado } from "./pastas.mjs";
import { abrirComoJogador, atualizarAbertos, instalar } from "./restricao.mjs";

/**
 * Reage à mudança da lista de pastas ou dos papéis limitados, em todos os clientes.
 */
function aoMudar() {
  atualizarAbertos();
  const config = foundry.applications.instances.get(`${ID}-config`);
  if (config?.rendered) config.render();
}

/**
 * Interface pública, em game.modules.get("file-picker-limits").api.
 */
export const api = Object.freeze({
  /** Pastas liberadas: Array<{ fonte, caminho, bucket }>. */
  pastas: lerPastas,
  /** Libera uma pasta: adicionar({ fonte: "data", caminho: "caminho/da/pasta" }). Só o mestre. */
  adicionar: adicionarPasta,
  /** Tira uma pasta da lista: remover({ fonte, caminho }). Só o mestre. */
  remover: removerPasta,
  /** Verdadeiro quando o seletor de arquivos do usuário atual está limitado. */
  limitado: usuarioLimitado,
  /** Abre a janela das pastas liberadas. */
  abrirConfig: () => new ConfigPastas().render({ force: true }),
  /** Abre o seletor de arquivos como um jogador o vê. */
  verComoJogador: abrirComoJogador
});

/**
 * Registra as configurações e instala o limite no seletor de arquivos. Roda no gancho init.
 */
export function iniciar() {
  game.settings.register(ID, CONFIGURACOES.PASTAS, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
    onChange: aoMudar
  });

  game.settings.register(ID, CONFIGURACOES.CONFIAVEIS_LIVRES, {
    name: "PASTASJOGADORES.ConfiaveisLivres.Nome",
    hint: "PASTASJOGADORES.ConfiaveisLivres.Dica",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: aoMudar
  });

  game.settings.registerMenu(ID, "config", {
    name: "PASTASJOGADORES.Config.Nome",
    label: "PASTASJOGADORES.Config.Botao",
    hint: "PASTASJOGADORES.Config.Dica",
    icon: "fa-solid fa-folder-tree",
    type: ConfigPastas,
    restricted: true
  });

  instalar();

  const modulo = game.modules.get(ID);
  if (modulo) modulo.api = api;
}

Hooks.once("init", iniciar);
