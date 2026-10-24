# Reels Studio

Edit vertical videos (Instagram Reels, TikTok, YouTube Shorts) with **automatic word-by-word subtitles in your own brand style**. Upload a video, generate the subtitles, fix any word, preview it live and export a ready-to-post MP4.

Runs on your computer as a small web app. Built with [Remotion](https://www.remotion.dev).

*[Español abajo](#español)*

## Features

- **Upload any video**: vertical or horizontal; it is converted to 1080×1920 (center crop).
- **Automatic subtitles**, two options:
  - **Local and free**: Whisper runs on your GPU. No account, works offline after the first model download.
  - **OpenAI** (paid per use): for computers without a compatible GPU. Bring your own API key.
- **Subtitle editor**: fix words, split ("two words" in one box splits automatically), merge, delete, and jump the preview to any word.
- **Your brand**: name or logo, three colors, a font (5 built-in Google Fonts or upload your own), and a closing card with your website or @handle.
- **Three subtitle styles**: highlighted box, colored word, or plain.
- **Export queue**: one render at a time, progress in the gallery.
- **Corrections dictionary**: `scripts/correcciones.json` fixes names the transcription keeps getting wrong.

## Requirements

- [Node.js](https://nodejs.org) 20 or newer.
- For local transcription: a GPU supported by WebGPU (most recent NVIDIA, AMD, Intel and Apple Silicon). If it is not supported, the app tells you and you can use OpenAI.

## Getting started

```bash
git clone https://github.com/ElSquizy/reels-studio.git
cd reels-studio
npm install
npm start
```

Your browser opens at http://localhost:4320. The first time, a setup screen asks for your brand and how you want to transcribe.

### Connecting your own accounts

Everything is configured from **Settings** in the app and saved only on your computer:

| What | Where it is saved | Committed to git? |
| --- | --- | --- |
| Brand (name, logo, colors, font, website) | `config/marca.json`, `public/marca/` | No |
| OpenAI API key and transcription mode | `config/secretos.json` | No |
| Your videos and subtitles | `public/reels/` | No |
| Exported reels | `out/` | No |

To use OpenAI, create a key at https://platform.openai.com/api-keys, choose "Con OpenAI" in Settings and paste it.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Starts the panel (set `PORT` to change 4320, `NO_OPEN=1` to not open the browser) |
| `npm run studio` | Opens Remotion Studio to work on the template code |
| `npm run transcribe -- public/reels/my-video.mp4 --idioma en` | Transcribes from the command line |
| `npm run lint` | Type-checks the template |

## Project structure

```
panel/            Web app (server.mjs = local API, app.js = UI)
src/Reel.tsx      The video template: subtitles, logo, closing card
src/fuentes.ts    Available fonts
src/por-defecto.json  Default style for new reels
scripts/          Transcription (local and OpenAI), ffmpeg helper, corrections
config/           marca.default.json (defaults); your own settings are created here
```

## Ideas to contribute

Templates with intros and price cards, trimming and joining clips, more subtitle animations, emoji/keyword highlighting, translations of the UI (currently in Spanish), batch export, background music.

## License

Code: [MIT](LICENSE).

**Important — Remotion license:** this project uses Remotion, which is free for individuals and companies of up to 3 people. Larger companies need a Remotion company license. Read https://www.remotion.dev/license before using it commercially.

---

## Español

Editá videos verticales (Reels, TikTok, Shorts) con **subtítulos automáticos palabra por palabra con el estilo de tu marca**. Subís un video, generás los subtítulos, corregís lo que haga falta, lo ves en vivo y exportás un MP4 listo para publicar.

### Cómo empezar

```bash
git clone https://github.com/ElSquizy/reels-studio.git
cd reels-studio
npm install
npm start
```

Se abre http://localhost:4320. La primera vez aparece una pantalla para configurar tu marca (nombre o logo, colores, fuente, web) y cómo transcribir:

- **En tu PC, gratis**: Whisper usa tu placa de video. Sin cuentas ni internet (después de descargar el modelo la primera vez).
- **Con OpenAI**: pago por uso, funciona en cualquier PC. Pegás tu propia clave de API.

Todo se guarda solo en tu computadora (`config/`, `public/reels/`, `out/`) y nada de eso se sube a git.

### Licencia

Código bajo licencia MIT. Remotion es gratis para personas y empresas de hasta 3 personas; las empresas más grandes necesitan su licencia: https://www.remotion.dev/license
