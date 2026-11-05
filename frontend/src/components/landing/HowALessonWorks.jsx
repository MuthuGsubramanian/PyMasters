import { BookOpen, Play, Layers, Check } from 'lucide-react';

/*
 * Landing: "How a lesson works" (redesign plan PR 6, replaces the 4 identical feature cards).
 * One ordered strip in the product's own words, each step with a small, real piece of the lesson UI
 * instead of an icon tile. The landing page is dark-always, so this uses the page's slate-on-near-black
 * palette; every text colour here is at least 4.5:1 on #0a0a14 and on the white/[0.03] preview surface.
 */

function StoryPreview() {
    return (
        <div data-step-preview="story" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">
            <p className="font-display font-semibold text-white mb-1.5">Lists</p>
            <p>A list is like a shopping list: one name, many items, in order. You can add to it, change it, and read any item by its position.</p>
        </div>
    );
}

const RUN_LINES = ['scores = [70, 85]', 'scores.append(92)', 'print(len(scores))'];

function WatchItRunPreview() {
    return (
        <div data-step-preview="watch-it-run" className="rounded-xl border border-white/10 bg-[#0d1117] p-4 font-mono text-sm">
            <div className="space-y-1">
                {RUN_LINES.map((line, i) => (
                    <div key={line} className={`flex gap-3 rounded-md px-2 py-0.5 ${i === 1 ? 'bg-cyan-500/15 text-white' : 'text-slate-300'}`}>
                        <span className="w-4 text-right text-slate-400 tabular-nums" aria-hidden="true">{i + 1}</span>
                        <code className="min-w-0 break-all">{line}</code>
                    </div>
                ))}
            </div>
            <p className="mt-3 border-t border-white/10 pt-2 text-slate-300">
                <span className="text-slate-400">scores</span> = [70, 85, 92]
            </p>
            <p className="mt-1 text-xs text-slate-400">Step 2 of 3</p>
        </div>
    );
}

function UnderTheHoodPreview() {
    return (
        <div data-step-preview="under-the-hood" className="rounded-xl border border-white/10 bg-[#0d1117] p-4 text-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Names</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Objects</p>
                <span className="font-mono text-white">a</span>
                <span className="row-span-2 self-stretch flex items-center rounded-lg border border-cyan-400/40 px-3 font-mono text-cyan-200">
                    list [1, 2, 3]
                </span>
                <span className="font-mono text-white">b</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-300">
                <code className="font-mono text-white">a</code> and <code className="font-mono text-white">b</code> now point to the same list object. Nothing was copied.
            </p>
        </div>
    );
}

function PracticePreview() {
    return (
        <div data-step-preview="practice" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Expected output (must match exactly)</p>
            <pre className="rounded-lg bg-[#0d1117] border border-white/10 px-3 py-2 font-mono text-slate-200">3</pre>
            <p className="mt-3 flex items-center gap-2 font-semibold text-emerald-300">
                <Check size={16} aria-hidden="true" />
                Excellent Work! You nailed this challenge
            </p>
        </div>
    );
}

const STEPS = [
    {
        title: 'Read the story',
        icon: BookOpen,
        text: 'Each lesson starts with a short story that explains the idea in plain words, in your language.',
        Preview: StoryPreview,
    },
    {
        title: 'Watch It Run',
        icon: Play,
        text: 'See the example execute one line at a time: every variable, every loop turn, at your own pace.',
        Preview: WatchItRunPreview,
    },
    {
        title: 'Under the hood',
        icon: Layers,
        text: 'Step by step, see the names Python keeps and the objects they point to, so aliasing and mutation stop being a surprise.',
        Preview: UnderTheHoodPreview,
    },
    {
        title: 'Practice with instant grading',
        icon: Check,
        text: 'Write your own solution and press Run Code. It is graded straight away, and Vaathiyaar gives a hint when you are stuck.',
        Preview: PracticePreview,
    },
];

export default function HowALessonWorks() {
    return (
        <section id="how-it-works" aria-labelledby="how-it-works-title" className="relative py-24 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto">
                <div className="max-w-2xl mb-12">
                    <h2 id="how-it-works-title" className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold font-display mb-4">
                        How a lesson works
                    </h2>
                    <p className="text-slate-300 leading-relaxed">
                        Every lesson follows the same four steps, from the idea to code you wrote yourself.
                    </p>
                </div>
                <ol className="grid gap-x-8 gap-y-12 md:grid-cols-2">
                    {STEPS.map(({ title, icon: Icon, text, Preview }, i) => (
                        <li key={title} className="min-w-0 border-l-2 border-white/10 pl-5">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-sm font-mono font-semibold text-cyan-300 tabular-nums" aria-hidden="true">
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <Icon size={18} className="text-slate-300" aria-hidden="true" />
                                <h3 className="text-white font-bold text-lg font-display">{title}</h3>
                            </div>
                            <p className="text-slate-300 text-sm leading-relaxed mb-4 max-w-prose">{text}</p>
                            <Preview />
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
