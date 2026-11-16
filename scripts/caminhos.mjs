/**
 * Regras de caminho das pastas liberadas. Funções puras, sem dependência do Foundry.
 *
 * Uma pasta liberada é { fonte, caminho, bucket }:
 *  - fonte: chave da fonte de arquivos do seletor ("data", "public", "s3");
 *  - caminho: caminho canônico da pasta (ver normalizar); "" é a fonte inteira;
 *  - bucket: bucket do S3; "" nas outras fontes.
 *
 * As comparações diferenciam maiúsculas de minúsculas, mesmo em servidores cujo sistema de arquivos não
 * diferencia: uma grafia diferente da gravada nunca libera mais do que o mestre escolheu.
 */

/**
 * Decodifica um trecho de URL. Sequências % inválidas ficam como estão.
 * @param {string} trecho
 * @returns {string}
 */
function decodificar(trecho) {
  try {
    return decodeURIComponent(trecho);
  } catch {
    return trecho;
  }
}

/**
 * Forma canônica de um caminho de pasta: separador "/", sem barras nas pontas, sem segmentos vazios e com "." e
 * ".." resolvidos. O servidor do Foundry resolve ".." antes de listar ("a/../b" lista "b"), então a comparação
 * com as pastas liberadas só vale depois desta normalização.
 * @param {string} caminho                 Caminho como o seletor o entrega (codificado por segmento) ou digitado.
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.codificado=true]  Decodifica os segmentos antes de normalizar. Falso para caminhos já
 *                                            canônicos, cujos "%" são literais.
 * @returns {string|null}                  O caminho canônico, ou null quando ".." sai da raiz da fonte.
 */
export function normalizar(caminho, { codificado = true } = {}) {
  const partes = [];
  for (const bruto of String(caminho ?? "").split("/")) {
    const trecho = codificado ? decodificar(bruto) : bruto;
    for (const parte of trecho.split(/[\\/]/)) {
      if (parte === "" || parte === ".") continue;
      if (parte === "..") {
        if (!partes.length) return null;
        partes.pop();
        continue;
      }
      partes.push(parte);
    }
  }
  return partes.join("/");
}

/**
 * Codifica um caminho canônico por segmento, no formato dos caminhos que o servidor devolve.
 * @param {string} caminho
 * @returns {string}
 */
export function codificar(caminho) {
  return String(caminho ?? "").split("/").map(encodeURIComponent).join("/");
}

/**
 * Testa se um caminho canônico é a raiz dada ou está dentro dela.
 * @param {string|null} caminho
 * @param {string|null} raiz
 * @returns {boolean}
 */
export function estaDentro(caminho, raiz) {
  if ((typeof caminho !== "string") || (typeof raiz !== "string")) return false;
  return (raiz === "") || (caminho === raiz) || caminho.startsWith(`${raiz}/`);
}

/**
 * Compara o bucket de uma pasta com o da busca. Fora do S3 os dois são vazios. Um lado sem bucket vale para
 * qualquer bucket.
 * @param {{bucket: string}} pasta
 * @param {string} [bucket]
 * @returns {boolean}
 */
function mesmoBucket(pasta, bucket) {
  return !pasta.bucket || !bucket || (pasta.bucket === bucket);
}

/**
 * Valida a lista gravada: descarta entradas malformadas, normaliza os caminhos e remove as pastas repetidas
 * ou contidas em outra pasta da mesma fonte e bucket.
 * @param {unknown} lista
 * @returns {Array<{fonte: string, caminho: string, bucket: string}>}
 */
export function limparPastas(lista) {
  const validas = [];
  for (const item of Array.isArray(lista) ? lista : []) {
    if (!item || (typeof item !== "object")) continue;
    const fonte = typeof item.fonte === "string" ? item.fonte.trim() : "";
    const caminho = typeof item.caminho === "string" ? normalizar(item.caminho, { codificado: false }) : null;
    if (!fonte || (caminho === null)) continue;
    const bucket = (fonte === "s3") && (typeof item.bucket === "string") ? item.bucket : "";
    validas.push({ fonte, caminho, bucket });
  }
  return validas.filter((pasta, i) => !validas.some((outra, j) => {
    if ((i === j) || (outra.fonte !== pasta.fonte) || (outra.bucket !== pasta.bucket)) return false;
    if (outra.caminho === pasta.caminho) return j < i;
    return estaDentro(pasta.caminho, outra.caminho);
  }));
}

/**
 * Pastas liberadas de uma fonte (e bucket, no S3).
 * @param {Array<{fonte: string, caminho: string, bucket: string}>} pastas
 * @param {string} fonte
 * @param {string} [bucket]
 * @returns {Array<{fonte: string, caminho: string, bucket: string}>}
 */
export function pastasDaOrigem(pastas, fonte, bucket) {
  return pastas.filter(pasta => (pasta.fonte === fonte) && mesmoBucket(pasta, bucket));
}

/**
 * A pasta liberada que contém um caminho canônico.
 * @param {Array<{fonte: string, caminho: string, bucket: string}>} pastas
 * @param {string} fonte
 * @param {string} [bucket]
 * @param {string|null} caminho
 * @returns {{fonte: string, caminho: string, bucket: string}|null}
 */
export function pastaQueContem(pastas, fonte, bucket, caminho) {
  if (typeof caminho !== "string") return null;
  return pastasDaOrigem(pastas, fonte, bucket).find(pasta => estaDentro(caminho, pasta.caminho)) ?? null;
}

/**
 * Fontes do seletor que têm pasta liberada, na ordem em que o seletor as oferece. Sem nenhuma, sobra a
 * primeira fonte, para a janela ter onde mostrar a lista vazia.
 * @param {Array<{fonte: string}>} pastas
 * @param {string[]} disponiveis          Fontes que o seletor oferece.
 * @returns {string[]}
 */
export function fontesLiberadas(pastas, disponiveis) {
  const comPasta = disponiveis.filter(fonte => pastas.some(pasta => pasta.fonte === fonte));
  return comPasta.length ? comPasta : disponiveis.slice(0, 1);
}

/**
 * Resultado de busca, no formato do servidor, que lista só as pastas liberadas de uma fonte. Toma o lugar da
 * listagem de qualquer caminho fora das pastas liberadas.
 * @param {Array<{fonte: string, caminho: string, bucket: string}>} pastas
 * @param {string} fonte
 * @param {string} [bucket]
 * @param {string[]} [extensoes]          Extensões pedidas na busca, devolvidas como o servidor as devolve.
 * @returns {{target: string, private: boolean, gridSize: null, dirs: string[], privateDirs: string[],
 *   files: string[], extensions: string[], bucket?: string|null}}
 */
export function listagemLiberadas(pastas, fonte, bucket, extensoes) {
  const resultado = {
    target: "",
    private: false,
    gridSize: null,
    dirs: pastasDaOrigem(pastas, fonte, bucket).map(pasta => codificar(pasta.caminho)),
    privateDirs: [],
    files: [],
    extensions: Array.isArray(extensoes) ? [...extensoes] : []
  };
  if (fonte === "s3") resultado.bucket = bucket ?? null;
  return resultado;
}

/**
 * Onde um seletor recém-aberto começa. O lugar pedido fica quando está dentro de uma pasta liberada. Fora
 * delas, o seletor abre na única pasta liberada da fonte ou, havendo mais de uma, na lista delas (caminho "").
 * @param {Array<{fonte: string, caminho: string, bucket: string}>} pastas
 * @param {string[]} disponiveis          Fontes que o seletor oferece.
 * @param {string} fonte                  Fonte em que o seletor abriria.
 * @param {string} bucket                 Bucket em que o seletor abriria ("" fora do S3).
 * @param {string} caminho                Caminho em que o seletor abriria.
 * @returns {{fonte: string, bucket: string, caminho: string}}
 */
export function pontoDeEntrada(pastas, disponiveis, fonte, bucket, caminho) {
  const pedido = normalizar(caminho);
  if (disponiveis.includes(fonte) && pastaQueContem(pastas, fonte, bucket, pedido)) {
    return { fonte, bucket: bucket ?? "", caminho: pedido };
  }
  const fontes = fontesLiberadas(pastas, disponiveis);
  const destino = fontes.includes(fonte) ? fonte : fontes[0];
  let daFonte = pastas.filter(pasta => pasta.fonte === destino);
  let noBucket = "";
  if (destino === "s3") {
    const atual = (fonte === "s3") && bucket ? daFonte.filter(pasta => mesmoBucket(pasta, bucket)) : [];
    noBucket = atual.length ? (bucket ?? "") : (daFonte[0]?.bucket ?? "");
    daFonte = atual.length ? atual : daFonte.filter(pasta => mesmoBucket(pasta, noBucket));
  }
  return { fonte: destino, bucket: noBucket, caminho: daFonte.length === 1 ? daFonte[0].caminho : "" };
}

/**
 * Testa se um favorito do seletor aponta para dentro de uma pasta liberada.
 * @param {Array<{fonte: string, caminho: string, bucket: string}>} pastas
 * @param {{source: string, path: string}} favorito
 * @param {string} [bucket]               Bucket atual do seletor; os favoritos não guardam bucket.
 * @returns {boolean}
 */
export function favoritoLiberado(pastas, favorito, bucket) {
  if (!favorito || (typeof favorito.source !== "string")) return false;
  const noBucket = favorito.source === "s3" ? bucket : "";
  return pastaQueContem(pastas, favorito.source, noBucket, normalizar(favorito.path)) !== null;
}

/**
 * Nomes de exibição para a lista das pastas liberadas: o último segmento do caminho ou, quando ele se repete
 * na lista, o caminho inteiro.
 * @param {string[]} codificados          Caminhos codificados, como em `dirs` do resultado da busca.
 * @returns {Map<string, string>}         Nome de exibição por caminho codificado.
 */
export function rotulosDaListagem(codificados) {
  const ultimo = caminho => caminho.split("/").pop();
  const canonicos = codificados.map(codificado => normalizar(codificado) ?? "");
  const rotulos = new Map();
  codificados.forEach((codificado, i) => {
    const nome = ultimo(canonicos[i]);
    const repetido = canonicos.some((outro, j) => (j !== i) && (ultimo(outro) === nome));
    rotulos.set(codificado, repetido || !nome ? (canonicos[i] || "/") : nome);
  });
  return rotulos;
}
