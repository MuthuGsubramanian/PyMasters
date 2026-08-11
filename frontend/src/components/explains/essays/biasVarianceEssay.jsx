import Code from '../Code';
import BiasVarianceVisual from '../BiasVarianceVisual';

// Explains essay: The Bias-Variance Tradeoff (see pages/Explains.jsx for the registry).
export default {
    slug: 'bias-variance-tradeoff',
    title: 'The Bias-Variance Tradeoff',
    tagline: 'Why the model with the best training score can be the worst model',
    minutes: 7,
    subtitle:
        'Every model you fit has to survive a tension: too simple and it can\'t see the pattern; too complex and it starts memorising noise instead of learning it. This is that tension, made visible — 18 points, eight polynomials, and the real errors each one produces.',
    Visual: BiasVarianceVisual,
    steps: [
        {
            title: 'A curve hiding in noise',
            body: (
                <>
                    <p>
                        Eighteen points, each an <Code>x</Code> and a noisy <Code>y</Code>. Twelve are circles —
                        the model gets to learn from these. Six are squares, set aside and never touched during
                        fitting, exactly like the <Code>train/test split</Code> essay.
                    </p>
                    <p>
                        Somewhere under the noise is a real curve. The question this essay answers: how complex
                        should a model be allowed to get while trying to find it?
                    </p>
                </>
            ),
        },
        {
            title: 'Too simple: underfitting',
            body: (
                <>
                    <p>
                        A degree-1 polynomial is just a straight line. Fit to the circles, it can't bend — it
                        misses the curve entirely. Train error: <Code>0.423</Code>. Test error: <Code>0.654</Code>.
                    </p>
                    <p>
                        Notice the two numbers are both bad <em>and</em> close together. That pairing is the
                        signature of <Code>high bias</Code>: the model is too rigid to capture the pattern, so it
                        fails on data it has seen and data it hasn't, about equally.
                    </p>
                </>
            ),
        },
        {
            title: 'Too eager: overfitting',
            body: (
                <>
                    <p>
                        A degree-8 polynomial has nine free coefficients to bend with — plenty to snake through
                        almost every training circle. Train error drops to <Code>0.045</Code>, the best of any
                        degree tried.
                    </p>
                    <p>
                        But test error explodes to <Code>1.153</Code> — nearly ten times worse than train. The
                        curve didn't learn the pattern; it memorised the noise around each training point. That
                        gap is <Code>high variance</Code>: small changes in which points you happened to sample
                        would swing this curve wildly.
                    </p>
                </>
            ),
        },
        {
            title: 'Two failures, side by side',
            body: (
                <>
                    <p>
                        Here both curves sit over the same data. The dashed line (degree 1) is too stiff to
                        follow the points at all. The dotted line (degree 8) follows them so closely it loops and
                        overshoots between them — technically hugging the circles while abandoning the squares.
                    </p>
                    <p>
                        Neither curve is "wrong" in the way a bug is wrong. Both are doing exactly what they were
                        asked to do. They're just the wrong <em>shape</em> for the job.
                    </p>
                </>
            ),
        },
        {
            title: 'Somewhere in the middle',
            body: (
                <>
                    <p>
                        A degree-4 polynomial has enough flexibility to bend with the real curve, but not so much
                        that it chases individual noisy points. Train error: <Code>0.100</Code>. Test error:{' '}
                        <Code>0.122</Code> — the lowest test error of every degree from 1 to 8.
                    </p>
                    <p>
                        Train and test are close together <em>and</em> low. That's the combination you're
                        actually after — not the lowest training error, the lowest <strong>test</strong> error.
                    </p>
                </>
            ),
        },
        {
            title: 'Turn the dial yourself',
            body: (
                <>
                    <p>
                        Slide through every degree from 1 to 8 and watch both numbers move. Push it up: train
                        error keeps falling — it always can, more flexibility can always fit the training points
                        better — while test error falls, bottoms out, then climbs back up.
                    </p>
                    <p className="text-text-muted text-sm">
                        Every curve here is a real least-squares fit to the same 12 circles, computed live —
                        nothing is precomputed or faked for the slider.
                    </p>
                </>
            ),
        },
        {
            title: 'The shape this always makes',
            body: (
                <>
                    <p>
                        Plot both error curves against degree and a pattern appears that shows up in every model
                        family, not just polynomials: train error (dashed) falls the whole way, while test error
                        (solid) traces a <Code>U</Code> — high on both ends, lowest in the middle.
                    </p>
                    <p>
                        The bottom of that <Code>U</Code> is degree 4 here. To its left is the underfitting zone,
                        high bias. To its right is the overfitting zone, high variance. This is the{' '}
                        <Code>bias-variance tradeoff</Code>: pushing complexity down fixes one failure mode while
                        creating the other, and somewhere in between is the least-bad compromise.
                    </p>
                </>
            ),
        },
        {
            title: 'How you actually find the middle',
            body: (
                <>
                    <p>
                        You can't peek at the real test set to pick a degree — that would defeat the point of
                        holding it back. In practice, <Code>cross-validation</Code> plays this exact same game
                        using only the training data, carving it into folds to estimate test performance honestly.
                    </p>
                    <p>
                        <Code>Regularization</Code> (ridge, lasso) is the other lever: instead of choosing a lower
                        degree outright, it lets the model stay flexible but penalises coefficients that grow too
                        large — the same overfitting fight from a different angle.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Bias-variance tradeoff = <strong>simple models underfit (bad on everything), complex models
                overfit (great on training data, bad on everything else), and the best test performance sits
                somewhere in between</strong>. The training score alone can't tell you which side you're on —
                only a held-out test set can.
            </p>
            <p>
                See <Code>Cross-Validation</Code> for how to find that middle without spending your test set, and{' '}
                <Code>Regularization</Code> for the other way to fight overfitting. Then ask Vaathiyaar to plot a
                real learning curve for a <Code>scikit-learn</Code> model in the Playground.
            </p>
        </>
    ),
};
