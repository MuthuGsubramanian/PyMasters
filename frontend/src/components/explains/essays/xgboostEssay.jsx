import Code from '../Code';
import XGBoostVisual from '../XGBoostVisual';

// Explains essay: Gradient Boosting / XGBoost (see pages/Explains.jsx).
export default {
    slug: 'xgboost',
    title: 'XGBoost',
    tagline: 'How weak learners team up to win',
    minutes: 7,
    subtitle:
        'For a decade, one algorithm has quietly won most machine-learning competitions on tabular data — not a neural network, but a swarm of tiny decision trees, each one correcting the errors of the team so far. Scroll to watch gradient boosting build itself, one tree at a time. (The ensemble below is really being fit — nothing is faked.)',
    Visual: XGBoostVisual,
    steps: [
        {
            title: 'A pattern no line can catch',
            body: (
                <>
                    <p>
                        Here's a target that curves and wiggles. Linear regression (previous essay) would slice a
                        single straight line through it and miss badly — the pattern just isn't linear.
                    </p>
                    <p>
                        We could reach for a big complex model. Boosting takes the opposite bet:{' '}
                        <strong>start with a model that's almost insultingly simple</strong>.
                    </p>
                </>
            ),
        },
        {
            title: 'One weak learner',
            body: (
                <>
                    <p>
                        This staircase is a <Code>stump</Code>: a decision tree with a single question — "is x left
                        or right of the split?" — and one flat answer per side. It's the flowchart from the
                        Decision Trees essay, cut to depth one.
                    </p>
                    <p>
                        Alone it's a terrible model. That's the point: it's a <Code>weak learner</Code> — barely
                        better than guessing the average.
                    </p>
                </>
            ),
        },
        {
            title: 'Look at what’s left over',
            body: (
                <>
                    <p>
                        Subtract the stump's predictions from the truth and you get the red bars:{' '}
                        <Code>residuals</Code> — the part of the pattern the model <em>hasn't explained yet</em>.
                    </p>
                    <p>
                        Here's the key move of the whole algorithm: treat those residuals as a{' '}
                        <strong>brand-new dataset</strong>, and train the next tree on them.
                    </p>
                </>
            ),
        },
        {
            title: 'The second tree fixes the first',
            body: (
                <>
                    <p>
                        Tree #2 never sees the original prices — it studies the <em>mistakes</em> and learns where
                        the ensemble is too high or too low. Add its (shrunken) correction and the staircase bends
                        closer to the data. The faint dashed line is where we were with one tree.
                    </p>
                    <p>
                        Each tree is fitted to the current errors, so no two trees do the same job.
                    </p>
                </>
            ),
        },
        {
            title: 'Keep stacking',
            body: (
                <>
                    <p>
                        Five trees in, the big shapes are there. Every round: compute residuals → fit a small tree
                        to them → add a fraction of it. The "gradient" in gradient boosting is exactly the
                        gradient-descent idea from that essay — each tree is one downhill step, taken in{' '}
                        <em>model space</em>.
                    </p>
                </>
            ),
        },
        {
            title: 'An ensemble emerges',
            body: (
                <>
                    <p>
                        Thirty stumps, none smarter than a single if-statement, and together they trace the curve.
                        The fraction we keep of each tree (<Code>η</Code>, the <Code>learning_rate</Code>) is
                        deliberately small — around 0.1–0.5 — so no single tree can dominate.
                    </p>
                    <p>
                        Slow, humble corrections beat one confident guess. Sound familiar? It's the learning-rate
                        lesson from gradient descent, again.
                    </p>
                </>
            ),
        },
        {
            title: 'Grow the team yourself',
            body: (
                <>
                    <p>
                        Drag the slider from 1 to 40 trees and watch the staircase sharpen. Notice the returns
                        shrink: the first five trees do most of the work, the last twenty polish details.
                    </p>
                    <p className="text-text-muted text-sm">
                        On noisy real data, too many trees would eventually start fitting noise — which is why{' '}
                        <Code>n_estimators</Code> is tuned against a held-out set (Train/Test Split essay!).
                    </p>
                </>
            ),
        },
        {
            title: 'So what makes it XGBoost?',
            body: (
                <>
                    <p>
                        What you just watched is <Code>gradient boosting</Code>. <strong>XGBoost</strong>{' '}
                        ("eXtreme Gradient Boosting") is a famous implementation that made it industrial-strength:
                        regularisation that penalises complicated trees, second-order gradients for smarter steps,
                        native handling of missing values, and ruthless engineering for speed.
                    </p>
                    <p>
                        That combination — plus cousins <Code>LightGBM</Code> and <Code>CatBoost</Code> — is why
                        boosted trees remain the default answer for tabular data, even in the deep-learning era.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Gradient boosting = <strong>fit a weak tree, look at the residuals, fit the next tree to those,
                add a small fraction, repeat</strong>. XGBoost is that recipe with regularisation and serious
                engineering. Key knobs: <Code>n_estimators</Code>, <Code>learning_rate</Code>,{' '}
                <Code>max_depth</Code> — and a held-out test set to know when to stop.
            </p>
            <p>
                Ask Vaathiyaar to train an <Code>XGBRegressor</Code> in the Playground and plot predictions after
                1, 10, and 100 trees — the picture from this essay, on real data.
            </p>
        </>
    ),
};
