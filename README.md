# PHANTOM IDE

**A haunted, local-AI-powered coding environment.**

PHANTOM IDE is a desktop coding-assistant MVP that pairs a Monaco editor with a ghost companion powered by Ollama and Qwen2.5-Coder 1.5B. The Ghost is summoned on demand to explain code, suggest improvements and tests, or return structured bug findings.

> The current build uses an in-memory sample workspace. It does not open or save files from your filesystem.

## The problem

Developers often need a quick explanation or second opinion while exploring code, but sending private code to a hosted AI service can be undesirable. PHANTOM IDE explores a local-first alternative: keep the editor experience focused and make AI analysis an explicit, user-triggered action.

## Vision and interaction

PHANTOM gives that assistant a haunted presence: a spectral coding companion that speaks when summoned and stays quiet otherwise. **Instant Haunting** and **Silent Observer** are interaction modes, not background-monitoring modes. Neither watches edits or produces unsolicited analysis.

## Features

- Dark purple haunted IDE interface with Monaco Editor.
- In-memory sample files for exploring the interface; edits are not persisted.
- Explicit Ghost actions to explain code, investigate likely bugs, suggest improvements, and suggest test cases.
- Structured findings with severity, explanation, suggested fix, and a line in the current editor buffer.
- Select a finding to highlight and navigate to its line, then inspect its details in Problems.
- Clear/reset investigation controls and clear empty, loading, and error states.
- Ollama connection and required-model status.
- Local IPC bridge with Electron context isolation enabled and renderer Node integration disabled.
- Follow-up questions with recent conversation context, held in the current app session.

AI output can be incomplete or incorrect. Review suggestions before relying on them.

## Technology stack

- Electron 30
- React 18 and TypeScript
- Vite 5
- Monaco Editor (`@monaco-editor/react`)
- Ollama local API
- Qwen2.5-Coder 1.5B (`qwen2.5-coder:1.5b`)
- lucide-react icons
- electron-builder for desktop packaging

## Architecture

```text
React renderer (Monaco + Ghost UI)
            │ narrow contextBridge API
            ▼
Electron preload ── IPC ── Electron main process
                                │
                                │ HTTP to 127.0.0.1:11434
                                ▼
                         Ollama on this computer
                         qwen2.5-coder:1.5b
```

The renderer sends the current editor buffer and an explicit request through the preload API. The Electron main process calls Ollama’s local HTTP API. Bug investigations ask the model for JSON, which the renderer validates before showing findings. The renderer does not call a hosted AI endpoint.

## Requirements

- Node.js 20 or newer and npm.
- A desktop operating system supported by Electron.
- Ollama installed locally for Ghost responses.
- Enough memory and compute for Qwen2.5-Coder 1.5B. Inference speed depends on the computer.

The UI can launch without Ollama, but Ghost requests will not work until the local service and model are available.

## Install and develop

Clone the repository and install its locked dependencies:

```bash
git clone <repository-url>
cd phantom-ide
npm install
```

Start the Vite/Electron development app:

```bash
npm run dev
```

The sample editor contents are held in memory. The app does not read project files from disk.

## Set up Ollama

1. Install Ollama for your operating system from the [official download page](https://ollama.com/download).
2. Start the Ollama app or service.
3. In a terminal, download and run the model:

   ```bash
   ollama run qwen2.5-coder:1.5b
   ```

   The model is about 986 MB in the Ollama library listing. The first run downloads it; the app expects the exact model name `qwen2.5-coder:1.5b`.
4. Confirm it is installed:

   ```bash
   ollama list
   ```

PHANTOM checks the local endpoint at `http://127.0.0.1:11434`. Its health status distinguishes an unreachable service from a missing model.

## Production build and packaging

Build renderer assets and package for the current operating system:

```bash
npm run build
```

The build runs TypeScript, Vite, and electron-builder. Packaged output is written under `release/0.1.0/`. The configured targets are DMG for macOS, NSIS for Windows x64, and AppImage for Linux. Build each target on a supported build host and verify its installer on the target operating system before distribution.

On Linux, launch the generated AppImage with:

```bash
chmod +x "release/0.1.0/PHANTOM IDE-Linux-0.1.0.AppImage"
"./release/0.1.0/PHANTOM IDE-Linux-0.1.0.AppImage"
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
```

### Application icon

No PHANTOM IDE icon asset is currently included. The application therefore uses the default Electron icon; the Vite template artwork is not used as product branding. electron-builder can derive platform assets from a high-quality 1024×1024 PNG or SVG master, or it can use platform-specific ICNS for macOS, ICO for Windows, and PNG icon sizes for Linux. See the [electron-builder icon documentation](https://www.electron.build/docs/features/icons-and-images/) for current format and size details.

## Privacy and local-first processing

Editor code and Ghost prompts are sent by the app only to the Ollama service listening on the same computer at `127.0.0.1`. PHANTOM IDE does not configure a hosted AI provider or transmit code to an external AI API. Installing Ollama and downloading the model requires internet access, and other normal network activity by your operating system is outside the app’s control. The sample workspace is not saved to disk by PHANTOM IDE.

The interface currently imports Inter and DM Mono from Google Fonts, so launching the renderer may contact Google Fonts to load those fonts. That font request does not include editor code or Ghost prompts.

## Current limitations

- The explorer contains simulated sample files, not a filesystem-backed workspace.
- Edits and conversation state are in memory and are lost when the app closes or a sample is changed.
- Search, terminal, Ghost history, settings, and appearance controls are unavailable in this MVP.
- The response renderer supports a small Markdown subset; it is not a full Markdown implementation.
- Findings are model-generated suggestions, not compiler diagnostics or executed tests.
- No automated UI or end-to-end test suite is included yet.
- A custom app icon and project license have not been added.

## Roadmap

- Add a reviewed project license and custom product icon.
- Add automated renderer and Electron IPC tests.
- Improve packaging and runtime verification on Windows and macOS.
- Explore filesystem-backed projects only with explicit scope and user-visible permissions.
- Refine Ghost response presentation and accessibility based on user feedback.

Roadmap items are plans; they are not current features.

## Contributing

Contributions are welcome. Please open an issue to discuss larger changes before submitting a pull request. For a change, include a concise description, steps to reproduce or verify it, and screenshots for visible UI changes when useful.

Before opening a pull request, run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Keep AI processing local, preserve Electron’s renderer security settings, and update the documentation when behavior or limitations change. Do not include generated build output or downloaded model files in commits.

## License

No `LICENSE` file or SPDX license declaration is present in this repository. The project’s license has not been specified; do not assume that the source is available under a particular open-source license until one is added by the project maintainers.
