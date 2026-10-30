
import { useRef, useState } from 'react'
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
  const [mode, setMode] = useState<GhostMode>('instant')
  const [code, setCode] = useState(initialCode)
  const [bugReport, setBugReport] = useState<BugReport | null>(null)
  const [activeFile, setActiveFile] = useState('main.ts')
  const [activeTab, setActiveTab] = useState('ghost')
  const [message, setMessage] = useState('')
  const [ghostReply, setGhostReply] = useState(
    "You've arrived. Excellent. I was beginning to think this codebase had abandoned me. What shall we investigate?"
  )
  const [isPossessed, setIsPossessed] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [bottomPanel, setBottomPanel] = useState('problems')
  const [showExplorer, setShowExplorer] = useState(true)
  

  
  async function summonGhost(action: string) {
    setIsThinking(true)
        if (action === 'bugs') {
      setBugReport(null)
    }
    setIsPossessed(false)
    setActiveTab('ghost')

    const prompts: Record<string, string> = {
      explain: 'Explain this code clearly, including what it does and any important edge cases.',
      bugs: 'Investigate this code for bugs, runtime errors, and edge cases. ' +
        'For each finding, report the 1-based line number of the exact ' +
        'expression that causes or demonstrates the issue. Count lines ' +
        'from the first line of the supplied code. For division by zero, ' +
        'identify the line containing the call with a zero denominator ' +
        'if that call is present. Suggest a practical fix.',      refactor: 'Review this code and suggest practical improvements to readability, reliability, and maintainability.',
      test: 'Suggest useful test cases for this code, including edge cases. Provide example tests where appropriate.',
      welcome:
        mode === 'instant'
          ? 'Briefly introduce yourself as the Ghost in PHANTOM IDE and offer to investigate the current code.'
          : 'Briefly describe what you observe in the current code. Do not claim to monitor changes automatically.',
    }

    try {
      const answer = await window.phantom.askGhost({
        question:
          action === 'bugs'
            ? `${prompts.bugs}
            Check for actual runtime behavior and edge cases in the supplied code.
            In JavaScript and TypeScript, division by zero normally produces Infinity or NaN rather than throwing an exception. Identify this if the code contains it.
            Return only JSON with a summary and findings array. Each finding must have title, severity, line, explanation, and fix. Use 1-based line numbers. If no likely bugs exist, return an empty findings array.`
        : prompts[action] ?? prompts.explain,
        code,
        language: activeFile.endsWith('.tsx')
          ? 'TypeScript React (TSX)'
          : activeFile.endsWith('.json')
            ? 'JSON'
            : 'TypeScript',
      })

      if (action === 'bugs') {
        try {
          const cleanedAnswer = answer
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')

          const report = JSON.parse(cleanedAnswer) as BugReport

          if (!report || !Array.isArray(report.findings)) {
            throw new Error('Invalid bug report format')
          }

          const lineCount = Math.max(1, code.split('\n').length)

          const validatedReport: BugReport = {
            ...report,
            findings: report.findings.map((finding) => {
              const divisionCallLine = code
                .split('\n')
                .findIndex((line) => /\bdivide\s*\(\s*[^,]+,\s*0\s*\)/.test(line))

              const correctedLine =
                /division by zero/i.test(finding.title) && divisionCallLine !== -1
                  ? divisionCallLine + 1
                  : finding.line

              return {
                ...finding,
                line: Number.isInteger(correctedLine)
                  ? Math.max(1, Math.min(correctedLine, lineCount))
                  : 1,
              }
            }),
          }

          setBugReport(validatedReport)
          setGhostReply(report.summary || 'Investigation complete.')

          if (report.findings.length > 0) {
            setBottomPanel('problems')
          }
        } catch {
          setBugReport(null)
          setGhostReply(
            `The Ghost returned a response that wasn't valid bug-report JSON:\n\n${answer}`
          )
        }
      } else {
        setGhostReply(answer)
      }

      setIsPossessed(action === 'bugs')
      if (action === 'bugs') setBottomPanel('problems')

    } catch (error) {
      setGhostReply(
        `I cannot reach the local AI right now. ${
          error instanceof Error ? error.message : 'An unexpected error occurred.'
        }\n\nCheck that Ollama is running and qwen2.5-coder:1.5b is installed.`
      )
      setIsPossessed(false)
    } finally {
      setIsThinking(false)
    }
  }

  
  async function sendQuestion() {
    if (!message.trim() || isThinking) return

    const question = message.trim()
    setMessage('')
    setIsThinking(true)
    setIsPossessed(false)
    setActiveTab('ghost')

    try {
      const answer = await window.phantom.askGhost({
        question,
        code,
        language: activeFile.endsWith('.tsx')
          ? 'TypeScript React (TSX)'
          : activeFile.endsWith('.json')
            ? 'JSON'
            : 'TypeScript',
      })

      setGhostReply(answer)
    } catch (error) {
      setGhostReply(
        `The local AI connection failed. ${
          error instanceof Error ? error.message : 'An unexpected error occurred.'
        }\n\nMake sure Ollama is running and the Qwen model is installed.`
      )
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

    editorInstance.deltaDecorations(
      [],
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
  

  function selectFile(file: string) {
    setActiveFile(file)
    setIsPossessed(false)

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
          <span>the-cursed-project</span>
          <ChevronDown size={14} />
        </div>

        <div className="topbar-actions">
          <div className="connection-status">
            <span className="status-dot" />
            <span>GHOST AWAKE</span>
          </div>
          <button className="icon-button" title="Settings">
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
            title="Search"
            onClick={() => setActiveTab('search')}
          >
            <Search size={20} />
          </button>
          <button
            className={`activity-icon ${activeTab === 'ghost' ? 'selected' : ''}`}
            title="Ghost companion"
            onClick={() => setActiveTab('ghost')}
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
          <button className="activity-icon" title="Appearance">
            <Moon size={19} />
          </button>
          <button className="activity-icon" title="Help">
            <CircleHelp size={19} />
          </button>
        </aside>

        {showExplorer && (
          <aside className="explorer">
            <div className="section-heading">
              <span>EXPLORER</span>
              <FolderOpen size={15} />
            </div>

            <button className="project-heading">
              <ChevronDown size={14} />
              <span>THE-CURSED-PROJECT</span>
            </button>

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
                <span>4 files in this realm</span>
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
              <span className="unsaved-dot" title="Demo editor state" />
            </div>
            <div className="editor-actions">
              <button
                className="mini-icon-button"
                title="Reset demo code"
                onClick={() => {
                  setCode(initialCode)
                  setActiveFile('main.ts')
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="mini-icon-button"
                title="Summon ghost"
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
            <span className="breadcrumb-muted">The unknown</span>
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
              onChange={(value) => setCode(value ?? '')}
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
                <span className="count-badge">1</span>
              </button>
              <button
                className={bottomPanel === 'terminal' ? 'panel-tab active' : 'panel-tab'}
                onClick={() => setBottomPanel('terminal')}
              >
                <Terminal size={14} />
                TERMINAL
              </button>
              <button
                className={bottomPanel === 'ghostlog' ? 'panel-tab active' : 'panel-tab'}
                onClick={() => setBottomPanel('ghostlog')}
              >
                <Activity size={14} />
                GHOST LOG
              </button>
            </div>

            <div className="panel-content">
              {bottomPanel === 'problems' && (
                <div className="problems-list">
                  {bugReport === null ? (
                    <div className="terminal-placeholder">
                      <Bug size={14} />
                      <span>Summon the Ghost to investigate your code.</span>
                    </div>
                  ) : bugReport.findings.length === 0 ? (
                    <div className="terminal-placeholder">
                      <Check size={14} />
                      <span>{bugReport.summary || 'No likely bugs found.'}</span>
                    </div>
                  ) : (
                    bugReport.findings.map((finding, index) => (
                      <button
                        className="problem-row problem-row-clickable"
                        key={`${finding.title}-${index}`}
                        onClick={() => goToFinding(finding.line)}
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
                </div>
              )}
              {bottomPanel === 'terminal' && (
                <div className="terminal-placeholder">
                  <span className="terminal-prompt">❯</span>
                  <span>
                    Terminal integration is not configured in this preview.
                  </span>
                </div>
              )}
              {bottomPanel === 'ghostlog' && (
                <div className="terminal-placeholder">
                  <Ghost size={14} />
                  <span>The ghost is waiting for its first investigation.</span>
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
              <span className="online-indicator" />
            </div>
            <button className="mini-icon-button" title="Ghost settings">
              <Settings size={15} />
            </button>
          </div>

          <div className="mode-switch">
            <button
              className={mode === 'instant' ? 'mode-option active' : 'mode-option'}
              onClick={() => {
                setMode('instant')
                summonGhost('welcome')
              }}
            >
              <Zap size={14} />
              Instant
            </button>
            <button
              className={mode === 'silent' ? 'mode-option active' : 'mode-option'}
              onClick={() => {
                setMode('silent')
                summonGhost('welcome')
              }}
            >
              <Eye size={14} />
              Observer
            </button>
          </div>

          <div className="ghost-presence">
            <div className={`ghost-orbit ${isPossessed ? 'orbit-danger' : ''}`}>
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
              <span className="status-dot" />
              {isThinking ? 'Consulting the beyond...' : 'Present in this realm'}
            </div>
          </div>

          <div className="ghost-divider">
            <span />
            <span>WHISPERS FROM BEYOND</span>
            <span />
          </div>

          <div className="ghost-response">
            {isThinking ? (
              <div className="thinking">
                <span />
                <span />
                <span />
                <small>The ghost is thinking</small>
              </div>
            ) : (
              <>
                <div className="response-label">
                  <Sparkles size={13} />
                  <span>{isPossessed ? 'DISTURBANCE DETECTED' : 'THE GHOST SPEAKS'}</span>
                </div>
                <p>{ghostReply}</p>
                <span className="response-time">JUST NOW · LOCAL AI</span>
              </>
            )}
          </div>

          <div className="quick-actions">
            <div className="quick-actions-title">SUMMON THE GHOST</div>
            <button onClick={() => summonGhost('explain')}>
              <Sparkles size={15} />
              Explain this code
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button onClick={() => summonGhost('bugs')}>
              <Bug size={15} />
              Investigate bugs
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button onClick={() => summonGhost('refactor')}>
              <Code2 size={15} />
              Suggest improvements
              <ChevronRight size={14} className="action-arrow" />
            </button>
            <button onClick={() => summonGhost('test')}>
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
          <span>LOCAL WORKSPACE</span>
          <span className="status-health"><span className="status-dot" /> READY</span>
        </div>
      </footer>
    </main>
  )
}

export default App
