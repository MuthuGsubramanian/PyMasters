# Python IDE Terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crash-prone textarea editor and broken streaming handlers with a CodeMirror-based Python IDE, live output panel, and Vaathiyaar AI error help.

**Architecture:** Phase 1 fixes the streaming crash vectors (AbortController, null checks, shared parser). Phase 2 creates the CodeMirror editor component and replaces textareas. Phase 3 creates the output panel with Vaathiyaar integration. Each phase produces independently testable improvements.

**Tech Stack:** React 19, CodeMirror 6 (@uiw/react-codemirror + @codemirror/lang-python), Vite 7, FastAPI backend

---

## File Map

| File | Responsibility | Tasks |
|------|---------------|-------|
| `frontend/src/utils/streaming.js` | **CREATE** — Shared SSE parsing utilities | 1 |
| `frontend/src/pages/Playground.jsx` | **MODIFY** — Fix streaming, replace textarea, add output panel | 1, 3, 5 |
| `frontend/src/pages/Classroom.jsx` | **MODIFY** — Fix streaming, replace textarea, add output panel | 1, 4, 6 |
| `frontend/src/components/PythonEditor.jsx` | **CREATE** — Shared CodeMirror Python editor | 2 |
| `frontend/src/components/OutputPanel.jsx` | **CREATE** — Live terminal output with AI help | 5 |

---

### Task 1: Fix Streaming Crashes + Shared Parser

**Files:**
- Create: `frontend/src/utils/streaming.js`
- Modify: `frontend/src/pages/Playground.jsx`
- Modify: `frontend/src/pages/Classroom.jsx`

This task fixes the 3 critical crash vectors causing "Something went wrong" errors.

- [ ] **Step 1: Create shared streaming utility**

Create `frontend/src/utils/streaming.js`:

```javascript
/**
 * Shared SSE streaming utilities for Vaathiyaar chat.
 * Replaces the duplicated, fragile extractMessage() parsers
 * in Playground.jsx and Classroom.jsx.
 */

export function parseSSELine(line) {
    if (!line.startsWith('data: ')) return null;
    try {
        return JSON.parse(line.slice(6));
    } catch {
        return null;
    }
}

export function extractMessageFromJSON(rawText) {
    // Try parsing the full accumulated text as JSON
    try {
        const parsed = JSON.parse(rawText);
        if (typeof parsed === 'object' && parsed.message) return parsed.message;
        if (typeof parsed === 'string') return parsed;
        return JSON.stringify(parsed);
    } catch {
        // Fallback: find the last complete JSON object
        const lastBrace = rawText.lastIndexOf('}');
        if (lastBrace === -1) return null;
        const firstBrace = rawText.lastIndexOf('{', lastBrace);
        if (firstBrace === -1) return null;
        try {
            const parsed = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
            return parsed.message || null;
        } catch {
            return null;
        }
    }
}

export async function streamChat({ url, body, headers, signal, onToken, onDone, onError }) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('Response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let rawText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                const data = parseSSELine(line);
                if (!data) continue;

                if (data.error) {
                    onError?.(data.error);
                    return;
                }

                if (data.done) {
                    onDone?.(data);
                    return;
                }

                if (data.token) {
                    rawText += data.token;
                    const display = extractMessageFromJSON(rawText) || rawText;
                    onToken?.(display);
                }
            }
        }

        // Stream ended without explicit done — use accumulated text
        if (rawText) {
            const display = extractMessageFromJSON(rawText) || rawText;
            onDone?.({ message: display });
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // Expected on unmount
        onError?.(err.message || 'Stream connection failed');
    }
}
```

- [ ] **Step 2: Fix Playground.jsx streaming**

In `frontend/src/pages/Playground.jsx`:

A) Add `useRef` for AbortController. Find the existing refs near the top of the Playground component (look for `const editorRef = useRef(...)` etc.) and add:

```javascript
const streamControllerRef = useRef(null);
```

B) Add cleanup useEffect after the existing useEffects:

```javascript
useEffect(() => {
    return () => {
        if (streamControllerRef.current) streamControllerRef.current.abort();
    };
}, []);
```

C) Replace the entire `handleSend` function's streaming logic. Find the `handleSend` function (starts around line 251). Replace the entire try block content (from `const response = await fetch(...)` through the `while(true)` streaming loop and the `extractMessage` function definition) with:

```javascript
        if (streamControllerRef.current) streamControllerRef.current.abort();
        streamControllerRef.current = new AbortController();

        const { streamChat } = await import('../utils/streaming');

        await streamChat({
            url: `${api.defaults.baseURL}/playground/chat/stream`,
            body: {
                user_id: user?.id,
                message,
                language: user?.preferred_language || 'en',
                conversation_id: conversationId,
            },
            headers: getAuthHeaders(),
            signal: streamControllerRef.current.signal,
            onToken: (display) => {
                setMessages((prev) =>
                    prev.map((m) => m._isStreaming ? { ...m, content: display } : m)
                );
            },
            onDone: (data) => {
                const finalMsg = data.message || data.token || '';
                setMessages((prev) =>
                    prev.map((m) => m._isStreaming ? { ...m, content: finalMsg, _isStreaming: false } : m)
                );
                if (data.conversation_id && !conversationId) {
                    setConversationId(data.conversation_id);
                }
            },
            onError: (errMsg) => {
                setMessages((prev) => {
                    const filtered = prev.filter((m) => !m._isStreaming);
                    return [...filtered, { role: 'assistant', content: errMsg || 'Connection error. Please try again.' }];
                });
            },
        });
```

Remove the old `extractMessage` function definition and the `while(true)` loop that was inside the try block. Keep the `catch` and `finally` blocks. Also remove the `if (response.status === 403)` block — move that check into the `onError` handler or keep it before `streamChat`.

Actually, keep the 403 check before calling streamChat. The full try block should be:

```javascript
    try {
        if (streamControllerRef.current) streamControllerRef.current.abort();
        streamControllerRef.current = new AbortController();

        // Quick check for credits exhaustion
        const checkRes = await fetch(`${api.defaults.baseURL}/playground/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
                user_id: user?.id,
                message,
                language: user?.preferred_language || 'en',
                conversation_id: conversationId,
            }),
            signal: streamControllerRef.current.signal,
        });

        if (checkRes.status === 403) {
            setMessages((prev) => {
                const filtered = prev.filter((m) => !m._isStreaming);
                return [...filtered, { role: 'assistant', content: "You've used all your prompts! Complete more lessons to earn XP and unlock more." }];
            });
            return;
        }

        if (!checkRes.ok) {
            throw new Error(`Server error: ${checkRes.status}`);
        }

        if (!checkRes.body) {
            throw new Error('Response body is empty');
        }

        const reader = checkRes.body.getReader();
        const decoder = new TextDecoder();
        let rawText = '';

        const { parseSSELine, extractMessageFromJSON } = await import('../utils/streaming');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
                const data = parseSSELine(line);
                if (!data) continue;

                if (data.error) {
                    setMessages((prev) => {
                        const filtered = prev.filter((m) => !m._isStreaming);
                        return [...filtered, { role: 'assistant', content: data.error }];
                    });
                    return;
                }

                if (data.done) {
                    const finalMsg = data.message || extractMessageFromJSON(rawText) || rawText;
                    setMessages((prev) =>
                        prev.map((m) => m._isStreaming ? { ...m, content: finalMsg, _isStreaming: false } : m)
                    );
                    if (data.conversation_id && !conversationId) {
                        setConversationId(data.conversation_id);
                    }
                    return;
                }

                if (data.token) {
                    rawText += data.token;
                    const display = extractMessageFromJSON(rawText) || rawText;
                    setMessages((prev) =>
                        prev.map((m) => m._isStreaming ? { ...m, content: display } : m)
                    );
                }
            }
        }

        // Stream ended without explicit done
        if (rawText) {
            const finalMsg = extractMessageFromJSON(rawText) || rawText;
            setMessages((prev) =>
                prev.map((m) => m._isStreaming ? { ...m, content: finalMsg, _isStreaming: false } : m)
            );
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        setMessages((prev) => {
            const filtered = prev.filter((m) => !m._isStreaming);
            return [...filtered, { role: 'assistant', content: `Connection error: ${err.message}` }];
        });
    } finally {
        setLoading(false);
    }
```

D) Do the same for Classroom.jsx — add `streamControllerRef`, cleanup useEffect, and replace the streaming fetch block with the same pattern using `parseSSELine` and `extractMessageFromJSON` from the shared utility. Remove the old `extractMessage` function.

- [ ] **Step 3: Verify frontend build**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/streaming.js frontend/src/pages/Playground.jsx frontend/src/pages/Classroom.jsx
git commit -m "fix: replace fragile SSE parser with shared utility, add AbortController and null checks"
```

---

### Task 2: Create PythonEditor Component with CodeMirror

**Files:**
- Create: `frontend/src/components/PythonEditor.jsx`

- [ ] **Step 1: Install CodeMirror dependencies**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npm install @uiw/react-codemirror @codemirror/lang-python @codemirror/theme-one-dark
```

- [ ] **Step 2: Create PythonEditor component**

Create `frontend/src/components/PythonEditor.jsx`:

```jsx
import { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';

export default function PythonEditor({
    value,
    onChange,
    onRun,
    readOnly = false,
    height = '300px',
    placeholder = '# Write Python code here...',
}) {
    const handleChange = useCallback((val) => {
        onChange?.(val);
    }, [onChange]);

    const runKeymap = keymap.of([
        {
            key: 'Mod-Enter',
            run: () => {
                onRun?.();
                return true;
            },
        },
    ]);

    return (
        <CodeMirror
            value={value}
            onChange={handleChange}
            height={height}
            theme={oneDark}
            readOnly={readOnly}
            placeholder={placeholder}
            basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: false,
                foldGutter: false,
                tabSize: 4,
            }}
            extensions={[
                python(),
                indentUnit.of('    '),
                runKeymap,
            ]}
            className="rounded-lg overflow-hidden border border-slate-700/50 text-sm"
        />
    );
}
```

- [ ] **Step 3: Verify component imports correctly**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: builds successfully (PythonEditor not yet used anywhere, but import resolution works)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PythonEditor.jsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add CodeMirror-based PythonEditor component with syntax highlighting and auto-indent"
```

---

### Task 3: Replace Playground Textarea with PythonEditor

**Files:**
- Modify: `frontend/src/pages/Playground.jsx`

- [ ] **Step 1: Import PythonEditor and remove LineNumbers**

Add import at top of Playground.jsx:
```javascript
import PythonEditor from '../components/PythonEditor';
```

Remove the `LineNumbers` component definition (around lines 163-175 — the entire function).

Remove `lineNumbersRef` declaration (find `const lineNumbersRef = useRef(null)` and delete it).

Remove `handleEditorKeyDown` function (around lines 444-461 — the entire function). CodeMirror handles Tab and Ctrl+Enter natively now.

- [ ] **Step 2: Replace the textarea + LineNumbers rendering**

Find the section where LineNumbers and textarea are rendered together (around lines 747-762). This block contains `<LineNumbers code={code} scrollRef={lineNumbersRef} />` and the `<textarea>`. Replace the ENTIRE block (from LineNumbers through the closing `</textarea>` tag) with:

```jsx
<PythonEditor
    value={code}
    onChange={setCode}
    onRun={handleRunCode}
    height="calc(100% - 28px)"
    placeholder="# Write Python code here...&#10;# Press Ctrl+Enter to run"
/>
```

Also remove the `onScroll` handler that was on the textarea — it's no longer needed.

- [ ] **Step 3: Verify frontend build**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Playground.jsx
git commit -m "feat: replace Playground textarea with CodeMirror PythonEditor"
```

---

### Task 4: Replace Classroom Textarea with PythonEditor

**Files:**
- Modify: `frontend/src/pages/Classroom.jsx`

- [ ] **Step 1: Import PythonEditor**

Add import at top of Classroom.jsx:
```javascript
import PythonEditor from '../components/PythonEditor';
```

- [ ] **Step 2: Replace the practice textarea**

Find the PracticePhase component's textarea (around line 649). The current textarea looks like:

```jsx
<textarea
    className="w-full bg-[#0d1117] text-slate-300 font-mono text-sm p-5 resize-none focus:outline-none leading-relaxed min-h-[200px] placeholder-slate-600"
    value={code}
    onChange={(e) => setCode(e.target.value)}
    onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            onRun?.();
        }
    }}
    spellCheck={false}
    placeholder="# Write your code here... (Ctrl+Enter to run)"
/>
```

Replace it with:

```jsx
<PythonEditor
    value={code}
    onChange={(val) => setCode(val)}
    onRun={onRun}
    height="200px"
    placeholder="# Write your code here... (Ctrl+Enter to run)"
/>
```

- [ ] **Step 3: Verify frontend build**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Classroom.jsx
git commit -m "feat: replace Classroom practice textarea with CodeMirror PythonEditor"
```

---

### Task 5: Create OutputPanel + Vaathiyaar Error Help in Playground

**Files:**
- Create: `frontend/src/components/OutputPanel.jsx`
- Modify: `frontend/src/pages/Playground.jsx`

- [ ] **Step 1: Create OutputPanel component**

Create `frontend/src/components/OutputPanel.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { Play, Trash2, Sparkles, Loader2 } from 'lucide-react';

function isErrorOutput(text) {
    if (!text) return false;
    return /^(Traceback|.*Error:|.*Exception:|Execution error|Security Error)/m.test(text);
}

export default function OutputPanel({
    output,
    error,
    running,
    executionTime,
    onClear,
    onAskAI,
    code,
}) {
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output, error]);

    const hasError = isErrorOutput(output) || isErrorOutput(error);
    const displayText = [output, error].filter(Boolean).join('\n');

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 bg-[#161b22] border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-amber-400 animate-pulse' : hasError ? 'bg-red-400' : 'bg-green-400'}`} />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                        {running ? 'Running...' : 'Output'}
                    </span>
                    {executionTime != null && !running && (
                        <span className="text-[10px] text-slate-500 font-mono ml-2">
                            {executionTime < 1000 ? `${executionTime}ms` : `${(executionTime / 1000).toFixed(1)}s`}
                        </span>
                    )}
                </div>
                {displayText && !running && (
                    <button
                        onClick={onClear}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                        title="Clear output"
                    >
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[#0d1117]">
                {running ? (
                    <div className="flex items-center gap-2 text-amber-400">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Executing...</span>
                    </div>
                ) : displayText ? (
                    <>
                        <pre className={`whitespace-pre-wrap break-words ${hasError ? 'text-red-400' : 'text-green-400'}`}>
                            {displayText}
                        </pre>
                        {hasError && onAskAI && (
                            <button
                                onClick={() => onAskAI(code, displayText)}
                                className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/20 transition-colors"
                            >
                                <Sparkles size={12} />
                                Ask Vaathiyaar for help
                            </button>
                        )}
                    </>
                ) : (
                    <span className="text-slate-600 italic">Run your code to see output here...</span>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Integrate OutputPanel in Playground**

In `frontend/src/pages/Playground.jsx`:

A) Import OutputPanel:
```javascript
import OutputPanel from '../components/OutputPanel';
```

B) Add execution time state. Find the existing state declarations and add:
```javascript
const [executionTime, setExecutionTime] = useState(null);
```

C) Update `handleRunCode` to track execution time. Replace the current function with:

```javascript
const handleRunCode = async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    setOutput('');
    setExecutionTime(null);
    const startTime = performance.now();
    try {
        const res = await api.post('/playground/execute', {
            user_id: user?.id,
            code: code,
        });
        const elapsed = Math.round(performance.now() - startTime);
        setExecutionTime(elapsed);
        const result = res.data;
        setOutput(result.output || '');
        if (result.error) {
            setOutput(prev => prev ? prev + '\n' + result.error : result.error);
        }
        if (!result.output && !result.error) setOutput('(no output)');
    } catch (err) {
        setExecutionTime(Math.round(performance.now() - startTime));
        setOutput(`Execution error: ${err.response?.data?.detail || err.message}`);
    } finally {
        setRunning(false);
    }
};
```

D) Add Vaathiyaar error help handler:

```javascript
const handleAskAIForHelp = (failedCode, errorText) => {
    const helpMsg = `My code produced this error. Help me fix it:\n\n\`\`\`python\n${failedCode}\n\`\`\`\n\nError:\n\`\`\`\n${errorText}\n\`\`\``;
    handleSend(helpMsg);
};
```

E) Replace the output `<pre>` display section (around lines 773-785) with:

```jsx
<OutputPanel
    output={output}
    error=""
    running={running}
    executionTime={executionTime}
    onClear={() => { setOutput(''); setExecutionTime(null); }}
    onAskAI={handleAskAIForHelp}
    code={code}
/>
```

- [ ] **Step 3: Verify frontend build**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OutputPanel.jsx frontend/src/pages/Playground.jsx
git commit -m "feat: add OutputPanel with execution timing and Vaathiyaar error help"
```

---

### Task 6: Integrate OutputPanel in Classroom

**Files:**
- Modify: `frontend/src/pages/Classroom.jsx`

- [ ] **Step 1: Import OutputPanel**

Add import at top of Classroom.jsx:
```javascript
import OutputPanel from '../components/OutputPanel';
```

- [ ] **Step 2: Replace practice output display**

Find the output `<pre>` section in the PracticePhase component (around lines 660-668):

```jsx
{output && (
    <div className="rounded-2xl overflow-hidden border border-slate-800/30">
        <div className="bg-slate-800 px-4 py-2 ...">
            ...Output
        </div>
        <pre className="p-4 font-mono text-sm text-green-300/90 whitespace-pre-wrap bg-[#0d1117] max-h-40 overflow-auto">{output}</pre>
    </div>
)}
```

Replace with:

```jsx
{output && (
    <div className="rounded-2xl overflow-hidden border border-slate-800/30" style={{ maxHeight: '200px' }}>
        <OutputPanel
            output={output}
            error=""
            running={running}
            executionTime={null}
            onClear={() => {}}
        />
    </div>
)}
```

Note: No `onAskAI` prop for Classroom — the evaluate endpoint already provides Vaathiyaar feedback through the existing feedback phase.

- [ ] **Step 3: Verify frontend build**

Run:
```bash
export PATH="$PATH:/c/Program Files/nodejs" && cd C:/Users/muthu.MSG/PycharmProjects/PyMasters/frontend && npx vite build 2>&1 | tail -5
```
Expected: `built in` with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Classroom.jsx
git commit -m "feat: integrate OutputPanel in Classroom practice view"
```

---

## Final Verification

After all tasks are complete:

- [ ] **Full frontend build passes**: `cd frontend && npx vite build`
- [ ] **No streaming crashes**: Open Playground, send a chat message, navigate away mid-stream — no "Something went wrong" error
- [ ] **Editor has syntax highlighting**: Open Playground, type `def hello():` — keywords colored, auto-indent after `:`
- [ ] **Ctrl+Enter runs code**: Type code and press Ctrl+Enter — code executes
- [ ] **Output panel shows timing**: Run `print("hello")` — shows "Xms" execution time
- [ ] **Error detection works**: Run `1/0` — output is red, "Ask Vaathiyaar" button appears
- [ ] **Ask Vaathiyaar works**: Click the button — AI response appears in chat with debugging help
