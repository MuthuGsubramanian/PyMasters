import Code from '../Code';
import DecisionTreeVisual from '../DecisionTreeVisual';

// Explains essay: Decision Trees (see pages/Explains.jsx for the registry).
export default {
    slug: 'decision-trees',
    title: 'Decision Trees',
    tagline: 'The flowchart that learns itself',
    minutes: 6,
    subtitle:
        'Every "should I take an umbrella?" decision you make is a flowchart. A decision tree is a flowchart a computer writes for itself, straight from data — and watching it grow explains half of practical machine learning, including why XGBoost exists. Scroll to grow one.',
    Visual: DecisionTreeVisual,
    steps: [
        {
            title: 'You already run flowcharts',
            body: (
                <>
                    <p>
                        Raining? Take the umbrella. Not raining? Sunglasses. One question, one branch per answer,
                        a decision at each leaf — that's a flowchart, and you execute dozens a day without noticing.
                    </p>
                    <p>
                        Flowcharts are how humans encode decisions. The question for this essay: can a machine{' '}
                        <em>write its own</em>?
                    </p>
                </>
            ),
        },
        {
            title: 'Now add data',
            body: (
                <>
                    <p>
                        Here are fruits measured two ways: <Code>weight</Code> across, <Code>roundness</Code> up.
                        Blue dots are apples, the others lemons. A new mystery fruit arrives — which is it?
                    </p>
                    <p>
                        Nobody hands us the flowchart this time. The tree has to <strong>discover the questions</strong>{' '}
                        from the labelled examples.
                    </p>
                </>
            ),
        },
        {
            title: 'The first question',
            body: (
                <>
                    <p>
                        The algorithm tries every possible question — "weight &gt; 90?", "weight &gt; 120?",
                        "roundness &gt; 50?" — and scores each by how cleanly it separates the classes (measured
                        with <Code>gini impurity</Code> or <Code>entropy</Code>).
                    </p>
                    <p>
                        "Weight &gt; 120?" wins: everything to the right is almost purely apples. That single best
                        question becomes the root of the flowchart.
                    </p>
                </>
            ),
        },
        {
            title: 'Ask again, inside each region',
            body: (
                <>
                    <p>
                        The left side is still mixed — so the tree recurses: within just that region, it searches
                        for the next best question. "Roundness &gt; 60?" splits the remaining lemons from the
                        low-hanging apples.
                    </p>
                    <p>
                        That's the whole algorithm: <strong>split, then split the messy parts again</strong>, until
                        regions are pure enough.
                    </p>
                </>
            ),
        },
        {
            title: 'The flowchart IS the model',
            body: (
                <>
                    <p>
                        Shade each region by its answer and you can see the model: the feature space carved into
                        rectangles, each owned by a leaf. Predicting = dropping a new point in and reading the
                        region's label.
                    </p>
                    <p>
                        This is why trees are loved in the real world: you can <em>print the model out</em> and
                        argue with it. Try that with a neural network.
                    </p>
                </>
            ),
        },
        {
            title: 'Growing too deep',
            body: (
                <>
                    <p>
                        Notice the two stray points sitting in enemy territory? Let the tree keep splitting and it
                        will carve absurd little boxes around them — a flowchart with a dedicated question for
                        every fluke in the training data.
                    </p>
                    <p>
                        That's <Code>overfitting</Code>, tree edition: perfect on training data, brittle on
                        anything new. (The Train/Test Split essay shows how you'd catch it.)
                    </p>
                </>
            ),
        },
        {
            title: 'Prune it back',
            body: (
                <>
                    <p>
                        The cure is humility, enforced with knobs: <Code>max_depth</Code> caps how many questions
                        deep the chart goes, <Code>min_samples_leaf</Code> forbids leaves that exist for a single
                        point.
                    </p>
                    <p>
                        A pruned tree accepts a few mistakes on the training data — those two strays stay
                        misclassified — in exchange for rules that generalise.
                    </p>
                </>
            ),
        },
        {
            title: 'One tree is rarely enough',
            body: (
                <>
                    <p>
                        A single tree is interpretable but jumpy — move one training point and the whole flowchart
                        can reshuffle. The fix that dominates modern tabular ML: <strong>use many trees</strong>{' '}
                        and combine them.
                    </p>
                    <p>
                        Grow them independently on random subsets and you get a <Code>random forest</Code>. Grow
                        them <em>sequentially, each fixing the last one's errors</em> — that's gradient boosting,
                        and it has its own essay: XGBoost.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A decision tree = <strong>a flowchart learned from data</strong>: repeatedly pick the question
                that best purifies the classes, recurse into the messy parts, and prune so it doesn't memorise
                flukes. Its regions are readable, its weakness is instability — which ensembles fix.
            </p>
            <p>
                Next stop: the <strong>XGBoost</strong> essay to see trees team up — or ask Vaathiyaar to train a{' '}
                <Code>DecisionTreeClassifier</Code> in the Playground and print the learned rules.
            </p>
        </>
    ),
};
