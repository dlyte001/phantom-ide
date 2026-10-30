/// <reference types="vite/client" />

interface Window {
  phantom: {
    askGhost: (payload: {
      question: string
      code: string
      language?: string
    }) => Promise<string>
  }
}
