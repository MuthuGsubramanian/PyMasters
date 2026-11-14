import { Children, cloneElement, isValidElement, useEffect, useState, useMemo } from 'react';
import { Link, useParams, useNavigate, Navigate } from 'react-router-dom';
import { Lightbulb, Clock, ArrowRight, Search, X, BookOpen } from 'lucide-react';
import ScrollyExplain from '../components/ScrollyExplain';
import DarkModeToggle from '../components/DarkModeToggle';
import PymastersGlyph from '../assets/pymasters-glyph.svg';
import { usePageMeta } from '../utils/usePageMeta';
import GradientDescentVisual from '../components/explains/GradientDescentVisual';
import TrainTestSplitVisual from '../components/explains/TrainTestSplitVisual';
import Code from '../components/explains/Code';
import LINEAR_REGRESSION from '../components/explains/essays/linearRegressionEssay';
import DECISION_TREES from '../components/explains/essays/decisionTreeEssay';
import XGBOOST from '../components/explains/essays/xgboostEssay';
import EDA from '../components/explains/essays/edaEssay';
import KMEANS from '../components/explains/essays/kmeansEssay';
import FUZZY_LOGIC from '../components/explains/essays/fuzzyLogicEssay';
import EMBEDDINGS from '../components/explains/essays/embeddingsEssay';
import ATTENTION from '../components/explains/essays/attentionEssay';
import PCA from '../components/explains/essays/pcaEssay';
import CONFUSION_MATRIX from '../components/explains/essays/confusionMatrixEssay';
import CROSS_VALIDATION from '../components/explains/essays/crossValidationEssay';
import KNN from '../components/explains/essays/knnEssay';
import NAIVE_BAYES from '../components/explains/essays/naiveBayesEssay';
import DBSCAN from '../components/explains/essays/dbscanEssay';
import HIERARCHICAL_CLUSTERING from '../components/explains/essays/hierarchicalClusteringEssay';
import SHAP_VALUES from '../components/explains/essays/shapEssay';
import REGULARIZATION from '../components/explains/essays/regularizationEssay';
import RANDOM_FOREST from '../components/explains/essays/randomForestEssay';
import ANOMALY_DETECTION from '../components/explains/essays/anomalyDetectionEssay';
import ROC_AUC from '../components/explains/essays/rocEssay';
import BAYESIAN_INFERENCE from '../components/explains/essays/bayesianInferenceEssay';
import LOGISTIC_REGRESSION from '../components/explains/essays/logisticRegressionEssay';
import SVM from '../components/explains/essays/svmEssay';
import BIAS_VARIANCE from '../components/explains/essays/biasVarianceEssay';
import TIME_SERIES_FORECASTING from '../components/explains/essays/timeSeriesForecastingEssay';

import GAUSSIAN_MIXTURE from '../components/explains/essays/gmmEssay';
import NEURAL_NETWORK from '../components/explains/essays/neuralNetworkEssay';
import BOOTSTRAP from '../components/explains/essays/bootstrapEssay';
import AB_TESTING from '../components/explains/essays/abTestEssay';
import QUANTIZATION from '../components/explains/essays/quantizationEssay';
import BM25 from '../components/explains/essays/bm25Essay';

// ──────────────────────────────────────────────────────────────────────────────
// Explains — MLU-Explain-style visual essays: one concept, one persistent
// visual that evolves as you scroll, plain language, a moment of hands-on
// interaction, and an honest takeaway. Register new essays in ESSAYS below;
// larger essays live in components/explains/essays/ (one file per essay).
// ──────────────────────────────────────────────────────────────────────────────

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
                Want to feel it in code? Open the{' '}
                <Link to="/dashboard/playground" className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80">
                    Playground
                </Link>{' '}
                and ask Vaathiyaar to demonstrate gradient descent in NumPy — it can run the example live.
            </p>
        </>
    ),
};

const TRAIN_TEST_SPLIT = {
    slug: 'train-test-split',
    title: 'Train / Test Split',
    tagline: 'Why a "perfect" model can be worthless',
    minutes: 5,
    subtitle:
        'A model that scores 100% might be brilliant — or it might have simply memorised its answers. The train/test split is the one discipline that tells the difference. Scroll to see how holding data back keeps machine learning honest.',
    Visual: TrainTestSplitVisual,
    steps: [
        {
            title: 'You have some data',
            body: (
                <>
                    <p>
                        Here's a dataset — ten examples a model could learn from. Say each is a house, and we want
                        to predict its price.
                    </p>
                    <p>
                        The obvious plan: let the model study all ten, then check how well it does. That plan has a
                        trap in it.
                    </p>
                </>
            ),
        },
        {
            title: 'The memorisation trap',
            body: (
                <>
                    <p>
                        If the model learns from <em>all ten</em> and we then test it on <em>those same ten</em>, a
                        good score proves nothing. It could have simply <strong>memorised</strong> each answer.
                    </p>
                    <p>
                        That's like grading an exam with the exact questions from the study guide. Everyone gets an
                        A; nobody learned anything transferable.
                    </p>
                </>
            ),
        },
        {
            title: 'Hold some back',
            body: (
                <>
                    <p>
                        The fix is simple and non-negotiable: before training, cut the data. Keep most of it for
                        learning, and lock the rest away in a <Code>test set</Code> the model is never allowed to
                        see during training.
                    </p>
                    <p>A common cut is <Code>80/20</Code> — eighty percent to learn from, twenty percent held back.</p>
                </>
            ),
        },
        {
            title: 'Train and test',
            body: (
                <>
                    <p>
                        Now the two halves have jobs. The <span style={{ color: 'var(--accent-primary)' }}><strong>train</strong></span> set
                        (left) is what the model studies. The <span style={{ color: 'var(--secondary)' }}><strong>test</strong></span> set
                        (right) waits in the vault.
                    </p>
                    <p>
                        In code this is one slice: <Code>train = data[:cut]</Code>, <Code>test = data[cut:]</Code>.
                    </p>
                </>
            ),
        },
        {
            title: 'The model learns — from train only',
            body: (
                <>
                    <p>
                        Training happens on the left set alone. The model fits itself to those examples, adjusting
                        until its predictions on <em>them</em> are good.
                    </p>
                    <p>The test set is greyed out here on purpose: during training it does not exist to the model.</p>
                </>
            ),
        },
        {
            title: 'The moment of truth',
            body: (
                <>
                    <p>
                        Now we score both sets. A <em>healthy</em> model does about as well on the unseen test data
                        as on the data it trained on — the two bars are close.
                    </p>
                    <p>That small gap is the sound of a model that actually <strong>learned the pattern</strong>.</p>
                </>
            ),
        },
        {
            title: 'When it goes wrong: overfitting',
            body: (
                <>
                    <p>
                        Here's the failure everyone hits. The model aces the training data — 99% — but stumbles on
                        the unseen test set. A big gap between the bars is the signature of <Code>overfitting</Code>:
                        the model memorised instead of generalising.
                    </p>
                    <p>
                        Only the held-out test set could reveal this. Score on the training data alone and you'd
                        have shipped a model that looks perfect and fails in production.
                    </p>
                </>
            ),
        },
        {
            title: 'The honest number',
            body: (
                <>
                    <p>
                        This is why every serious ML project splits first and guards the test set like treasure —
                        touched once, at the very end. The <strong>test score is the only honest estimate</strong> of
                        how the model will behave on data it has never seen: your real users.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Train/test split = <strong>learn on one part, judge on another the model never saw</strong>. The gap
                between train and test performance is the single most important diagnostic in applied machine
                learning: small gap = it generalised; large gap = it memorised (<Code>overfitting</Code>).
            </p>
            <p>
                Want to build it? The{' '}
                <Link to="/dashboard/classroom" className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80">
                    Classroom
                </Link>{' '}
                lesson “Train/Test Split” has you implement the split in code — and Vaathiyaar can extend it to a real{' '}
                <Code>scikit-learn</Code> example in the{' '}
                <Link to="/dashboard/playground" className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80">
                    Playground
                </Link>
                .
            </p>
        </>
    ),
};

export const ESSAYS = [
    GRADIENT_DESCENT,
    TRAIN_TEST_SPLIT,
    LINEAR_REGRESSION,
    DECISION_TREES,
    XGBOOST,
    EDA,
    KMEANS,
    FUZZY_LOGIC,
    EMBEDDINGS,
    ATTENTION,
    PCA,
    CONFUSION_MATRIX,
    CROSS_VALIDATION,
    KNN,
    NAIVE_BAYES,
    DBSCAN,
    HIERARCHICAL_CLUSTERING,
    SHAP_VALUES,
    REGULARIZATION,
    RANDOM_FOREST,
    ANOMALY_DETECTION,
    ROC_AUC,
    BAYESIAN_INFERENCE,
    LOGISTIC_REGRESSION,
    SVM,
    BIAS_VARIANCE,
    TIME_SERIES_FORECASTING,
    GAUSSIAN_MIXTURE,
    NEURAL_NETWORK,
    BOOTSTRAP,
    AB_TESTING,
    QUANTIZATION,
    BM25,
];

const ESSAY_CATEGORY_MAP = {
    'gradient-descent': 'Foundations & Evaluation',
    'train-test-split': 'Foundations & Evaluation',
    'eda': 'Foundations & Evaluation',
    'confusion-matrix': 'Foundations & Evaluation',
    'cross-validation': 'Foundations & Evaluation',
    'roc-auc': 'Foundations & Evaluation',
    'bias-variance': 'Foundations & Evaluation',
    'regularization': 'Foundations & Evaluation',
    'bootstrap': 'Foundations & Evaluation',
    'ab-testing': 'Foundations & Evaluation',
    'bayesian-inference': 'Foundations & Evaluation',
    'fuzzy-logic': 'Foundations & Evaluation',
    'linear-regression': 'Supervised ML & Trees',
    'logistic-regression': 'Supervised ML & Trees',
    'decision-trees': 'Supervised ML & Trees',
    'random-forest': 'Supervised ML & Trees',
    'xgboost': 'Supervised ML & Trees',
    'knn': 'Supervised ML & Trees',
    'naive-bayes': 'Supervised ML & Trees',
    'svm': 'Supervised ML & Trees',
    'time-series-forecasting': 'Supervised ML & Trees',
    'kmeans': 'Clustering & Explainability',
    'dbscan': 'Clustering & Explainability',
    'hierarchical-clustering': 'Clustering & Explainability',
    'gaussian-mixture': 'Clustering & Explainability',
    'pca': 'Clustering & Explainability',
    'anomaly-detection': 'Clustering & Explainability',
    'shap-values': 'Clustering & Explainability',
    'neural-network': 'Deep Learning & LLMs',
    'embeddings': 'Deep Learning & LLMs',
    'attention': 'Deep Learning & LLMs',
    'quantization': 'Deep Learning & LLMs',
    'bm25': 'Deep Learning & LLMs',
};

const EXPLAIN_CATEGORIES = [
    'All',
    'Foundations & Evaluation',
    'Supervised ML & Trees',
    'Clustering & Explainability',
    'Deep Learning & LLMs',
];

function linkifyTextSegment(text, keyPrefix) {
    const parts = text.split(/\b(Playground|Classroom)\b/g);
    if (parts.length === 1) return text;
    return parts.map((part, idx) => {
        if (part === 'Playground') {
            return (
                <Link
                    key={`${keyPrefix}-pg-${idx}`}
                    to="/dashboard/playground"
                    className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80"
                >
                    Playground
                </Link>
            );
        }
        if (part === 'Classroom') {
            return (
                <Link
                    key={`${keyPrefix}-cr-${idx}`}
                    to="/dashboard/classroom"
                    className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80"
                >
                    Classroom
                </Link>
            );
        }
        return part;
    });
}

function linkifyTakeaway(node, keyPrefix = 'tk') {
    if (node == null || typeof node === 'boolean') return node;
    if (typeof node === 'string') return linkifyTextSegment(node, keyPrefix);
    if (Array.isArray(node)) {
        return node.map((child, i) => linkifyTakeaway(child, `${keyPrefix}-${i}`));
    }
    if (!isValidElement(node)) return node;
    if (node.type === Link || node.type === 'a' || node.type === Code) {
        return node;
    }
    if (node.type === 'strong' && typeof node.props?.children === 'string') {
        const trimmed = node.props.children.trim();
        if (trimmed === 'Playground' || trimmed === 'Classroom') {
            return (
                <Link
                    key={keyPrefix}
                    to={trimmed === 'Playground' ? '/dashboard/playground' : '/dashboard/classroom'}
                    className="font-semibold text-accent-primary underline underline-offset-2 hover:opacity-80"
                >
                    {trimmed}
                </Link>
            );
        }
    }
    if (!node.props?.children) return node;
    const mappedChildren = Children.map(node.props.children, (child, i) =>
        linkifyTakeaway(child, `${keyPrefix}-${i}`)
    );
    return cloneElement(node, undefined, mappedChildren);
}

function PublicExplainsShell({ children }) {
    return (
        <div className="min-h-screen bg-bg-base text-text-secondary flex flex-col">
            <header className="sticky top-0 z-30 border-b border-border-default bg-bg-surface/90 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-5 min-w-0">
                        <Link to="/" className="inline-flex items-center gap-2.5 min-h-11 shrink-0 group">
                            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center shadow-sm">
                                <img src={PymastersGlyph} alt="" aria-hidden="true" className="w-4 h-4" />
                            </div>
                            <span className="font-display font-bold text-base text-text-primary tracking-tight">
                                PyMasters
                            </span>
                        </Link>
                        <nav aria-label="Public Explains navigation" className="hidden md:flex items-center gap-4 text-sm font-medium">
                            <Link to="/explains" className="text-accent-primary font-semibold transition-colors">
                                All Visual Essays
                            </Link>
                            <Link to="/guides" className="text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1.5">
                                <BookOpen size={14} />
                                <span>Python Guides</span>
                            </Link>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                        <DarkModeToggle />
                        <Link
                            to="/login?mode=signup"
                            className="inline-flex items-center gap-1.5 min-h-11 px-4 py-2 rounded-xl bg-gradient-primary text-white text-xs sm:text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
                        >
                            <span>Start Practicing Free →</span>
                        </Link>
                    </div>
                </div>
            </header>
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
                {children}
            </main>
        </div>
    );
}

// ── Index page ────────────────────────────────────────────────────────────────
function ExplainsIndex({ publicMode = false }) {
    const navigate = useNavigate();
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const basePath = publicMode ? '/explains' : '/dashboard/explains';
    useEffect(() => { document.title = 'Explains — PyMasters'; }, []);

    const filteredEssays = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return ESSAYS.filter((essay) => {
            const cat = ESSAY_CATEGORY_MAP[essay.slug] || 'Foundations & Evaluation';
            if (activeCategory !== 'All' && cat !== activeCategory) return false;
            if (q) {
                const matchTitle = String(essay.title || '').toLowerCase().includes(q);
                const matchTag = String(essay.tagline || '').toLowerCase().includes(q);
                const matchSub = String(essay.subtitle || '').toLowerCase().includes(q);
                if (!matchTitle && !matchTag && !matchSub) return false;
            }
            return true;
        });
    }, [activeCategory, searchQuery]);

    return (
        <div className="min-h-screen space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white shadow-glow">
                        <Lightbulb size={20} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-text-primary">Explains</h1>
                        <p className="text-xs text-text-muted">33 visual, scroll-driven essays — one concept at a time</p>
                    </div>
                </div>
                <div className="relative sm:w-72">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search visual essays..."
                        aria-label="Search visual essays"
                        className="w-full pl-9 pr-8 py-2 rounded-xl bg-bg-surface border border-border-default text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear essay search"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </header>

            <div className="flex flex-wrap gap-2">
                {EXPLAIN_CATEGORIES.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            activeCategory === cat
                                ? 'bg-gradient-primary text-white border-transparent shadow-sm'
                                : 'bg-bg-surface border-border-default text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredEssays.map((essay) => (
                    <button
                        key={essay.slug}
                        type="button"
                        onClick={() => navigate(`${basePath}/${essay.slug}`)}
                        className="panel panel-hover rounded-2xl p-5 text-left group cursor-pointer"
                    >
                        {/* Thumbnail: miniature of the essay's visual, step 6 (converged) */}
                        <div className="h-32 rounded-xl bg-bg-inset mb-4 overflow-hidden pointer-events-none" aria-hidden="true">
                            <essay.Visual stepIndex={6} />
                        </div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-semibold text-accent-primary">
                                {ESSAY_CATEGORY_MAP[essay.slug] || 'Foundations'}
                            </span>
                            <span className="text-xs text-text-muted flex items-center gap-1">
                                <Clock size={11} />{essay.minutes} min
                            </span>
                        </div>
                        <h2 className="text-base font-bold font-display text-text-primary group-hover:text-accent-primary transition-colors">
                            {essay.title}
                        </h2>
                        <p className="text-sm text-text-secondary mt-1">{essay.tagline}</p>
                        <p className="text-xs text-text-muted mt-3 flex items-center gap-3">
                            <span className="flex items-center gap-1 text-accent-primary font-medium">
                                Scroll the story <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                            </span>
                        </p>
                    </button>
                ))}

                {/* Request-a-concept card */}
                <div className="rounded-2xl border border-dashed border-border-strong p-5 flex flex-col items-start justify-center text-left opacity-80">
                    <h2 className="text-sm font-bold font-display text-text-primary">Want another concept explained visually?</h2>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                        From school recursion & sorting to college graph algorithms and production LoRA/RAG — ask Vaathiyaar in any Classroom lesson to generate a custom visual Explain on the spot.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Essay view ────────────────────────────────────────────────────────────────
export default function Explains({ publicMode = false }) {
    const { slug } = useParams();
    const basePath = publicMode ? '/explains' : '/dashboard/explains';
    const activeEssay = useMemo(() => ESSAYS.find((e) => e.slug === slug) || null, [slug]);

    usePageMeta({
        title: activeEssay ? `${activeEssay.title} — PyMasters` : 'Explains — PyMasters',
        description: activeEssay
            ? activeEssay.subtitle
            : '32 interactive, scroll-driven visual essays on Python, machine learning, statistics, and LLMs — by PyMasters.',
        canonicalPath: publicMode ? (slug ? `/explains/${slug}` : '/explains') : undefined,
    });

    useEffect(() => {
        document.title = activeEssay ? `${activeEssay.title} — PyMasters` : 'Explains — PyMasters';
        const main = document.querySelector('main');
        if (main && typeof main.scrollTo === 'function') {
            main.scrollTo({ top: 0, behavior: 'instant' });
        }
        if (typeof window.scrollTo === 'function') {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [slug, activeEssay]);

    if (!slug) {
        const indexView = <ExplainsIndex publicMode={publicMode} />;
        return publicMode ? <PublicExplainsShell>{indexView}</PublicExplainsShell> : indexView;
    }

    if (!activeEssay) return <Navigate to={basePath} replace />;

    const essayView = (
        <ScrollyExplain
            title={activeEssay.title}
            subtitle={activeEssay.subtitle}
            minutes={activeEssay.minutes}
            steps={activeEssay.steps}
            Visual={activeEssay.Visual}
            takeaway={linkifyTakeaway(activeEssay.takeaway)}
            backTo={basePath}
            backLabel={publicMode ? 'All Visual Essays' : 'All Explains'}
        />
    );

    return publicMode ? <PublicExplainsShell>{essayView}</PublicExplainsShell> : essayView;
}
