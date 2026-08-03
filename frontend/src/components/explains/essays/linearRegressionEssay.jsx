import Code from '../Code';
import LinearRegressionVisual from '../LinearRegressionVisual';

// Explains essay: Linear Regression (see pages/Explains.jsx for the registry).
export default {
    slug: 'linear-regression',
    title: 'Linear Regression',
    tagline: 'Drawing the best line through noisy data',
    minutes: 6,
    subtitle:
        'Before neural networks, before boosted trees, there was a straight line — and it is still the most-used model in the world. Scroll to see what "best fit" actually means, find the line yourself, and meet the one point that can ruin everything.',
    Visual: LinearRegressionVisual,
    steps: [
        {
            title: 'Points with a story',
            body: (
                <>
                    <p>
                        Each dot is a house: how big it is (right = bigger) and what it sold for (up = pricier).
                        There's clearly a pattern — bigger tends to mean pricier — but it's noisy.
                    </p>
                    <p>
                        We want a <em>rule</em>: hand me a size, I hand you a price. The simplest possible rule
                        is a straight line.
                    </p>
                </>
            ),
        },
        {
            title: 'Infinitely many lines',
            body: (
                <>
                    <p>
                        Here's the problem: you can draw <em>infinitely many</em> lines through this cloud, and
                        several look plausible. Steep, shallow, even slightly downhill.
                    </p>
                    <p>
                        "Best fit" can't be a matter of taste. We need a number that scores how good a line is —
                        then we can pick the line with the best score.
                    </p>
                </>
            ),
        },
        {
            title: 'Measure the miss',
            body: (
                <>
                    <p>
                        Pick any line and every point misses it by some vertical distance — the{' '}
                        <Code>residual</Code>: what the house actually sold for minus what the line predicted.
                    </p>
                    <p>
                        Those red segments are this line's mistakes, drawn to scale. A good line makes them
                        collectively small.
                    </p>
                </>
            ),
        },
        {
            title: 'Why squared?',
            body: (
                <>
                    <p>
                        We don't add up the misses directly — we <strong>square</strong> each one first. Each red
                        square's area is one squared error, so a miss twice as big hurts <em>four</em> times as much.
                    </p>
                    <p>
                        Squaring also removes the sign (missing high and missing low both count) and — the quiet
                        reason it won history — makes the "best line" solvable with plain algebra, no search needed.
                    </p>
                </>
            ),
        },
        {
            title: 'The least-squares line',
            body: (
                <>
                    <p>
                        The line minimising the total squared error is the <Code>least squares</Code> fit, and it
                        has a closed-form answer. In scikit-learn it's one call:{' '}
                        <Code>LinearRegression().fit(X, y)</Code>.
                    </p>
                    <p>
                        The equation on the chart is the learned rule: slope ≈ how many price units each extra
                        size unit buys; intercept ≈ the price of size zero.
                    </p>
                </>
            ),
        },
        {
            title: 'Find it yourself',
            body: (
                <>
                    <p>
                        Drag the slider to tilt the line (it pivots on the mean point — the least-squares line
                        always passes through it). Watch the sum of squared errors respond.
                    </p>
                    <p className="text-text-muted text-sm">
                        Can you match the best possible score? Notice how a range of slopes look <em>visually</em>{' '}
                        fine, but the number tells them apart instantly.
                    </p>
                </>
            ),
        },
        {
            title: 'The Achilles heel: outliers',
            body: (
                <>
                    <p>
                        One wild point — a huge house sold for almost nothing — and the fit visibly tips toward
                        it. Squaring the errors is to blame: a giant miss makes a <em>gigantic</em> square that
                        dominates the total.
                    </p>
                    <p>
                        This is why real workflows plot first (see the EDA essay) and consider robust
                        alternatives like <Code>Huber</Code> loss when the data has heavy tails.
                    </p>
                </>
            ),
        },
        {
            title: 'How good is the fit?',
            body: (
                <>
                    <p>
                        <Code>R²</Code> summarises the fit: the fraction of the price variation the line explains.
                        Here R² ≈ 0.9 — size alone explains most, not all, of the price.
                    </p>
                    <p>
                        And that's the honest reading: regression rarely explains everything. It gives you a
                        baseline every fancier model must beat — which is exactly where XGBoost picks up the story.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Linear regression = <strong>the line that minimises the sum of squared misses</strong>. Residuals
                measure the misses, squaring punishes big ones (and invites outlier trouble), and R² reports how
                much of the story the line explains.
            </p>
            <p>
                Build it for real in the <strong>Classroom</strong> lesson "Linear Regression" — or ask
                Vaathiyaar to fit one in the Playground with <Code>scikit-learn</Code> on live data.
            </p>
        </>
    ),
};
