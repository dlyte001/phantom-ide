/// <reference types="vite/client" />

interface Window {
  phantom: {
    checkHealth: () => Promise<{ status: 'connected' | 'offline' | 'model-not-found' }>
    askGhost: (payload: {
      question: string
      code: string
      language?: string
    }) => Promise<string>
  }
}
