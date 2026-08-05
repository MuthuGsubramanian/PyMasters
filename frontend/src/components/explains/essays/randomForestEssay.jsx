import Code from '../Code';
import RandomForestVisual from '../RandomForestVisual';

// Explains essay: Random Forests (see pages/Explains.jsx for the registry).
export default {
    slug: 'random-forest',
    title: 'Random Forests',
    tagline: 'Many wrong trees, one right answer',
    minutes: 6,
    subtitle:
        'A single decision tree is readable but jumpy — resample the training data slightly and the whole flowchart can reshuffle. A random forest turns that instability into a strength: grow hundreds of imperfect trees on purpose, then let them vote. Scroll to grow one.',
    Visual: RandomForestVisual,
    steps: [
        {
            title: 'One tree, all the data',
            body: (
                <>
                    <p>
                        Here's the same weight-vs-roundness fruit data from the Decision Trees essay, and an
                        ordinary tree grown on all twenty of them: every split gets to consider both features and
                        pick whichever question best separates apples from lemons.
                    </p>
                    <p>
                        It gets 19 of 20 right. Only one of the two ambiguous fruits — planted deliberately near
                        the boundary — fools it. So far, so good.
                    </p>
                </>
            ),
        },
        {
            title: 'Shuffle the deck',
            body: (
                <>
                    <p>
                        Now do something odd on purpose: build a new training set by drawing 20 fruits{' '}
                        <em>with replacement</em> from the original 20. Some get picked twice or three times;
                        others don't get picked at all.
                    </p>
                    <p>
                        This is a <Code>bootstrap sample</Code>. The points marked <Code>×2</Code> here were drawn
                        twice; the faded ones weren't drawn at all this round — they're this tree's{' '}
                        <Code>out-of-bag</Code> set.
                    </p>
                </>
            ),
        },
        {
            title: 'Grow it, half-blind',
            body: (
                <>
                    <p>
                        Grow a tree on that resample — but add one more restriction: at each split, the tree may
                        only look at <strong>one randomly-chosen feature</strong>, not both. With just two features
                        here that means roughly half the splits are decided by roundness alone, half by weight
                        alone, whichever the coin flip picked.
                    </p>
                    <p>
                        The regions have shifted from the baseline tree — a different resample plus a handicapped
                        view of the data changed the questions the tree even considered asking.
                    </p>
                </>
            ),
        },
        {
            title: 'Repeat, a lot',
            body: (
                <>
                    <p>
                        Do that 25 times: 25 different resamples, 25 different random feature choices, 25
                        different trees. Here are the first three, overlaid — solid, dashed, and dotted boundaries
                        that all disagree with each other in the middle of the plot.
                    </p>
                    <p>
                        Individually, each of these trees is a worse model than the single tree from step one. That's
                        the point — they're wrong in <em>different, uncorrelated</em> ways.
                    </p>
                </>
            ),
        },
        {
            title: "Vote, don't pick one",
            body: (
                <>
                    <p>
                        For any new fruit, ask all the trees and take the majority answer. With just 3 trees voting,
                        the combined region (shaded by whichever class wins each cell) is already less erratic than
                        any single tree's boundary.
                    </p>
                    <p>
                        This is <Code>bagging</Code> — bootstrap aggregating — plus the per-split feature restriction.
                        Together, the two tricks are what "random" means in random forest.
                    </p>
                </>
            ),
        },
        {
            title: 'More trees, less noise',
            body: (
                <>
                    <p>
                        Grow the forest to 9 trees and the region settles further. Each tree still overfits its own
                        resample — that never stops — but their individual mistakes are uncorrelated, so averaging
                        cancels most of them out. What's left over is closer to the true pattern.
                    </p>
                    <p>
                        This is the same idea as averaging many noisy measurements: the noise shrinks, the signal
                        doesn't.
                    </p>
                </>
            ),
        },
        {
            title: 'The free lunch: out-of-bag validation',
            body: (
                <>
                    <p>
                        Remember the fruits each tree never saw in step two? For a bootstrap sample of size N, the
                        chance any one fruit is excluded works out to ((N−1)/N)<sup>N</sup> — computed here for
                        N = 20, that's ≈{' '}
                        {(() => { const n = 20; return (Math.pow((n - 1) / n, n) * 100).toFixed(1); })()}%
                        (and it converges to 1/e ≈ 36.8% as N grows).
                    </p>
                    <p>
                        So roughly a third of the data is "held out" for every tree, automatically, for free. Score
                        each tree only on its own out-of-bag fruits and you get an honest accuracy estimate —{' '}
                        <Code>OOB score</Code> — without ever building a separate test set.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the slider to change how many trees are in the forest and watch the diamond query
                        point's vote and the shaded region respond. Does the verdict ever flip as you add trees?
                        How few trees does it take before the region stops changing much?
                    </p>
                    <p className="text-text-muted text-sm">
                        (The diamond sits deliberately near the boundary — with only 1–2 trees its verdict can go
                        either way, which is exactly the instability voting is meant to fix.)
                    </p>
                </>
            ),
        },
        {
            title: 'One tree vs. many',
            body: (
                <>
                    <p>
                        The full 25-tree forest's vote for the diamond is shown below. No single tree in that forest
                        is more accurate or more interpretable than the plain tree from step one — the forest wins
                        by not depending on any one of them being right.
                    </p>
                    <p>
                        That trade — losing the "print the model out" readability of a single tree in exchange for
                        stability — is why random forests are a default baseline for tabular data, and why{' '}
                        <Code>feature_importances_</Code> (averaged across all the trees) is usually how people
                        peek back inside.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A random forest = <strong>many decision trees, each grown on a bootstrap resample with a random
                    subset of features per split, combined by majority vote</strong> (or averaging, for regression).
                Bagging plus feature randomness decorrelates the trees' mistakes, so the ensemble is far more
                stable than any single tree — at the cost of easy interpretability.
            </p>
            <p>
                Read the <strong>Decision Trees</strong> essay first if you haven't — this one builds directly on
                it. And where random forests grow trees independently and vote, <strong>XGBoost</strong> grows them
                one at a time, each correcting the last; ask Vaathiyaar to train a{' '}
                <Code>RandomForestClassifier</Code> in the Playground and compare its OOB score to a single tree's
                held-out accuracy.
            </p>
        </>
    ),
};
