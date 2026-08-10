import Code from '../Code';
import LogisticRegressionVisual from '../LogisticRegressionVisual';

// Explains essay: Logistic Regression (see pages/Explains.jsx for the registry).
export default {
    slug: 'logistic-regression',
    title: 'Logistic Regression',
    tagline: 'Turning a straight line into a probability',
    minutes: 7,
    subtitle:
        'The Linear Regression essay predicted a number. Most real decisions need something narrower: a probability between 0% and 100%, and a yes/no call. Logistic regression is the small, elegant fix that gets you there — scroll to watch a real model train on 20 students\' exam results.',
    Visual: LogisticRegressionVisual,
    steps: [
        {
            title: 'Will this student pass?',
            body: (
                <>
                    <p>
                        Twenty students, each logging hours studied before an exam and whether they passed. The
                        circles are students who passed; the squares are students who didn't. Even by eye, more
                        hours clearly means a better shot at passing — but the transition isn't a hard cutoff.
                    </p>
                    <p>
                        We want a model that outputs, for any number of hours, the <em>probability</em> of a pass —
                        not just a guess.
                    </p>
                </>
            ),
        },
        {
            title: 'Why not just fit a straight line?',
            body: (
                <>
                    <p>
                        The obvious first move: reuse ordinary least squares from the Linear Regression essay,
                        treating pass = 1 and fail = 0 as numbers. Here's that fit, dashed, on the same data.
                    </p>
                    <p>
                        It's broken by construction. At 0 hours it predicts a probability <em>below</em> 0%, and
                        past about 5.5 hours it predicts <em>above</em> 100%. A straight line has no way to know
                        that its output has to stay between 0 and 1.
                    </p>
                </>
            ),
        },
        {
            title: 'Squash it with a sigmoid',
            body: (
                <>
                    <p>
                        Logistic regression keeps the linear part — <Code>z = w · hours + b</Code> — but feeds it
                        through the <Code>sigmoid function</Code>, <Code>σ(z) = 1 / (1 + e^-z)</Code>, before
                        calling it a probability. Whatever number <Code>z</Code> is, huge or tiny, the sigmoid
                        squashes it into somewhere strictly between 0 and 1.
                    </p>
                    <p>
                        Before any training, both weights start at zero: <Code>w = 0, b = 0</Code>. Every student
                        gets the exact same prediction, 50%, no matter how many hours they studied — the flat line
                        above the data. That's the honest starting point: no evidence yet, so no lean either way.
                    </p>
                </>
            ),
        },
        {
            title: 'Ten steps of gradient descent',
            body: (
                <>
                    <p>
                        Just like the Gradient Descent essay, we nudge <Code>w</Code> and <Code>b</Code> to reduce
                        error — except the error here is <Code>log-loss</Code>, which punishes a confident wrong
                        prediction far more harshly than a cautious one.
                    </p>
                    <p>
                        Ten steps in, the curve has barely tilted. Ten passes over twenty students isn't much
                        evidence yet, and the learning rate is deliberately modest.
                    </p>
                </>
            ),
        },
        {
            title: 'A hundred steps: a real shape',
            body: (
                <>
                    <p>
                        By 100 steps an unmistakable S-curve has formed, low on the left and high on the right,
                        with a dashed vertical line marking the point where the model flips from predicting fail
                        to predicting pass.
                    </p>
                    <p>
                        Gradient descent is doing the same slope-following arithmetic here as it did for linear
                        regression — just on a differently shaped error surface.
                    </p>
                </>
            ),
        },
        {
            title: 'A thousand steps: nearly there',
            body: (
                <>
                    <p>
                        The curve has steepened further and the boundary has settled close to where it will end
                        up. Progress is visibly slowing — most of the big gains happened in the first hundred
                        steps, and each additional step now buys a smaller correction.
                    </p>
                    <p>That flattening-out is what convergence looks like from the inside.</p>
                </>
            ),
        },
        {
            title: 'Converged',
            body: (
                <>
                    <p>
                        After 5,000 steps the fit has settled: <Code>w ≈ 1.50</Code>, <Code>b ≈ -4.08</Code>. The
                        model now crosses 50% at about 2.7 hours studied — students below that line are called
                        fail, students above it are called pass, and every prediction is a real, calibrated
                        probability in between.
                    </p>
                    <p>
                        This exact fit — down to two decimal places — matches the textbook solution for this
                        dataset, computed here from scratch with nothing but a loop.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the slider to pick any number of study hours and watch the trained model's prediction
                        move along the curve in real time — the marker switches from a square to a circle exactly
                        at the 50% crossing.
                    </p>
                    <p className="text-text-muted text-sm">
                        Notice the probability changes fastest near the boundary and barely at all near the
                        extremes — the sigmoid is steepest where the model is least sure.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        Compare the two curves directly: the logistic fit (solid) never leaves 0–100%; the straight
                        line (dashed) still does. But logistic regression's boundary is exactly one straight cut —
                        with one input feature that's a point, with two it's a line, and it can't bend around a
                        pattern that genuinely curves, unless you engineer new features (like <Code>hours²</Code>)
                        to give it something to work with.
                    </p>
                    <p>
                        It's also sensitive to feature scale — gradient descent converges far more evenly when
                        inputs are on comparable ranges — and a 50% threshold is a default, not a law: for a
                        medical screening test you might deliberately flag anything above 20%.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Logistic regression = <strong>fit a straight line, then squash it through a sigmoid</strong> so the
                output is always a valid probability. Trained by the same gradient descent as linear regression,
                just minimizing log-loss instead of squared error.
            </p>
            <p>
                Pair it with the <strong>Confusion Matrix</strong> and <strong>ROC Curve &amp; AUC</strong> essays to
                judge the classifier this produces, and ask Vaathiyaar to fit{' '}
                <Code>sklearn.linear_model.LogisticRegression</Code> on this same dataset in the Playground.
            </p>
        </>
    ),
};
