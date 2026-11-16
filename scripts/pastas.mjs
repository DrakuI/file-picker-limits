/**
 * Leitura e gravação da lista de pastas liberadas (configuração do mundo) e a regra de quem fica limitado.
 */

import { CONFIGURACOES, ID } from "./constantes.mjs";
import { codificar, estaDentro, limparPastas, normalizar, pastaQueContem } from "./caminhos.mjs";

/**
 * Pastas liberadas pelo mestre, já validadas. Lista vazia quando a configuração ainda não pode ser lida.
 * @returns {Array<{fonte: string, caminho: string, bucket: string}>}
 */
export function lerPastas() {
  try {
    return limparPastas(game.settings.get(ID, CONFIGURACOES.PASTAS));
  } catch {
    return [];
  }
}

/**
 * Testa se o usuário atual tem papel sujeito ao limite: jogadores e, salvo configuração em contrário, jogadores
 * confiáveis. Mestres e mestres assistentes nunca são limitados.
 * @returns {boolean}
 */
export function usuarioSujeito() {
  const usuario = game.user;
  if (!usuario || usuario.isGM) return false;
  if (usuario.role < CONST.USER_ROLES.TRUSTED) return true;
  try {
    return !game.settings.get(ID, CONFIGURACOES.CONFIAVEIS_LIVRES);
  } catch {
    return true;
  }
}

/**
 * Testa se o seletor de arquivos do usuário atual está limitado. Sem pastas na lista não há limite.
 * @returns {boolean}
 */
export function usuarioLimitado() {
  return usuarioSujeito() && (lerPastas().length > 0);
}

/**
 * Confirma no servidor que o caminho é uma pasta. Quando não é e o último segmento tem cara de arquivo (tem
 * ponto), tenta a pasta que o contém, o que cobre seletores que devolvem o caminho de um arquivo. A raiz da
 * fonte nunca entra por esse desvio: a fonte inteira só é liberada quando escolhida diretamente.
 * @param {string} fonte
 * @param {string} caminho                Caminho como o seletor o entregou.
 * @param {string} bucket
 * @returns {Promise<string|null>}        Caminho canônico da pasta, ou null quando ela não existe.
 */
async function localizarPasta(fonte, caminho, bucket) {
  const FilePicker = foundry.applications.apps.FilePicker;
  const opcoes = bucket ? { bucket } : {};
  const pedido = normalizar(caminho);
  if (pedido === null) return null;
  const candidatos = [pedido];
  const corte = pedido.lastIndexOf("/");
  if ((corte > 0) && pedido.slice(corte + 1).includes(".")) candidatos.push(pedido.slice(0, corte));
  for (const candidato of candidatos) {
    try {
      await FilePicker.browse(fonte, codificar(candidato), opcoes);
      return candidato;
    } catch {
      // Não é uma pasta acessível: tenta o próximo candidato.
    }
  }
  return null;
}

/**
 * Libera uma pasta para os jogadores.
 * @param {object} pasta
 * @param {string} [pasta.fonte="data"]   Fonte de arquivos do seletor.
 * @param {string} [pasta.caminho=""]     Caminho da pasta, ou de um arquivo dentro dela.
 * @param {string} [pasta.bucket=""]      Bucket, quando a fonte é o S3.
 * @returns {Promise<{estado: "adicionada"|"coberta"|"invalida", pasta?: object, por?: object}>}
 *   "coberta": a pasta já está dentro de outra liberada (`por`); "invalida": a pasta não existe na fonte.
 */
export async function adicionarPasta({ fonte = "data", caminho = "", bucket = "" } = {}) {
  const noBucket = fonte === "s3" ? bucket : "";
  const local = await localizarPasta(fonte, caminho, noBucket);
  if (local === null) return { estado: "invalida" };
  const pasta = { fonte, caminho: local, bucket: noBucket };
  const atuais = lerPastas();
  const por = pastaQueContem(atuais, fonte, noBucket, local);
  if (por) return { estado: "coberta", pasta, por };
  const restantes = atuais.filter(outra => {
    return (outra.fonte !== fonte) || (outra.bucket !== noBucket) || !estaDentro(outra.caminho, local);
  });
  await game.settings.set(ID, CONFIGURACOES.PASTAS, [...restantes, pasta]);
  return { estado: "adicionada", pasta };
}

/**
 * Tira uma pasta da lista de liberadas.
 * @param {object} pasta
 * @param {string} pasta.fonte
 * @param {string} pasta.caminho          Caminho canônico, como gravado.
 * @param {string} [pasta.bucket=""]
 * @returns {Promise<boolean>}            Verdadeiro quando a pasta estava na lista.
 */
export async function removerPasta({ fonte, caminho, bucket = "" } = {}) {
  const atuais = lerPastas();
  const restantes = atuais.filter(pasta => {
    return (pasta.fonte !== fonte) || (pasta.caminho !== caminho) || (pasta.bucket !== bucket);
  });
  if (restantes.length === atuais.length) return false;
  await game.settings.set(ID, CONFIGURACOES.PASTAS, restantes);
  return true;
}
