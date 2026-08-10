import Code from '../Code';
import SVMVisual from '../SVMVisual';

// Explains essay: Support Vector Machines (see pages/Explains.jsx for the registry).
export default {
    slug: 'support-vector-machines',
    title: 'Support Vector Machines',
    tagline: 'Draw the line with the most room to spare',
    minutes: 8,
    subtitle:
        'Logistic Regression drew a line and squashed it into a probability. Support Vector Machines ask a sharper question: of every line that separates the classes, which one leaves the most breathing room on both sides? Scroll to watch a real one get trained, point by point.',
    Visual: SVMVisual,
    steps: [
        {
            title: 'Sort the good parts from the bad',
            body: (
                <>
                    <p>
                        A quality-control station measures two things on every part: how long its calibration took,
                        and its final sensor reading. The circles are parts that <strong>passed</strong>; the squares{' '}
                        <strong>failed</strong>. By eye, the two groups sit in clearly different corners of the plot.
                    </p>
                    <p>
                        We want one straight line that separates them — and that keeps separating <em>new</em> parts
                        correctly, not just these sixteen.
                    </p>
                </>
            ),
        },
        {
            title: 'Any line that separates works... sort of',
            body: (
                <>
                    <p>
                        Here's a line that gets all sixteen parts right — zero mistakes. But look at the two dashed
                        margin lines around it: on the PASS side it barely clears the nearest circle by 0.14, while
                        the FAIL side has 4.95 to spare. It <em>hugs</em> the PASS cluster.
                    </p>
                    <p>
                        That's a fragile boundary. A new part that calibrates just a little faster than usual — still
                        genuinely a PASS — could easily land on the wrong side of a line this tight.
                    </p>
                </>
            ),
        },
        {
            title: 'A wider gap is safer — but is it the widest?',
            body: (
                <>
                    <p>
                        Here's another valid separator, picked to sit roughly down the middle. Its margin is 2.55 on
                        <em> both</em> sides — a much more comfortable buffer than the last line's lopsided 0.14 / 4.95.
                    </p>
                    <p>
                        This is a reasonable-looking guess. But it's still a guess. Nothing here proves it's the{' '}
                        <em>widest</em> possible gap — just one person's eyeball estimate of "the middle."
                    </p>
                </>
            ),
        },
        {
            title: 'Training for real: an aggressive first pass',
            body: (
                <>
                    <p>
                        A Support Vector Machine finds the widest margin by <Code>minimizing</Code> two competing
                        quantities at once: <Code>‖w‖²</Code> (which shrinks the margin the smaller it gets) and{' '}
                        <Code>hinge loss</Code> (which penalizes any point that isn't safely on its correct side).
                        Training starts at <Code>w = [0, 0]</Code> and takes real subgradient steps.
                    </p>
                    <p>
                        After 50 steps the boundary already classifies every point correctly — but it does so with a
                        large <Code>w</Code>, which mathematically means a cramped geometric margin, just 1.15 wide.
                        It's confident, but not yet careful.
                    </p>
                </>
            ),
        },
        {
            title: 'Regularization pulls the margin open',
            body: (
                <>
                    <p>
                        Once every point clears its constraint, the <Code>‖w‖²</Code> term takes over: it keeps
                        shrinking <Code>w</Code> — which <em>widens</em> the geometric margin — for as long as no
                        point is pushed back across the line.
                    </p>
                    <p>
                        By step 1,000, that tug-of-war has already opened the margin from 1.15 to roughly 5.00. Same
                        16 points, same training rule — just more steps for the regularizer to do its work.
                    </p>
                </>
            ),
        },
        {
            title: 'Converged: pinned by two points',
            body: (
                <>
                    <p>
                        By step 20,000 the margin has settled at ≈5.11 and stopped moving — this dataset's boundary
                        has converged to <Code>w ≈ [-0.28, 0.27]</Code>, <Code>b ≈ 0.07</Code>. That's wider than
                        either of the two guesses from earlier, found without anyone eyeballing a "middle."
                    </p>
                    <p>
                        Notice it isn't the balanced-guess line from before, either — training moved past it, then
                        stopped exactly where the margin could grow no further without cutting into the data.
                    </p>
                </>
            ),
        },
        {
            title: 'The support vectors',
            body: (
                <>
                    <p>
                        Only two points — ringed above, one circle and one square — sit exactly on the margin. Every
                        other point could be deleted from the dataset and retrained, and the boundary would land in
                        the <em>exact same place</em>. Move either ringed point, and it would shift.
                    </p>
                    <p>
                        That's the "support" in Support Vector Machine: the model's entire decision rests on whichever
                        handful of points are closest to the other class. The rest of the data was only useful for
                        finding them.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag either slider to place a hypothetical part anywhere on the plot and watch the trained
                        model score it live: <Code>score = w · x + b</Code>. Positive means PASS, negative means
                        FAIL — the marker flips shape exactly at score = 0.
                    </p>
                    <p className="text-text-muted text-sm">
                        Try landing exactly between the two ringed support vectors from the last step — that's the
                        point where the model is least confident either way.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        Everything above assumed the data is perfectly separable by a straight line. Add one stray
                        reading — the dashed square sitting between the two clusters — and no straight line separates
                        the data anymore. Real <Code>soft-margin</Code> SVMs handle this with a penalty{' '}
                        <Code>C</Code>: a small <Code>C</Code> tolerates violations in exchange for a wider margin; a
                        large <Code>C</Code> fits the training data harder and tolerates fewer.
                    </p>
                    <p>
                        Two more honest limits: a straight boundary can't bend around a curved pattern — the{' '}
                        <Code>kernel trick</Code> fixes that by implicitly separating in a higher-dimensional space,
                        at real computational cost — and SVMs are sensitive to feature scale, exactly like gradient
                        descent, so inputs on wildly different ranges should be standardized first.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A Support Vector Machine = <strong>the separating line with the widest possible margin</strong>,
                found by balancing <Code>‖w‖²</Code> against hinge loss — and defined, in the end, by only a handful
                of <Code>support vectors</Code> sitting closest to the other class.
            </p>
            <p>
                Pair it with <strong>Logistic Regression</strong> and <strong>KNN</strong> to compare classifiers on
                the same kind of problem, use the <strong>Confusion Matrix</strong> and <strong>ROC Curve &amp; AUC</strong>{' '}
                essays to judge one, and ask Vaathiyaar to fit <Code>sklearn.svm.SVC</Code> on this same dataset —
                with a kernel — in the Playground.
            </p>
        </>
    ),
};
