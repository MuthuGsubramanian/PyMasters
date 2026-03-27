# PyMasters: Python IDE Terminal with Vaathiyaar Integration

**Date:** 2026-03-27
**Status:** Approved for implementation

## Overview

Replace the fragile textarea-based code editor and broken streaming handlers with a production-grade Python IDE experience. Three parts:

1. **Fix streaming crashes** — AbortController, null checks, proper JSON parsing
2. **CodeMirror-based Python editor** — Shared component with syntax highlighting, auto-indent, line numbers
3. **Live output panel + Vaathiyaar integration** — Terminal-like output with AI-powered error help

## 1. Fix Streaming Crash Root Causes

### Problem

The "Something went wrong" ErrorBoundary crash is triggered by multiple issues in the SSE streaming code in both Playground.jsx and Classroom.jsx:

1. **Null `response.body`** — `response.body.getReader()` crashes with TypeError when body is null (proxy/firewall/redirect scenarios)
2. **No AbortController** — When user navigates away mid-stream, `setMessages()` fires on unmounted component, crashing React
3. **Custom `extractMessage()` JSON parser** — Fragile string-based parser that silently fails on unexpected formats. Duplicated across both files.
4. **Silent error swallowing** — `catch (e) {}` blocks hide real failures, making debugging impossible
5. **Single ErrorBoundary** — One crash in chat kills the entire page including the code editor

### Design

#### 1.1 AbortController on All Streaming Fetches

Both Playground and Classroom streaming handlers need cleanup:

```javascript
// Create controller
const controllerRef = useRef(null);

// In the send/chat handler:
if (controllerRef.current) controllerRef.current.abort();
controllerRef.current = new AbortController();

const response = await fetch(url, {
    ...options,
    signal: controllerRef.current.signal,
});

// Cleanup on unmount:
useEffect(() => {
    return () => {
        if (controllerRef.current) controllerRef.current.abort();
    };
}, []);
```

#### 1.2 Null Check on response.body

Before calling `.getReader()`:

```javascript
if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
}
if (!response.body) {
    throw new Error('Response body is empty');
}
const reader = response.body.getReader();
```

#### 1.3 Replace extractMessage() with JSON.parse

The custom string parser is fragile. Replace with standard parsing:

```javascript
// Shared utility: frontend/src/utils/streaming.js
export function parseSSELine(line) {
    if (!line.startsWith('data: ')) return null;
    try {
        return JSON.parse(line.slice(6));
    } catch {
        return null;
    }
}

export function extractMessageFromChunks(rawText) {
    try {
        const parsed = JSON.parse(rawText);
        return parsed.message || rawText;
    } catch {
        // Try to find last complete JSON object in accumulated text
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
```

Both Playground and Classroom import from this shared utility instead of defining their own parsers.

#### 1.4 Granular ErrorBoundaries

Wrap the chat section and editor section in separate ErrorBoundaries so a streaming crash doesn't kill the code editor:

```jsx
<div className="grid grid-cols-...">
    <ErrorBoundary>
        {/* Chat panel */}
    </ErrorBoundary>
    <ErrorBoundary>
        {/* Editor + output panel */}
    </ErrorBoundary>
</div>
```

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/utils/streaming.js` | **CREATE** — Shared SSE parsing utilities |
| `frontend/src/pages/Playground.jsx` | Fix streaming: AbortController, null check, use shared parser, granular ErrorBoundaries |
| `frontend/src/pages/Classroom.jsx` | Same streaming fixes |

---

## 2. CodeMirror-Based Python Editor

### Problem

Current editor is a raw `<textarea>` with:
- No syntax highlighting
- No auto-indentation (only manual Tab handler)
- Custom `LineNumbers` component that doesn't scroll-sync properly
- No bracket matching, no code folding
- No visual feedback while typing

### Design

#### 2.1 Install Dependencies

```bash
npm install @uiw/react-codemirror @codemirror/lang-python @codemirror/theme-one-dark
```

#### 2.2 Shared PythonEditor Component

Create `frontend/src/components/PythonEditor.jsx`:

```jsx
// Props:
// - value: string (code content)
// - onChange: (value: string) => void
// - onRun: () => void (Ctrl+Enter handler)
// - readOnly: boolean (for completed lessons)
// - height: string (CSS height, default "300px")
// - placeholder: string
```

Features:
- **Python syntax highlighting** via `@codemirror/lang-python`
- **Dark theme** via `@codemirror/theme-one-dark` (matches current `bg-[#0d1117]` aesthetic)
- **Auto-indentation** — Python-aware: auto-indents after `:` on def/if/for/while/class lines
- **Line numbers** — Built into CodeMirror gutter (replaces custom LineNumbers component)
- **Ctrl+Enter** — Keymap binding fires `onRun` prop
- **Tab handling** — Inserts 4 spaces (matches current behavior)
- **Bracket matching** — Built-in CodeMirror extension
- **Placeholder text** — Shows when editor is empty
- **Read-only mode** — Disables editing for completed lessons

The component is a thin wrapper around `@uiw/react-codemirror` with pre-configured Python extensions.

#### 2.3 Replace Textarea in Playground

In Playground.jsx, replace:
- The `LineNumbers` component + `<textarea>` combo
- The `handleEditorKeyDown` function (Tab handling now in CodeMirror)
- The `lineNumbersRef` and scroll-sync logic

With:
```jsx
<PythonEditor
    value={code}
    onChange={setCode}
    onRun={handleRunCode}
    height="calc(100% - 28px)"
    placeholder="# Write Python code here..."
/>
```

#### 2.4 Replace Textarea in Classroom

In Classroom.jsx PracticePhase, replace the practice `<textarea>` with:
```jsx
<PythonEditor
    value={code}
    onChange={setCode}
    onRun={onRun}
    height="200px"
    placeholder="# Write your code here... (Ctrl+Enter to run)"
/>
```

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/PythonEditor.jsx` | **CREATE** — Shared CodeMirror editor |
| `frontend/src/pages/Playground.jsx` | Replace textarea + LineNumbers with PythonEditor |
| `frontend/src/pages/Classroom.jsx` | Replace practice textarea with PythonEditor |

---

## 3. Live Output Panel + Vaathiyaar Integration

### Problem

Current output display:
- Static `<pre>` tag with raw text
- No distinction between stdout and stderr
- No execution timing
- No way to get AI help when code fails
- Error detection is fragile (checks if output starts with "Error")

### Design

#### 3.1 OutputPanel Component

Create `frontend/src/components/OutputPanel.jsx`:

```jsx
// Props:
// - output: string (stdout content)
// - error: string (stderr content)
// - running: boolean (show spinner)
// - executionTime: number | null (ms)
// - onClear: () => void
// - onAskAI: (code, error) => void (optional — Vaathiyaar integration)
```

Features:
- **Header bar** with "Output" label, execution time badge, clear button
- **Scrollable content** with auto-scroll to bottom
- **Color coding**: stdout in green (`text-green-400`), stderr in red (`text-red-400`)
- **Running state**: animated dots or spinner
- **Execution time**: "Ran in 0.3s" badge after completion
- **Smart error detection**: Parse stderr for Python tracebacks (look for `Traceback`, `Error:`, `Exception:`)
- **"Ask Vaathiyaar" button**: Appears below error output. Clicking sends code + error to the AI chat.

#### 3.2 Vaathiyaar Error Help Integration

When code execution produces an error in Playground:

1. OutputPanel shows the error with a purple "Ask Vaathiyaar for help" button
2. Clicking it calls the existing `/api/playground/chat/stream` endpoint with:
   ```json
   {
       "user_id": "...",
       "message": "My code produced this error. Help me fix it:\n\nCode:\n```python\n{code}\n```\n\nError:\n```\n{error}\n```",
       "language": "en"
   }
   ```
3. The AI response appears in the chat panel (left side of Playground)
4. A learning signal `code_error_help` is recorded

In Classroom: the error feedback already goes through Vaathiyaar's evaluate endpoint, so no additional integration needed. The OutputPanel just renders the existing feedback.

#### 3.3 Execution Timing

Wrap the execution call with timing:

```javascript
const startTime = performance.now();
const res = await api.post('/playground/execute', { user_id, code });
const elapsed = Math.round(performance.now() - startTime);
setExecutionTime(elapsed);
```

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/components/OutputPanel.jsx` | **CREATE** — Live terminal output panel |
| `frontend/src/pages/Playground.jsx` | Use OutputPanel, add execution timing, add "Ask Vaathiyaar" handler |
| `frontend/src/pages/Classroom.jsx` | Use OutputPanel for practice output display |

---

## Implementation Order

```
Phase 1 (Fix crashes — must be first):
  [A] Create streaming utility + fix Playground streaming
  [B] Fix Classroom streaming (same pattern)
  [C] Add granular ErrorBoundaries

Phase 2 (Editor — independent of Phase 1):
  [D] Install CodeMirror deps + create PythonEditor component
  [E] Replace Playground textarea with PythonEditor
  [F] Replace Classroom textarea with PythonEditor

Phase 3 (Output panel — depends on Phase 2):
  [G] Create OutputPanel component
  [H] Integrate OutputPanel + Vaathiyaar error help in Playground
  [I] Integrate OutputPanel in Classroom
```

## Testing Strategy

- **Streaming crash fix**: Navigate away mid-stream — should not crash. Close browser tab mid-stream — no console errors.
- **Editor**: Type `def hello():` and press Enter — cursor should auto-indent 4 spaces. Ctrl+Enter should execute. Python keywords should be colored.
- **Output panel**: Run `print("hello")` — green output. Run `1/0` — red traceback with "Ask Vaathiyaar" button.
- **Vaathiyaar integration**: Click "Ask Vaathiyaar" after an error — AI response appears in chat panel with debugging guidance.
