import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
ipcMain.handle(
  "ghost:ask",
  async (_event, payload) => {
    var _a, _b;
    const question = typeof (payload == null ? void 0 : payload.question) === "string" ? payload.question.trim().slice(0, 4e3) : "";
    const code = typeof (payload == null ? void 0 : payload.code) === "string" ? payload.code.slice(0, 12e3) : "";
    const language = typeof (payload == null ? void 0 : payload.language) === "string" ? payload.language.slice(0, 80) : "unknown";
    if (!question) {
      throw new Error("Enter a question for the Ghost first.");
    }
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5-coder:1.5b",
        stream: false,
        messages: [
          {
            role: "system",
            content: 'You are the Ghost inside PHANTOM IDE, a careful coding assistant. Analyze only the supplied code. Never claim you executed code. For bug investigations, return ONLY valid JSON with this shape: {"summary":"brief summary","findings":[{"title":"short bug title","severity":"error|warning|info","line":1,"explanation":"why it matters","fix":"suggested correction"}]}. Use 1-based line numbers from the supplied code. If there are no likely bugs, return {"summary":"No likely bugs found","findings":[]}. Do not wrap JSON in Markdown fences. For other requests, answer in concise plain text.'
          },
          {
            role: "user",
            content: `Programming language: ${language}

User question: ${question}

Editor code:
${code || "(No code supplied)"}`
          }
        ],
        options: {
          num_ctx: 2048,
          temperature: 0.3
        }
      })
    });
    if (!response.ok) {
      throw new Error(
        `Ollama returned HTTP ${response.status}. Make sure Ollama is running and the model is installed.`
      );
    }
    const data = await response.json();
    const answer = (_b = (_a = data.message) == null ? void 0 : _a.content) == null ? void 0 : _b.trim();
    if (!answer) {
      throw new Error("The local model returned an empty response.");
    }
    return answer;
  }
);
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
