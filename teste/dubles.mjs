/**
 * Dublês do Foundry para os testes em node: um servidor de arquivos em memória e um FilePicker que segue o
 * contrato do FilePicker do Foundry 14.369 (construtor, fontes, browse estático e de instância, contexto,
 * canCreateFolder). Só o que o módulo usa.
 */

const PUBLICAS = ["cards", "css", "fonts", "icons", "lang", "scripts", "sounds", "ui"];
const TOKEN_PADRAO = "icons/svg/mystery-man.svg";

const codificar = caminho => caminho.split("/").map(encodeURIComponent).join("/");

/**
 * Servidor de arquivos em memória. Resolve ".." como o servidor do Foundry e devolve `target` como recebeu.
 */
export class Servidor {
  /**
   * @param {Record<string, string[]>} arvores  Arquivos por origem ("data", "public", "s3:bucket").
   * @param {string[]} [privadas]               Pastas privadas da origem "data": só o mestre as recebe.
   */
  constructor(arvores, privadas = []) {
    this.privadas = new Set(privadas);
    this.pastas = {};
    this.arquivos = {};
    this.chamadas = [];
    for (const [origem, arquivos] of Object.entries(arvores)) {
      this.pastas[origem] = new Set([""]);
      this.arquivos[origem] = [];
      for (const arquivo of arquivos) {
        const partes = arquivo.split("/");
        const ePasta = arquivo.endsWith("/");
        if (ePasta) partes.pop();
        const ate = ePasta ? partes.length : partes.length - 1;
        for (let i = 1; i <= ate; i++) this.pastas[origem].add(partes.slice(0, i).join("/"));
        if (!ePasta) this.arquivos[origem].push(arquivo);
      }
    }
  }

  listar(fonte, alvo, opcoes = {}) {
    this.chamadas.push({ fonte, alvo, opcoes, chaves: Reflect.ownKeys(opcoes) });
    const origem = fonte === "s3" ? `s3:${opcoes.bucket ?? ""}` : fonte;
    if ((fonte === "s3") && !opcoes.bucket) {
      const buckets = Object.keys(this.pastas).filter(o => o.startsWith("s3:")).map(o => o.slice(3));
      return { target: "", private: false, gridSize: null, dirs: buckets, privateDirs: [], files: [], extensions: [] };
    }
    const resolvido = [];
    for (const parte of decodeURIComponent(String(alvo)).split(/[\\/]/)) {
      if (!parte || (parte === ".")) continue;
      if (parte === "..") resolvido.pop();
      else resolvido.push(parte);
    }
    const pasta = resolvido.join("/");
    if (!this.pastas[origem]?.has(pasta)) {
      throw new Error(`Directory ${alvo} does not exist or is not accessible in this storage location`);
    }
    const filho = caminho => {
      if (caminho === pasta) return false;
      const pai = caminho.includes("/") ? caminho.slice(0, caminho.lastIndexOf("/")) : "";
      return pai === pasta;
    };
    const extensoes = opcoes.extensions ?? [];
    const mestre = game.user?.isGM === true;
    const privada = caminho => (origem === "data") && this.privadas.has(caminho);
    if (privada(pasta) && !mestre) {
      throw new Error(`Directory ${alvo} does not exist or is not accessible in this storage location`);
    }
    const filhas = [...this.pastas[origem]].filter(filho).filter(caminho => mestre || !privada(caminho)).sort();
    const resultado = {
      target: alvo,
      private: privada(pasta),
      gridSize: null,
      dirs: filhas.map(codificar),
      privateDirs: filhas.filter(privada).map(codificar),
      files: this.arquivos[origem].filter(filho)
        .filter(a => !extensoes.length || extensoes.some(e => a.endsWith(e))).sort().map(codificar),
      extensions: extensoes
    };
    if (fonte === "s3") resultado.bucket = opcoes.bucket;
    return resultado;
  }

  /** Buscas que chegaram ao servidor, sem as de listagem de buckets. */
  get alvos() {
    return this.chamadas.filter(c => !((c.fonte === "s3") && !c.opcoes.bucket)).map(c => `${c.fonte}:${c.alvo}`);
  }
}

/**
 * Monta os globais do Foundry usados pelo módulo e devolve os dublês.
 * @param {object} cena
 * @param {Record<string, string[]>} cena.arvores       Arquivos do servidor por origem.
 * @param {number} [cena.papel=1]                       Papel do usuário atual (CONST.USER_ROLES).
 * @param {object[]} [cena.pastas=[]]                   Valor inicial da configuração "pastas".
 * @param {boolean} [cena.confiaveisLivres=false]
 * @param {Record<string, object>} [cena.favoritos={}]  Valor de core.favoritePaths.
 * @param {string[]} [cena.fontes]                      game.data.files.storages.
 * @param {string[]} [cena.privadas=[]]                 Pastas privadas da origem "data".
 * @param {number[]} [cena.enviam]                      Papéis com a permissão FILES_UPLOAD.
 * @returns {{servidor: Servidor, FilePicker: Function, configuracoes: Map, avisos: string[], ganchos: Map}}
 */
export function montar({
  arvores, papel = 1, pastas = [], confiaveisLivres = false, favoritos = {}, fontes = ["data", "public"],
  privadas = [], enviam = [1, 2, 3, 4]
}) {
  const servidor = new Servidor(arvores, privadas);
  const avisos = [];
  const ganchos = new Map();
  const registradas = new Map();
  const menus = new Map();
  const valores = new Map([
    ["file-picker-limits.pastas", pastas],
    ["file-picker-limits.confiaveisLivres", confiaveisLivres],
    ["core.favoritePaths", favoritos]
  ]);
  const instancias = new Map();

  class FilePicker {
    constructor(options = {}) {
      this.options = options;
      this.id = options.id ?? "file-picker";
      this.request = options.current ?? "";
      this.callback = options.callback ?? null;
      this.type = options.type ?? "any";
      this.extensions = options.extensions ?? [];
      this.sources = ["data", "public", "s3"]
        .filter(s => game.data.files.storages.includes(s))
        .reduce((sources, key) => {
          sources[key] = key === "s3" ? { target: "", bucket: "", buckets: [] } : { target: "" };
          return sources;
        }, {});
      const [source, target] = this._inferSourceAndTarget(this.request);
      this.sources[source].target = target;
      this.activeSource = source;
      this.rendered = false;
      this.renders = 0;
    }

    static LAST_BROWSED_DIRECTORY = "";
    static S3_BUCKETS = null;

    static get implementation() {
      return CONFIG.ux.FilePicker;
    }

    #loaded = false;

    get title() {
      return `FILES.Title${this.type}`;
    }

    get favorites() {
      return game.settings.get("core", "favoritePaths");
    }

    get source() {
      return this.sources[this.activeSource];
    }

    get target() {
      return this.source.target;
    }

    get canCreateFolder() {
      if (this.options.allowUpload === false) return false;
      if (!["data", "s3"].includes(this.activeSource)) return false;
      if ((this.activeSource === "data") && ["worlds", "systems", "modules"].includes(this.source.target)) {
        return false;
      }
      return game.user?.can("FILES_UPLOAD") !== false;
    }

    get canUpload() {
      if (!this.canCreateFolder) return false;
      if (this.type === "folder") return false;
      return (this.activeSource !== "data") || (this.source.target !== "");
    }

    static async browse(source, target, options = {}) {
      return servidor.listar(source, target, options);
    }

    _inferSourceAndTarget(target) {
      if (!target || (target === CONST.DEFAULT_TOKEN)) target = this.constructor.LAST_BROWSED_DIRECTORY;
      let source = "data";
      if (["http://", "https://"].some(c => target.startsWith(c))) target = "";
      else if (PUBLICAS.includes(target.split("/").shift())) source = "public";
      if (!this.sources[source]) {
        source = game.data.files.storages[0];
        if (source === "s3") {
          this.sources.s3.bucket = game.data.files.s3.buckets?.[0] ?? null;
          target = "";
        }
      }
      const parts = target.split("/");
      if (parts[parts.length - 1].indexOf(".") !== -1) parts.pop();
      return [source, parts.join("/")];
    }

    async browse(target = this.target, options = {}) {
      if (game.user?.can("FILES_BROWSE") === false) return this;
      options = Object.assign({ type: this.type, extensions: this.extensions, wildcard: false, render: true }, options);
      const source = this.activeSource;
      if (source === "s3") {
        if (this.constructor.S3_BUCKETS === null) {
          const buckets = await this.constructor.browse("s3", "");
          this.constructor.S3_BUCKETS = buckets.dirs;
        }
        this.sources.s3.buckets = this.constructor.S3_BUCKETS;
        if (!this.source.bucket) this.source.bucket = this.constructor.S3_BUCKETS[0];
        options.bucket = this.source.bucket;
      }
      const safeTarget = target === CONST.DEFAULT_TOKEN
        ? this.constructor.LAST_BROWSED_DIRECTORY
        : target.replace(/^\//, "");
      const result = await this.constructor.browse(source, safeTarget, options).catch(error => {
        ui.notifications.warn(error);
        return this.constructor.browse(source, "", options);
      });
      this.result = result;
      this.source.target = result.target;
      if (source === "s3") this.source.bucket = result.bucket;
      this.constructor.LAST_BROWSED_DIRECTORY = result.target;
      this.#loaded = true;
      if (options.render) return this.render({ force: !this.rendered });
      return this;
    }

    async render() {
      if (game.user?.can("FILES_BROWSE") === false) return this;
      if (!this.#loaded) return this.browse();
      this.context = await this._prepareContext({});
      this.tabs = Object.keys(this.sources);
      this.rendered = true;
      this.renders += 1;
      // Como no ApplicationV2: a janela nova toma o lugar do elemento de outra janela com o mesmo id.
      const anterior = instancias.get(this.id);
      if (anterior && (anterior !== this) && anterior.element) anterior.element.isConnected = false;
      this.element ??= { addEventListener() {}, querySelector: () => null };
      this.element.isConnected = true;
      instancias.set(this.id, this);
      Hooks.callAll("renderFilePicker", this, this.element);
      return this;
    }

    async _prepareContext(_options) {
      const result = this.result;
      const dirs = result.dirs.map(d => ({
        name: decodeURIComponent(d.split("/").pop()),
        path: d,
        private: result.private || result.privateDirs.includes(d)
      })).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
      const files = result.files.map(path => ({ name: decodeURIComponent(path.split("/").pop()), url: path }));
      return {
        dirs,
        files,
        canCreateFolder: this.canCreateFolder,
        canUpload: this.canUpload,
        canTogglePrivacy: game.user?.isGM !== false,
        noResults: dirs.length + files.length === 0,
        favorites: this.favorites,
        target: decodeURIComponent(this.source.target)
      };
    }

    bringToFront() {
      this.trazido = true;
    }

    async close() {
      this.rendered = false;
      if (this.element) this.element.isConnected = false;
      instancias.delete(this.id);
      return this;
    }
  }

  globalThis.CONST = {
    DEFAULT_TOKEN: TOKEN_PADRAO,
    USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 }
  };
  globalThis.CONFIG = { ux: { FilePicker } };
  globalThis.Hooks = {
    on(nome, funcao) {
      if (!ganchos.has(nome)) ganchos.set(nome, []);
      ganchos.get(nome).push(funcao);
      return funcao;
    },
    once(nome, funcao) {
      return this.on(nome, funcao);
    },
    off(nome, funcao) {
      ganchos.set(nome, (ganchos.get(nome) ?? []).filter(f => f !== funcao));
    },
    callAll(nome, ...argumentos) {
      for (const funcao of ganchos.get(nome) ?? []) funcao(...argumentos);
    }
  };
  globalThis.ui = {
    notifications: {
      warn: mensagem => avisos.push(String(mensagem?.message ?? mensagem)),
      info: mensagem => avisos.push(String(mensagem)),
      error: mensagem => avisos.push(String(mensagem))
    }
  };
  globalThis.game = {
    user: {
      role: papel,
      isGM: papel >= 3,
      can: permissao => (permissao !== "FILES_UPLOAD") || enviam.includes(papel)
    },
    permissions: { FILES_BROWSE: [1, 2, 3, 4], FILES_UPLOAD: enviam },
    data: { files: { storages: fontes, s3: fontes.includes("s3") ? { buckets: [] } : null } },
    i18n: {
      lang: "pt-BR",
      localize: chave => chave,
      has: () => false
    },
    modules: new Map([["file-picker-limits", {}]]),
    settings: {
      register: (namespace, chave, dados) => registradas.set(`${namespace}.${chave}`, dados),
      registerMenu: (namespace, chave, dados) => menus.set(`${namespace}.${chave}`, dados),
      get: (namespace, chave) => {
        const id = `${namespace}.${chave}`;
        if (!valores.has(id)) throw new Error(`"${id}" is not a registered game setting`);
        return valores.get(id);
      },
      set: async (namespace, chave, valor) => {
        const id = `${namespace}.${chave}`;
        valores.set(id, valor);
        registradas.get(id)?.onChange?.(valor);
        return valor;
      }
    }
  };
  class ApplicationV2 {
    constructor(options = {}) {
      this.options = options;
      this.rendered = false;
    }

    async render() {
      this.rendered = true;
      this.renders = (this.renders ?? 0) + 1;
      return this;
    }
  }
  globalThis.foundry = {
    applications: {
      apps: { FilePicker },
      api: { ApplicationV2 },
      instances: instancias
    }
  };

  return { servidor, FilePicker, configuracoes: valores, registradas, menus, avisos, ganchos, instancias };
}
