import { useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Lightbulb, Clock, ArrowRight } from 'lucide-react';
import ScrollyExplain from '../components/ScrollyExplain';
import GradientDescentVisual from '../components/explains/GradientDescentVisual';

// ──────────────────────────────────────────────────────────────────────────────
// Explains — MLU-Explain-style visual essays: one concept, one persistent
// visual that evolves as you scroll, plain language, a moment of hands-on
// interaction, and an honest takeaway. Register new essays in ESSAYS below.
// ──────────────────────────────────────────────────────────────────────────────

const Code = ({ children }) => (
    <span className="bg-accent-subtle text-accent-primary px-1 py-0.5 rounded text-[13px] font-mono">{children}</span>
);

const GRADIENT_DESCENT = {
    slug: 'gradient-descent',
    title: 'Gradient Descent',
    tagline: 'How machines learn by rolling downhill',
    minutes: 6,
    subtitle:
        'Nearly every neural network — from a spam filter to a large language model — learns with one deceptively simple idea: measure how wrong you are, then nudge yourself slightly less wrong. Scroll to watch it happen.',
    Visual: GradientDescentVisual,
    steps: [
        {
            title: 'A model is just numbers',
            body: (
                <>
                    <p>
                        Imagine you're blindfolded on a hillside and need to reach the bottom of the valley.
                        You can't see — but you <em>can</em> feel the slope under your feet.
                    </p>
                    <p>
                        That's exactly the situation a machine-learning model is in. The ball is the model's
                        current <Code>parameter</Code> — one number it's allowed to change.
                    </p>
                </>
            ),
        },
        {
            title: 'The loss landscape',
            body: (
                <>
                    <p>
                        For every possible parameter value we can measure the <Code>loss</Code> — how wrong the
                        model's predictions are. Plot loss against the parameter and you get this curve.
                    </p>
                    <p>
                        Low points mean good predictions. Learning is nothing more than finding the bottom of
                        this valley — the parameter value with the least error.
                    </p>
                </>
            ),
        },
        {
            title: 'Which way is down?',
            body: (
                <>
                    <p>
                        The blindfolded hiker feels the slope. A model computes it: the <Code>gradient</Code> is
                        the mathematical slope of the loss at the current position.
                    </p>
                    <p>
                        The gradient points <em>uphill</em> — so we go the opposite way. That arrow is
                        the negative gradient: the direction of steepest descent.
                    </p>
                </>
            ),
        },
        {
            title: 'Take a step',
            body: (
                <>
                    <p>One learning step is a single line of arithmetic:</p>
                    <div className="surface-code rounded-xl px-4 py-3 font-mono text-xs">
                        x<sub>new</sub> = x − η · slope(x)
                    </div>
                    <p>
                        <Code>η</Code> (eta) is the <Code>learning rate</Code> — how big a stride to take.
                        The ball just took one step with η = 0.55 and landed noticeably closer to the bottom.
                    </p>
                </>
            ),
        },
        {
            title: 'Too timid',
            body: (
                <>
                    <p>
                        Make η tiny and every step barely moves. After <em>ten</em> steps the ball has crawled
                        only partway down.
                    </p>
                    <p>
                        In a real network, this is a model that would need days of training to reach what a
                        better setting finds in minutes.
                    </p>
                </>
            ),
        },
        {
            title: 'Too bold',
            body: (
                <>
                    <p>
                        Make η too large and each stride flies <em>past</em> the bottom and lands higher on the
                        opposite wall. The ball ricochets between the valley walls, getting worse every step.
                    </p>
                    <p>This is <Code>divergence</Code> — the training run that blows up instead of learning.</p>
                </>
            ),
        },
        {
            title: 'Just right',
            body: (
                <>
                    <p>
                        With a well-chosen η something elegant happens on its own: steps are big where the slope
                        is steep, and naturally shrink as the ground flattens near the bottom — because the step
                        size is <em>proportional to the slope</em>.
                    </p>
                    <p>Six steps, and the ball settles into the minimum.</p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the slider to pick a learning rate, then run the descent. Can you find a value that
                        converges in under five hops? And what's the smallest η that still diverges?
                    </p>
                    <p className="text-text-muted text-sm">
                        (Around η ≈ 0.91 the very first step lands exactly at the bottom — and past η ≈ 1.82 every
                        step makes things worse.)
                    </p>
                </>
            ),
        },
        {
            title: 'The real world is bumpy',
            body: (
                <>
                    <p>
                        Real loss landscapes aren't clean parabolas — they have many dips. Plain gradient descent
                        can settle into a <Code>local minimum</Code> and stop, never discovering a deeper valley
                        beyond the next hill.
                    </p>
                    <p>
                        And real models don't have one parameter — they have millions or billions, so this valley
                        lives in a space no one can picture. The arithmetic, though, stays exactly the same.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Gradient descent = <strong>measure the slope of your error, step the other way, repeat</strong>.
                The learning rate decides whether you crawl, converge, or explode — and modern optimizers like{' '}
                <Code>Adam</Code> are, at heart, gradient descent with an adaptively tuned step size.
            </p>
            <p>
                Want to feel it in code? Open the <strong>Playground</strong> and ask Vaathiyaar to demonstrate
                gradient descent in NumPy — it can run the example live.
            </p>
        </>
    ),
};

export const ESSAYS = [GRADIENT_DESCENT];

// ── Index page ────────────────────────────────────────────────────────────────
function ExplainsIndex() {
    const navigate = useNavigate();
    useEffect(() => { document.title = 'Explains — PyMasters'; }, []);
    return (
        <div className="min-h-screen">
            <header className="mb-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shadow-glow">
                    <Lightbulb size={20} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold font-display text-text-primary">Explains</h1>
                    <p className="text-xs text-text-muted">Visual, scroll-driven essays — one concept at a time</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ESSAYS.map((essay) => (
                    <button
                        key={essay.slug}
                        onClick={() => navigate(`/dashboard/explains/${essay.slug}`)}
                        className="panel panel-hover rounded-2xl p-5 text-left group cursor-pointer"
                    >
                        {/* Thumbnail: miniature of the essay's visual, step 6 (converged) */}
                        <div className="h-32 rounded-xl bg-bg-inset mb-4 overflow-hidden pointer-events-none" aria-hidden="true">
                            <essay.Visual stepIndex={6} />
                        </div>
                        <h2 className="text-base font-bold font-display text-text-primary group-hover:text-accent-primary transition-colors">
                            {essay.title}
                        </h2>
                        <p className="text-sm text-text-secondary mt-1">{essay.tagline}</p>
                        <p className="text-[11px] text-text-muted mt-3 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Clock size={11} />{essay.minutes} min</span>
                            <span className="flex items-center gap-1 text-accent-primary font-medium">
                                Scroll the story <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                            </span>
                        </p>
                    </button>
                ))}

                {/* Coming-next card keeps the grid honest about scope */}
                <div className="rounded-2xl border border-dashed border-border-strong p-5 flex flex-col items-start justify-center text-left opacity-70">
                    <h2 className="text-sm font-bold font-display text-text-primary">More on the way</h2>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                        Embeddings & semantic search · train/test splits · how Python's iterator protocol works.
                        Tell Vaathiyaar which concept you'd like explained visually next.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Essay view ────────────────────────────────────────────────────────────────
export default function Explains() {
    const { slug } = useParams();
    useEffect(() => {
        const essay = ESSAYS.find((e) => e.slug === slug);
        document.title = essay ? `${essay.title} — PyMasters Explains` : 'Explains — PyMasters';
        window.scrollTo(0, 0);
    }, [slug]);

    if (!slug) return <ExplainsIndex />;
    const essay = ESSAYS.find((e) => e.slug === slug);
    if (!essay) return <Navigate to="/dashboard/explains" replace />;

    return (
        <ScrollyExplain
            title={essay.title}
            subtitle={essay.subtitle}
            minutes={essay.minutes}
            steps={essay.steps}
            Visual={essay.Visual}
            takeaway={essay.takeaway}
        />
    );
}
