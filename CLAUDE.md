# Working on Reels Studio with Claude

Guidance for Claude (Claude Code or any AI coding agent) when modifying this project. Answer the user in the language they write in; the UI text is in Spanish (Rioplatense), keep new UI text consistent with it unless asked to translate.

## First steps in a fresh clone

1. If `node_modules/` is missing, run `npm install`.
2. If `.claude/skills/remotion-best-practices/` is missing, install Remotion's official agent skills: `npx skills add remotion-dev/skills` (choose the Claude Code target). Load the `remotion-best-practices` skill before editing anything in `src/`, and `remotion-captions` for subtitle work.
3. Start the panel with `npm start` (http://localhost:4320) to see the app the user sees.

## What the project is

A local web app to turn a video into a vertical reel with word-by-word subtitles in the user's brand style.

Flow: upload video → convert to 1080×1920 MP4 → transcribe (local Whisper or OpenAI) → edit words in the panel with a live Remotion Player preview → export with `remotion render`.

## Where things live

| To change… | Edit |
| --- | --- |
| How the video looks (subtitles, logo, closing card, animations) | `src/Reel.tsx` |
| Default style of new reels (size, position, toggles) | `src/por-defecto.json` (+ the matching fields in `reelSchema` and the editor in `panel/app.js`) |
| Fonts offered in Settings | `src/fuentes.ts` and the `FUENTES` list in `panel/app.js` |
| Brand defaults for new installs | `config/marca.default.json` |
| Panel UI (gallery, subtitle editor, Settings) | `panel/index.html` (markup + CSS) and `panel/app.js` (logic) |
| Local API: upload, jobs queue, settings, export | `panel/server.mjs` |
| Live preview bundle used by the panel | `src/previa.tsx` (bundled to `panel/previa.js` by esbuild when the server starts) |
| Transcription | `scripts/transcribir.mjs` (local Whisper), `scripts/transcribir-openai.mjs`, shared helpers in `scripts/subtitulos.mjs` |
| Words the transcription gets wrong | `scripts/correcciones.json` |

Key data shapes:

- A reel is `public/reels/<id>.json` + `<id>.mp4`. Its fields are the props of the `Reel` composition minus `marca`.
- Subtitles use the `Caption` type from `@remotion/captions` (`text`, `startMs`, `endMs`, `timestampMs`, `confidence`). Words after the first start with a space.
- At export time the server writes `out/props/<id>.json` = reel + `marca` and runs `remotion render src/index.ts Reel out/<id>.mp4 --props=…`.
- Adding a new style option means: add it to `reelSchema` in `src/Reel.tsx`, give it a default in `src/por-defecto.json`, add a control in `pintarEstilo()` in `panel/app.js`, and add it to the `guardar()` field list there. The server accepts any key present in `por-defecto.json`.

## Rules

- **Never commit secrets or personal media.** `config/secretos.json` (API keys), `config/marca.json`, `public/reels/*`, `public/marca/*` and `out/` are gitignored. Do not read, print or move the API key; the server passes it to the OpenAI script through the `OPENAI_API_KEY` environment variable only.
- Do not bundle fonts, logos, music or footage unless their license allows redistribution. Prefer `@remotion/google-fonts`.
- Keep the composition deterministic: animate with `useCurrentFrame()`, `interpolate()` and `spring()`, never with CSS transitions or `Date.now()` inside `src/`.
- Keep ffmpeg calls going through `scripts/ffmpeg.mjs` (it uses the binary Remotion already installs). The bundled ffmpeg is minimal: filters like `fps` and `zoompan` are not available; use output options such as `-r 30` instead.
- Respect the user's edits: if a file changed in a way you did not expect, assume it was intentional.

## How to verify a change

1. `npm run lint` (TypeScript) must pass.
2. For template changes: render a still, e.g. `npx remotion still src/index.ts Reel out/prueba.png --frame=60 --props=out/props/<id>.json --port=3210`, and look at it. Use an existing reel's props file, or export one from the panel first.
3. For panel changes: restart `npm start`, reload the page and try the flow you touched (upload, transcribe, edit, export).
4. A full export is the final check: the MP4 appears in `out/` and in the panel's "Exportados" tab.

## Licensing reminder

Code is MIT. Remotion has its own license: free for individuals and companies of up to 3 people; larger companies need a Remotion company license (https://www.remotion.dev/license). Mention it if the user plans commercial use at scale.
