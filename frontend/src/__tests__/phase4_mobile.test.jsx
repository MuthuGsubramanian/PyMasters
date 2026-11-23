import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../api', async () => {
    const actual = await vi.importActual('../api');
    return {
        ...actual,
        default: {
            post: vi.fn(),
            get: vi.fn(),
            defaults: { baseURL: 'http://localhost:8000/api' },
        },
        classroomChat: vi.fn().mockResolvedValue({ data: { message: 'Hello learner!' } }),
    };
});

import api from '../api';
import PythonEditor, { insertPythonSymbol } from '../components/PythonEditor';
import MobileLessonFlow from '../components/MobileLessonFlow';
import VoiceTutor from '../components/VoiceTutor';

describe('Phase 4 Mobile UI/UX Rework', () => {
    let container;
    let root;

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('enforces 5-tab MD3 mobile bottom nav, contextual top bar, 44px drawer targets & safe-area padding in Layout.jsx', () => {
        const layoutSrc = readFileSync(resolve(__dirname, '../components/Layout.jsx'), 'utf8');
        expect(layoutSrc).toContain('grid-cols-5');
        expect(layoutSrc).toContain("t('nav.mobile.home'");
        expect(layoutSrc).toContain("t('nav.mobile.learn'");
        expect(layoutSrc).toContain("t('nav.mobile.code'");
        expect(layoutSrc).toContain("t('nav.mobile.play'");
        expect(layoutSrc).toContain("t('nav.mobile.tutor'");
        expect(layoutSrc).toContain('env(safe-area-inset-top');
        expect(layoutSrc).toContain('env(safe-area-inset-bottom');
        expect(layoutSrc).toContain('min-w-11 min-h-11');
        expect(layoutSrc).toContain('pm:open-vaathiyaar-chat');
        expect(layoutSrc).toContain('aria-label="Go back"');
        expect(layoutSrc).not.toContain('max-w-7xl mx-auto relative z-10 min-h-full');

        const panelSrc = readFileSync(resolve(__dirname, '../components/VaathiyaarPanel.jsx'), 'utf8');
        expect(panelSrc).toContain('pm:open-vaathiyaar-chat');
        expect(panelSrc).toContain('pm:open-vaathiyaar-voice');
        expect(panelSrc).toContain('grid-cols-3');

        const darkHookSrc = readFileSync(resolve(__dirname, '../hooks/useDarkMode.js'), 'utf8');
        expect(darkHookSrc).toContain('setSystemTheme');
    });

    it('keeps Profile floating Save bar clear of safe-area bottom nav & high-contrast dark text', () => {
        const profileSrc = readFileSync(resolve(__dirname, '../pages/Profile.jsx'), 'utf8');
        expect(profileSrc).toContain('bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]');
        expect(profileSrc).toContain('dark:text-amber-300');
    });

    it('renders sticky Python quick-symbol row and inserts symbols at cursor', () => {
        const onChange = vi.fn();
        act(() => {
            root.render(<PythonEditor value="for x in range" height="100%" onChange={onChange} />);
        });

        const shell = container.querySelector('[data-testid="python-editor-shell"]');
        expect(shell?.className).toContain('h-full');
        expect(shell?.className).toContain('min-h-0');
        expect(shell?.firstElementChild?.className).toContain('flex-1');

        const toolbar = container.querySelector('[data-testid="python-quick-symbols"]');
        expect(toolbar).toBeTruthy();
        for (const sym of [':', '()', '[]', '_', 'Tab', '=', '->']) {
            expect(container.querySelector(`button[aria-label="Insert ${sym}"]`)).toBeTruthy();
        }

        expect(insertPythonSymbol('print', 5, 5, { label: '()', insert: '()', cursorOffset: 1 }))
            .toEqual({ nextValue: 'print()', nextCursor: 6 });

        expect(insertPythonSymbol('def f():\n', 9, 9, { label: 'Tab', insert: '    ', cursorOffset: 4 }))
            .toEqual({ nextValue: 'def f():\n    ', nextCursor: 13 });

        act(() => {
            container.querySelector('button[aria-label="Insert ()"]').click();
        });
        expect(onChange).toHaveBeenCalledWith('for x in range()');
    });

    it('navigates 4 single-focus micro-step cards and submits Teach It Back in MobileLessonFlow', async () => {
        api.post.mockResolvedValueOnce({
            data: {
                clarity_score: 5,
                verdict: 'Clear & accurate',
                what_landed: 'Great real-world analogy.',
                xp_awarded: 15,
            },
        });

        const enterPractice = vi.fn();
        const lesson = {
            id: 'py_loops_1',
            title: { en: 'For Loops' },
            xp_reward: 25,
        };

        act(() => {
            root.render(
                <MemoryRouter>
                    <MobileLessonFlow
                        lesson={lesson}
                        language="en"
                        storyContent="Loops repeat a block of steps."
                        traceNode={<div data-testid="trace-card">Step 1 trace</div>}
                        practiceNode={<div data-testid="practice-card">Editor placeholder</div>}
                        onEnterPractice={enterPractice}
                        onContinue={vi.fn()}
                    />
                </MemoryRouter>
            );
        });

        expect(container.querySelector('[data-testid="mobile-step-story"]')).toBeTruthy();

        act(() => {
            const btns = Array.from(container.querySelectorAll('button'));
            btns.find((b) => /Next: 2\. Watch It Run Trace/i.test(b.textContent)).click();
        });
        expect(container.querySelector('[data-testid="mobile-step-trace"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="trace-card"]')).toBeTruthy();

        act(() => {
            const btns = Array.from(container.querySelectorAll('button'));
            btns.find((b) => /Next: 3\. Interactive Code/i.test(b.textContent)).click();
        });
        expect(enterPractice).toHaveBeenCalledTimes(1);
        expect(container.querySelector('[data-testid="mobile-step-practice"]')).toBeTruthy();

        act(() => {
            const btns = Array.from(container.querySelectorAll('button'));
            btns.find((b) => /Next: 4\. Teach It Back/i.test(b.textContent)).click();
        });
        expect(container.querySelector('[data-testid="mobile-step-teachback"]')).toBeTruthy();

        const textarea = container.querySelector('#mobile-tb-explain');
        const form = textarea.closest('form');
        await act(async () => {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, 'A for loop visits every element in a sequence one at a time.');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(api.post).toHaveBeenCalledWith('/classroom/teach-back', {
            concept: 'For Loops',
            explanation: 'A for loop visits every element in a sequence one at a time.',
            lesson_id: 'py_loops_1',
        });
        expect(container.textContent).toContain('+15 XP');
    });

    it('renders VoiceTutor as a swipe-up mobile bottom sheet & dynamically maps upload audio extensions', () => {
        act(() => {
            root.render(
                <VoiceTutor
                    open={true}
                    onClose={vi.fn()}
                    user={{ id: 'u1', name: 'Asha' }}
                    language="en"
                />
            );
        });
        const drawer = container.querySelector('[data-testid="voice-tutor-drawer"]');
        expect(drawer).toBeTruthy();
        expect(drawer.getAttribute('role')).toBe('dialog');
        expect(drawer.className).toContain('rounded-t-3xl');

        const audioHookSrc = readFileSync(resolve(__dirname, '../hooks/useAudioTranscribe.js'), 'utf8');
        expect(audioHookSrc).toContain("mime.includes('mp4')");
        expect(audioHookSrc).toContain('`speech.${ext}`');
    });
});
