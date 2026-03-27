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
