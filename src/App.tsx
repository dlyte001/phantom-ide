
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import {
  Ghost,
  FolderOpen,
  FileCode2,
  Settings,
  Search,
  Terminal,
  Bug,
  Sparkles,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Send,
  Moon,
  Activity,
  Check,
  Code2,
  Eye,
  Zap,
  PanelLeft,
  RotateCcw,
  X,
} from 'lucide-react'
import './App.css'

type GhostMode = 'instant' | 'silent'

type BugFinding = {
  title: string
  severity: 'error' | 'warning' | 'info'
  line: number
  explanation: string
  fix: string
}

type BugReport = {
  summary: string
  findings: BugFinding[]
}

type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'model-not-found'
type ChatTurn = { role: 'user' | 'assistant'; content: string }

function renderInline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code className="inline-code" key={index}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function formatGhostResponse(text: string) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={`p-${blocks.length}`}>{renderInline(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ul>)
    list = []
  }

  lines.forEach((line) => {
    if (/^```/.test(line.trim())) {
      flushParagraph()
      flushList()
      if (inCodeBlock) {
        blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join('\n')}</code></pre>)
        inCodeBlock = false
      } else {
        codeLines = []
        inCodeBlock = true
      }
      return
    }
    if (inCodeBlock) {
      codeLines.push(line)
      return
    }
    const item = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/)
    if (item) {
      flushParagraph()
      list.push(item[1])
    } else if (!line.trim()) {
      flushParagraph()
      flushList()
    } else if (/^#{1,4}\s+/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push(<h4 key={`h-${blocks.length}`}>{renderInline(line.replace(/^#{1,4}\s+/, ''))}</h4>)
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  })
  flushParagraph()
  flushList()
  if (inCodeBlock) blocks.push(<pre key={`code-${blocks.length}`}><code>{codeLines.join('\n')}</code></pre>)
  return <div className="formatted-response">{blocks}</div>
}

function parseBugReport(answer: string, lineCount: number): BugReport {
  const cleanedAnswer = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const report: unknown = JSON.parse(cleanedAnswer)
  if (!report || typeof report !== 'object') throw new Error('Expected a JSON object.')

  const candidate = report as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.findings)) {
    throw new Error('Expected a summary and findings array.')
  }

  const findings = candidate.findings.map((value): BugFinding => {
    if (!value || typeof value !== 'object') throw new Error('A finding was not an object.')
    const finding = value as Record<string, unknown>
    if (
      typeof finding.title !== 'string' || !finding.title.trim() ||
      !['error', 'warning', 'info'].includes(String(finding.severity)) ||
      !Number.isInteger(finding.line) || Number(finding.line) < 1 || Number(finding.line) > lineCount ||
      typeof finding.explanation !== 'string' || typeof finding.fix !== 'string'
    ) throw new Error('A finding contains missing or invalid fields.')

    return {
      title: finding.title.trim(),
      severity: finding.severity as BugFinding['severity'],
      line: finding.line as number,
      explanation: finding.explanation,
      fix: finding.fix,
    }
  })

  return { summary: candidate.summary, findings }
}

const initialCode = `// Welcome to PHANTOM IDE
// Your code. Your ghost. Your rules.

function divide(a: number, b: number): number {
  return a / b
}

const result = divide(10, 0)
console.log("The result is:", result)

// 👻 Summon your ghost to investigate.
`

function App() {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const codeRevisionRef = useRef(0)
  const [mode, setMode] = useState<GhostMode>('instant')
  const [code, setCode] = useState(initialCode)
  const [bugReport, setBugReport] = useState<BugReport | null>(null)
  const [activeFile, setActiveFile] = useState('main.ts')
  const [activeTab, setActiveTab] = useState('ghost')
  const [message, setMessage] = useState('')
  const [ghostReply, setGhostReply] = useState('The Ghost is quiet until summoned. Choose an action to analyze the current editor sample.')
  const [isPossessed, setIsPossessed] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isInvestigating, setIsInvestigating] = useState(false)
  const [bottomPanel, setBottomPanel] = useState('problems')
  const [showExplorer, setShowExplorer] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [selectedFinding, setSelectedFinding] = useState<BugFinding | null>(null)
  const [ghostError, setGhostError] = useState(false)
  const [ghostHasResponded, setGhostHasResponded] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])

  useEffect(() => {
    let mounted = true
    const checkConnection = async () => {
      try {
        const result = await window.phantom.checkHealth()
        if (mounted) setConnectionStatus(result.status)
      } catch {
        if (mounted) setConnectionStatus('offline')
      }
    }
    void checkConnection()
    const interval = window.setInterval(checkConnection, 15000)
    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])



  async function summonGhost(action: 'explain' | 'bugs' | 'refactor' | 'test') {
    if (isThinking) return
    const requestRevision = codeRevisionRef.current
    const analyzedCode = code
    setIsThinking(true)
    setIsInvestigating(action === 'bugs')
    setGhostError(false)
    setGhostHasResponded(false)
    if (action === 'bugs') {
      setBugReport(null)
      setSelectedFinding(null)
    }
    setIsPossessed(false)
    setActiveTab('ghost')

    const prompts: Record<string, string> = {
      explain: 'Explain this code clearly, including what it does and any important edge cases.',
      bugs: 'Investigate this code for bugs, runtime errors, and edge cases. ' +
        'For each finding, report the 1-based line number of the exact ' +
        'expression that causes or demonstrates the issue. Count lines ' +
        'from the first line of the supplied code. Suggest a practical fix.',
      refactor: 'Review this code and suggest practical improvements to readability, reliability, and maintainability.',
      test: 'Suggest useful test cases for this code, including edge cases. Provide example tests where appropriate.',
    }

    try {
      const answer = await window.phantom.askGhost({
        question:
          action === 'bugs'
            ? `${prompts.bugs}
            Check for actual runtime behavior and edge cases in the supplied code.
            In JavaScript and TypeScript, division by zero normally produces Infinity or NaN rather than throwing an exception. Identify this if the code contains it.
            Return only JSON with a summary and findings array. Each finding must have title, severity, line, explanation, and fix. Use 1-based line numbers. If no likely bugs exist, return an empty findings array.`
          : `${prompts[action] ?? prompts.explain}\n\nUse short, clear sections and fenced code blocks for code examples.`,
        code: analyzedCode,
        language: activeFile.endsWith('.tsx')
          ? 'TypeScript React (TSX)'
          : activeFile.endsWith('.json')
            ? 'JSON'
            : 'TypeScript',
      })

      if (action === 'bugs' && requestRevision !== codeRevisionRef.current) {
        setBugReport(null)
        setSelectedFinding(null)
        setGhostReply('The sample changed while the Ghost was investigating. Summon it again to analyze the current code.')
        setGhostHasResponded(false)
        return
      }

      if (action === 'bugs') {
        try {
          const report = parseBugReport(answer, Math.max(1, analyzedCode.split('\n').length))

          setBugReport(report)
          setSelectedFinding(null)
          setGhostReply(report.summary || 'Investigation complete.')
          setGhostHasResponded(true)
          setChatHistory([{ role: 'assistant', content: report.summary }])

          if (report.findings.length > 0) {
            setBottomPanel('problems')
          }
        } catch {
          setBugReport(null)
          setGhostReply('The Ghost returned a malformed bug report. Try investigating again; findings must include valid fields and a line within the current editor code.')
          setGhostError(true)
        }
      } else {
        setGhostReply(answer)
        setGhostHasResponded(true)
        setChatHistory([
          { role: 'user', content: prompts[action] ?? prompts.explain },
          { role: 'assistant', content: answer },
        ])
      }

      setIsPossessed(action === 'bugs')
      if (action === 'bugs') setBottomPanel('problems')

    } catch (error) {
      setGhostReply(
        `I cannot reach the local AI right now. ${
          error instanceof Error ? error.message : 'An unexpected error occurred.'
        }\n\nCheck that Ollama is running and qwen2.5-coder:1.5b is installed.`
      )
      setGhostError(true)
      setIsPossessed(false)
    } finally {
      setIsThinking(false)
      setIsInvestigating(false)
    }
  }


  async function sendQuestion() {
    if (!message.trim() || isThinking) return

    const question = message.trim()
    const recentContext = chatHistory.slice(-6)
      .map((turn) => `${turn.role === 'user' ? 'Developer' : 'Ghost'}: ${turn.content}`)
      .join('\n\n')
      .slice(-2600)
    const contextualQuestion = chatHistory.length
      ? `Conversation so far:\n${recentContext}\n\nDeveloper follow-up: ${question}`.slice(-3900)
      : question
    setMessage('')
    setIsThinking(true)
    setGhostError(false)
    setGhostHasResponded(false)
    setIsPossessed(false)
    setIsInvestigating(false)
    setActiveTab('ghost')

    try {
      const answer = await window.phantom.askGhost({
        question: `${contextualQuestion}\n\nUse concise headings and lists where useful. Put code examples in fenced code blocks.`,
        code,
        language: activeFile.endsWith('.tsx')
          ? 'TypeScript React (TSX)'
          : activeFile.endsWith('.json')
            ? 'JSON'
            : 'TypeScript',
      })

      setGhostReply(answer)
      setGhostHasResponded(true)
      setChatHistory((history) => [...history, { role: 'user' as const, content: question }, { role: 'assistant' as const, content: answer }].slice(-12))
    } catch (error) {
      setGhostReply(
        `The local AI connection failed. ${
          error instanceof Error ? error.message : 'An unexpected error occurred.'
        }\n\nMake sure Ollama is running and the Qwen model is installed.`
      )
      setGhostError(true)
    } finally {
      setIsThinking(false)
    }
  }

  function goToFinding(line: number) {
    const editorInstance = editorRef.current
    if (!editorInstance) return

    const lineCount = editorInstance.getModel()?.getLineCount() ?? 1
    const targetLine = Math.max(1, Math.min(line, lineCount))

    editorInstance.revealLineInCenter(targetLine)
    editorInstance.setPosition({ lineNumber: targetLine, column: 1 })
    editorInstance.focus()

    decorationIdsRef.current = editorInstance.deltaDecorations(
      decorationIdsRef.current,
      [
        {
          range: {
            startLineNumber: targetLine,
            startColumn: 1,
            endLineNumber: targetLine,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: 'phantom-bug-line',
            glyphMarginClassName: 'phantom-bug-glyph',
          },
        },
      ],
    )
  }

  function selectFinding(finding: BugFinding) {
    setSelectedFinding(finding)
    goToFinding(finding.line)
  }

  function clearInvestigation() {
    setBugReport(null)
    setSelectedFinding(null)
    setIsPossessed(false)
    setIsInvestigating(false)
    setChatHistory([])
    setGhostError(false)
    setGhostHasResponded(false)
    setGhostReply('The investigation is clear. The Ghost is ready when summoned.')
    decorationIdsRef.current = editorRef.current?.deltaDecorations(decorationIdsRef.current, []) ?? []
  }


  function selectFile(file: string) {
    codeRevisionRef.current += 1
    setActiveFile(file)
    setIsPossessed(false)
    setBugReport(null)
    setSelectedFinding(null)
    setChatHistory([])
    decorationIdsRef.current = editorRef.current?.deltaDecorations(decorationIdsRef.current, []) ?? []

    if (file === 'main.ts') {
      setCode(initialCode)
    } else if (file === 'app.tsx') {
      setCode(
        `import React from 'react'\n\nexport default function App() {\n  return (\n    <main>\n      <h1>Hello, developer.</h1>\n    </main>\n  )\n}\n`
      )
    } else {
      setCode(
        `// ${file}\n// This file is ready for your next creation.\n\nexport {}\n`
      )
    }
  }

  return (
    <main className={`phantom-app ${isPossessed ? 'possessed' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Ghost size={23} />
          </div>
          <div className="brand-name">
            <span>PHANTOM</span>
            <span className="brand-subtitle">DEVELOPMENT ENVIRONMENT</span>
          </div>
          <span className="version-tag">PRE-ALPHA</span>
        </div>

        <div className="topbar-center">
          <span className="workspace-dot" />
          <span>Sample workspace</span>
        </div>

        <div className="topbar-actions">
          <div className={`connection-status connection-${connectionStatus}`}>
            <span className={`status-dot connection-${connectionStatus}`} />
            <span>{connectionStatus === 'model-not-found' ? 'MODEL NOT FOUND' : connectionStatus.toUpperCase()}</span>
          </div>
          <button className="icon-button unavailable-control" title="Settings are not available in the sample build" disabled>
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="activitybar">
          <button
            className={`activity-icon ${showExplorer ? 'selected' : ''}`}
            title="Toggle explorer"
            onClick={() => setShowExplorer(!showExplorer)}
          >
            <PanelLeft size={20} />
          </button>
          <button
            className={`activity-icon ${activeTab === 'search' ? 'selected' : ''}`}
            title="Search is not available in the sample build"
            aria-label="Search unavailable"
            disabled
          >
            <Search size={20} />
          </button>
          <button
            className={`activity-icon unavailable-control ${activeTab === 'ghost' ? 'selected' : ''}`}
            title="The Ghost panel is always visible"
            aria-label="Ghost panel is always visible"
            disabled
          >
            <Ghost size={21} />
          </button>
          <button
            className={`activity-icon ${bottomPanel === 'problems' ? 'selected' : ''}`}
            title="Problems"
            onClick={() => {
              setBottomPanel('problems')
              setActiveTab('ghost')
            }}
          >
            <Bug size={20} />
          </button>
          <div className="activity-spacer" />
          <button className="activity-icon unavailable-control" title="Appearance settings are not available" disabled>
            <Moon size={19} />
          </button>
          <button className="activity-icon unavailable-control" title="Help is not available in the sample build" disabled>
            <CircleHelp size={19} />
          </button>
        </aside>

        {showExplorer && (
          <aside className="explorer">
            <div className="section-heading">
              <span>EXPLORER</span>
              <FolderOpen size={15} />
            </div>

            <div className="project-heading" aria-label="Sample workspace">
              <ChevronDown size={14} />
              <span>PHANTOM SAMPLE</span>
            </div>

            <div className="file-tree">
              <div className="tree-folder">
                <ChevronDown size={14} />
                <span className="folder-color">src</span>
              </div>
              <button
                className={`tree-file ${activeFile === 'main.ts' ? 'active' : ''}`}
                onClick={() => selectFile('main.ts')}
              >
                <FileCode2 size={15} className="ts-icon" />
                <span>main.ts</span>
              </button>
              <button
                className={`tree-file ${activeFile === 'app.tsx' ? 'active' : ''}`}
                onClick={() => selectFile('app.tsx')}
              >
                <Code2 size={15} className="tsx-icon" />
                <span>app.tsx</span>
              </button>
              <button
                className={`tree-file ${activeFile === 'ghost.ts' ? 'active' : ''}`}
                onClick={() => selectFile('ghost.ts')}
              >
                <FileCode2 size={15} className="ghost-icon" />
                <span>ghost.ts</span>
              </button>
              <button
                className={`tree-file ${activeFile === 'package.json' ? 'active' : ''}`}
                onClick={() => selectFile('package.json')}
              >
                <Code2 size={15} className="json-icon" />
                <span>package.json</span>
              </button>
            </div>

            <div className="explorer-bottom">
              <div className="explorer-note">
                <Ghost size={17} />
                <span>Sample files · in-memory only</span>
              </div>
              <div className="explorer-note muted">
                <Activity size={15} />
                <span>Session is local</span>
              </div>
            </div>
          </aside>
        )}

        <section className="editor-area">
          <div className="tabs-bar">
            <div className="editor-tab">
              <FileCode2 size={15} className="ts-icon" />
              <span>{activeFile}</span>
                <span className="unsaved-dot" title="In-memory sample editor" />
            </div>
            <div className="editor-actions">
              <button
                className="mini-icon-button"
                title="Reset sample code"
                onClick={() => {
                  codeRevisionRef.current += 1
                  setCode(initialCode)
                  setActiveFile('main.ts')
                  clearInvestigation()
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="mini-icon-button"
                title="Summon ghost"
                disabled={isThinking}
                onClick={() => summonGhost('bugs')}
              >
                <Sparkles size={15} />
              </button>
            </div>
          </div>

          <div className="breadcrumb">
            <span>src</span>
            <ChevronRight size={13} />
            <span>{activeFile}</span>
            <ChevronRight size={13} />
              <span className="breadcrumb-muted">Sample editor · changes are in memory</span>
          </div>

          <div className="code-editor">
            <Editor
              onMount={(editorInstance) => {
               editorRef.current = editorInstance
              }}
              height="100%"
              language={
                activeFile.endsWith('.tsx')
                  ? 'typescript'
                  : activeFile.endsWith('.json')
                    ? 'json'
                    : 'typescript'
              }
              theme="vs-dark"
              value={code}
              onChange={(value) => {
                const nextCode = value ?? ''
                if (nextCode !== code) {
                  codeRevisionRef.current += 1
                  if (bugReport) clearInvestigation()
                  else setChatHistory([])
                }
                setCode(nextCode)
              }}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                padding: { top: 18, bottom: 20 },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                roundedSelection: true,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                renderLineHighlight: 'all',
                scrollbar: {
                  verticalScrollbarSize: 7,
                  horizontalScrollbarSize: 7,
                },
              }}
            />
          </div>

          <div className="bottom-panel">
            <div className="panel-tabs">
              <button
                className={bottomPanel === 'problems' ? 'panel-tab active' : 'panel-tab'}
                onClick={() => setBottomPanel('problems')}
              >
                <Bug size={14} />
                PROBLEMS
                {bugReport && <span className="count-badge">{bugReport.findings.length}</span>}
              </button>
              <button
                className={bottomPanel === 'terminal' ? 'panel-tab active' : 'panel-tab'}
                title="Terminal is unavailable in the sample build"
                disabled
                onClick={() => setBottomPanel('terminal')}
              >
                <Terminal size={14} />
                TERMINAL
              </button>
              <button
                className={bottomPanel === 'ghostlog' ? 'panel-tab active' : 'panel-tab'}
                title="Ghost history is unavailable in the sample build"
                disabled
                onClick={() => setBottomPanel('ghostlog')}
              >
                <Activity size={14} />
                GHOST LOG
              </button>
            </div>

            <div className="panel-content">
              {bottomPanel === 'problems' && (
                <div className="problems-content">
                  {bugReport && <button className="clear-investigation" onClick={clearInvestigation}><X size={13} /> Clear investigation</button>}
                  {bugReport === null ? (
                    <div className={`problems-empty ${isInvestigating ? 'loading' : ''}`}>
                      {isInvestigating ? <Sparkles size={16} /> : <Bug size={14} />}
                      <strong>{isInvestigating ? 'Investigation in progress' : 'No investigation yet'}</strong>
                      <span>{isInvestigating ? 'The Ghost is examining the current sample.' : 'Ask the Ghost to inspect this sample code.'}</span>
                    </div>
                  ) : bugReport.findings.length === 0 ? (
                    <div className="problems-empty no-findings">
                      <Check size={14} />
                      <strong>No findings reported</strong>
                      <span>{bugReport.summary || 'The Ghost found no likely issues in this sample.'}</span>
                    </div>
                  ) : (
                    bugReport.findings.map((finding, index) => (
                      <button
                        className={`problem-row problem-row-clickable ${selectedFinding === finding ? 'selected' : ''} severity-border-${finding.severity}`}
                        key={`${finding.title}-${index}`}
                        onClick={() => selectFinding(finding)}
                        aria-pressed={selectedFinding === finding}
                        title={finding.explanation}
                        type="button"
                       >
                       <ShieldAlert
                          size={15}
                          className={`severity-${finding.severity}`}
                        />
                        <span title={finding.explanation}>{finding.title}</span>
                        <span className="problem-location">
                          {activeFile}:{finding.line}
                        </span>
                        <span className={`problem-source severity-${finding.severity}`}>
                          {finding.severity.toUpperCase()}
                        </span>
                      </button>
                    ))
                  )}
                  {selectedFinding && (
                    <section className={`finding-details severity-border-${selectedFinding.severity}`} aria-live="polite">
                      <div className="finding-detail-heading">
                        <ShieldAlert size={14} className={`severity-${selectedFinding.severity}`} />
                        <strong>{selectedFinding.title}</strong>
                        <span className="finding-line">LINE {selectedFinding.line}</span>
                        <span className={`problem-source severity-${selectedFinding.severity}`}>
                          {selectedFinding.severity.toUpperCase()}
                        </span>
                      </div>
                      <div className="finding-section">
                        <strong>Why it matters</strong>
                        <p>{selectedFinding.explanation}</p>
                      </div>
                      <div className="finding-section suggested-fix">
                        <strong>Suggested fix</strong>
                        <p>{selectedFinding.fix}</p>
                      </div>
                    </section>
                  )}
                </div>
              )}
              {bottomPanel === 'terminal' && (
                <div className="terminal-placeholder unavailable-panel">
                  <span className="terminal-prompt">❯</span>
                  <span>
                    Terminal is unavailable in this sample build.
                  </span>
                </div>
              )}
              {bottomPanel === 'ghostlog' && (
                <div className="terminal-placeholder unavailable-panel">
                  <Ghost size={14} />
                  <span>Ghost history is unavailable in this sample build.</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="ghost-panel">
          <div className="ghost-panel-header">
            <div className="ghost-panel-title">
              <Ghost size={17} />
              <span>THE GHOST</span>
              <span className={`online-indicator connection-${connectionStatus}`} />
            </div>
            <button className="mini-icon-button unavailable-control" title="Ghost settings are not available" disabled>
              <Settings size={15} />
            </button>
          </div>

          <div className="mode-switch">
            <button
              className={mode === 'instant' ? 'mode-option active' : 'mode-option'}
              onClick={() => setMode('instant')}
            >
              <Zap size={14} />
              Instant Haunting
            </button>
            <button
              className={mode === 'silent' ? 'mode-option active' : 'mode-option'}
              onClick={() => setMode('silent')}
            >
              <Eye size={14} />
              Silent Observer
            </button>
          </div>
          <div className="mode-description">
            {mode === 'instant'
              ? 'Instant Haunting · choose an action to ask the local Ghost.'
              : 'Silent Observer · stays quiet until explicitly summoned.'}
          </div>

          <div className="ghost-presence">
            <div className={`ghost-orbit ${isPossessed ? 'orbit-danger' : ''} ${isThinking ? 'ghost-thinking' : ''}`}>
              <div className="orbit-ring ring-one" />
              <div className="orbit-ring ring-two" />
              <div className="ghost-glow" />
              <Ghost className="ghost-character" size={70} strokeWidth={1.25} />
              <span className="ghost-spark spark-one">✦</span>
              <span className="ghost-spark spark-two">✧</span>
              <span className="ghost-spark spark-three">·</span>
            </div>
            <div className="ghost-name">
              {isPossessed ? 'RESTLESS SPIRIT' : 'PHANTOM'}
            </div>
            <div className="ghost-status">
              <span className={`status-dot connection-${connectionStatus}`} />
              {isThinking ? 'Consulting the beyond...' : mode === 'silent' ? 'Quiet until summoned' : 'Ready when summoned'}
            </div>
          </div>

          <div className="ghost-divider">
            <span />
            <span>WHISPERS FROM BEYOND</span>
            <span />
          </div>

          <div className="ghost-response" aria-live="polite" aria-busy={isThinking}>
            {isThinking ? (
              <div className="thinking">
                <span />
                <span />
                <span />
                <small>The ghost is thinking</small>
              </div>
            ) : (
              <>
                <div className={`response-label ${ghostError ? 'response-error' : ''}`}>
                  <Sparkles size={13} />
                  <span>{ghostError ? 'THE GHOST COULD NOT ANSWER' : isPossessed ? 'DISTURBANCE DETECTED' : ghostHasResponded ? 'THE GHOST SPEAKS' : 'THE GHOST WAITS'}</span>
                </div>
                {formatGhostResponse(ghostReply)}
                <span className="response-time">
                  {ghostError ? 'RESPONSE ERROR · TRY AGAIN' : ghostHasResponded ? 'LOCAL AI · OLLAMA' : 'AWAITING SUMMONS'}
                </span>
              </>
            )}
          </div>

          <div className="quick-actions">
            <div className="quick-actions-title">SUMMON THE GHOST</div>
            <button disabled={isThinking} onClick={() => summonGhost('explain')}>
              <Sparkles size={15} />
              Explain this code
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button disabled={isThinking} onClick={() => summonGhost('bugs')}>
              <Bug size={15} />
              Investigate bugs
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button disabled={isThinking} onClick={() => summonGhost('refactor')}>
              <Code2 size={15} />
              Suggest improvements
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button disabled={isThinking} onClick={() => summonGhost('test')}>
              <Check size={15} />
              Suggest test cases
              <ChevronRight size={14} className="action-arrow" />
            </button>
          </div>

          <form
            className="ghost-input-area"
            onSubmit={(event) => {
              event.preventDefault()
              sendQuestion()
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask the ghost anything..."
              aria-label="Ask the ghost"
            />
            <button type="submit" title="Send question" disabled={!message.trim() || isThinking}>
              <Send size={16} />
            </button>
          </form>
          <div className="privacy-note">
            <ShieldAlert size={12} />
            LOCAL AI · OLLAMA
          </div>
        </aside>
      </div>

      <footer className="statusbar">
        <div className="status-left">
          <span><Ghost size={13} /> PHANTOM</span>
          <span><Activity size={13} /> {mode === 'instant' ? 'INSTANT HAUNTING' : 'SILENT OBSERVER'}</span>
        </div>
        <div className="status-right">
          <span>TypeScript</span>
          <span>UTF-8</span>
          <span>IN-MEMORY SAMPLE</span>
          <span className={`status-health connection-${connectionStatus}`}>{connectionStatus === 'model-not-found' ? 'MODEL NOT FOUND' : connectionStatus.toUpperCase()}</span>
        </div>
      </footer>
    </main>
  )
}

export default App
