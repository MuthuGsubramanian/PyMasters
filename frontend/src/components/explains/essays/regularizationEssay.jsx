import Code from '../Code';
import RegularizationVisual from '../RegularizationVisual';

// Explains essay: Regularization — Ridge & Lasso (see pages/Explains.jsx for the registry).
export default {
    slug: 'regularization',
    title: 'Regularization: Ridge & Lasso',
    tagline: 'Teaching a model not to try so hard',
    minutes: 7,
    subtitle:
        'A flexible model can fit ten points almost perfectly — and still be useless on the eleventh. Regularization fixes this with one blunt idea: penalize big coefficients, so the model has to earn every twist of the curve. Scroll to watch a real fit blow up, get tamed, and land at a value chosen the only honest way — by how it does on data it never saw.',
    Visual: RegularizationVisual,
    steps: [
        {
            title: 'Not much slack',
            body: (
                <>
                    <p>
                        Ten points, and a curve flexible enough to have nine coefficients of its own to tune — one
                        for the trend, eight more for how sharply it can bend. That's barely more numbers to fit
                        than there are points to fit them with.
                    </p>
                    <p>
                        You can already guess the trouble: with that much freedom and that little data, the curve
                        doesn't have to find the trend. It can just thread the needle through every point instead.
                    </p>
                </>
            ),
        },
        {
            title: 'Given the freedom, it takes it',
            body: (
                <>
                    <p>
                        Fit that curve with plain least squares — no penalty, nothing held back — and this happens.
                        It grazes close to every training point, then whips wildly between them and rockets off the
                        chart at both edges.
                    </p>
                    <p>
                        The tell is in the coefficients themselves: a couple of them land in the dozens, sometimes
                        the nineties, when the underlying trend barely needed values above one or two. Huge,
                        wildly-alternating coefficients are what a model looks like when it's chasing noise instead
                        of signal.
                    </p>
                </>
            ),
        },
        {
            title: 'Penalize bigness',
            body: (
                <>
                    <p>
                        <Code>Ridge regression</Code> changes what "best fit" means. Instead of minimizing error
                        alone, it minimizes error <em>plus</em> a penalty proportional to the sum of the squared
                        coefficients: <Code>loss + λ · Σβ²</Code>.
                    </p>
                    <p>
                        Now a coefficient has to justify its size — a huge β better be buying a large drop in error,
                        or the penalty isn't worth it. The faded curve is the old unpenalized fit; the new one is
                        visibly calmer already.
                    </p>
                </>
            ),
        },
        {
            title: 'Turning the dial',
            body: (
                <>
                    <p>
                        <Code>λ</Code> (lambda) is how hard the penalty pushes. Near zero, it barely restrains
                        anything — the wild curve from before. Crank it up and the curve smooths out into something
                        much closer to the trend. Crank it too far and it gives up on the data almost entirely,
                        flattening toward a nearly straight line.
                    </p>
                    <p>Same data, same algorithm — three completely different personalities, tuned by one number.</p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Six more points — shown as diamonds — were set aside before any fitting happened. They're
                        the <Code>held-out set</Code>: never used to choose a coefficient, only to grade the result
                        afterward.
                    </p>
                    <p className="text-text-muted text-sm">
                        Drag λ from low to high. Watch the training error climb steadily — but the held-out error
                        does something more interesting: it drops first, then rises. Find the lowest point you can.
                    </p>
                </>
            ),
        },
        {
            title: 'Two errors, two different stories',
            body: (
                <>
                    <p>
                        Plot both errors against λ and the shapes explain everything. Training error rises the whole
                        way — more penalty always makes the model fit its own data slightly worse, by design.
                    </p>
                    <p>
                        Held-out error is <Code>U</Code>-shaped. At low λ it's hurt by overfitting; at high λ it's
                        hurt by underfitting. The bottom of that <em>U</em> is the one honest way to choose λ: scan a
                        range, measure held-out error at each, keep the value that minimizes it. That's what{' '}
                        <Code>cross-validation</Code> automates in practice.
                    </p>
                </>
            ),
        },
        {
            title: 'What the winner looks like',
            body: (
                <>
                    <p>
                        This is that best λ, found the way it should be — by grid-searching held-out error, never by
                        looking at how pretty the curve looks. Compared to the unpenalized fit fading in the
                        background, it gives up almost nothing near the training points and gains enormous stability
                        everywhere else.
                    </p>
                    <p>
                        It doesn't pass through every dot. That's not a flaw — a curve that ignores individual noisy
                        points to track the shared trend is exactly what "generalizes" means.
                    </p>
                </>
            ),
        },
        {
            title: 'Shrink vs. select — and the catches',
            body: (
                <>
                    <p>
                        Ridge's <Code>L2</Code> penalty shrinks every coefficient smoothly toward zero but rarely
                        lands exactly on it. Swap the penalty to the sum of <em>absolute</em> values —{' '}
                        <Code>L1</Code>, giving <Code>Lasso</Code> — and coefficients can be driven to exactly zero.
                        Here Lasso zeroes out most of them entirely, at a comparable held-out error to ridge — free
                        feature selection as a side effect of the penalty shape.
                    </p>
                    <p>
                        The honest caveats: this only works if features are on comparable scales first (an
                        unpenalized giant feature dwarfs the rest), the intercept is never penalized, and λ is a
                        hyperparameter you must search for — there's no formula that hands it to you.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Regularization = <strong>add a penalty for coefficient size, so the model must trade fitting error
                for simplicity</strong>. Ridge (<Code>L2</Code>) shrinks everything smoothly; Lasso (<Code>L1</Code>)
                can zero features out entirely. Either way, the penalty strength is chosen by the one metric that
                can't lie to you: error on data the model never touched during training.
            </p>
            <p>
                The <strong>Train / Test Split</strong> essay is the prerequisite idea this one builds on. The{' '}
                <strong>Classroom</strong> lesson "Regularization: Preventing Overfitting" goes further into dropout
                and batch normalization for neural nets — and Vaathiyaar can fit a real <Code>Ridge</Code> or{' '}
                <Code>Lasso</Code> from scikit-learn on your own data in the Playground.
            </p>
        </>
    ),
};
