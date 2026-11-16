[![Downloads](https://img.shields.io/github/downloads/DrakuI/file-picker-limits/total?label=downloads&style=for-the-badge)](https://github.com/DrakuI/file-picker-limits/releases)
[![Foundry Version](https://img.shields.io/badge/dynamic/json?label=Foundry&query=%24.compatibility.verified&url=https%3A%2F%2Fgithub.com%2FDrakuI%2Ffile-picker-limits%2Freleases%2Flatest%2Fdownload%2Fmodule.json&color=orange&style=for-the-badge)](https://foundryvtt.com/packages/file-picker-limits)
[![Patreon](https://img.shields.io/badge/Patreon-F96854?logo=patreon&logoColor=white&style=for-the-badge)](https://patreon.com/noiterpg?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink)

# File Picker Limits

Limit the folders your players have access through the file picker.

## Features

1. Enable how many paths you want, don't need to be on the same folder.
2. Easy to use, just select the folder. Players don't need to reconnect.
3. Erase it any time. Preview mode for tests.
4. No folders = full access.
5. GM and Assistant GM cannot be limited, and optionally you can enable full access for Trusted Players.

## API
```js
const api = game.modules.get("file-picker-limits").api;

api.pastas();                                             // [{ fonte, caminho, bucket }]
await api.adicionar({ fonte: "data", caminho: "jogadores/tokens" });
await api.remover({ fonte: "data", caminho: "jogadores/tokens" });
api.limitado();                                           // o usuário atual está limitado?
api.abrirConfig();
api.verComoJogador();
```
