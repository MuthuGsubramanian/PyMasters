import Code from '../Code';
import CalibrationVisual from '../CalibrationVisual';
import { BEST_T, BEFORE, AFTER, TEST, accuracyAt } from '../calibrationMath';

// Explains essay: probability calibration (see pages/Explains.jsx for the registry).
// Numbers quoted below come from calibrationMath.js, computed at load.
const f2 = (v) => v.toFixed(2);
const f3 = (v) => v.toFixed(3);
const pc = (v) => `${Math.round(v * 100)}%`;
const topB = BEFORE.pts[BEFORE.pts.length - 1];
const topA = AFTER.pts[AFTER.pts.length - 1];
const ACC = accuracyAt(TEST.logits, TEST.labels, 1);

export default {
    slug: 'calibration',
    title: 'Probability Calibration',
    tagline: 'When a model says 90%, is it right 90% of the time?',
    minutes: 6,
    subtitle:
        'Accuracy tells you how often a model is right. It does not tell you whether its confidence can be trusted. A model that says "90% sure" and is right only 70% of the time will mislead every decision built on top of it. Scroll to see how to measure that — and fix it. All numbers here are computed for real.',
    Visual: CalibrationVisual,
    steps: [
        {
            title: 'A model that sounds very sure',
            body: (
                <>
                    <p>
                        We have a classifier and {TEST.logits.length} test cases it has never seen. For each one it
                        reports a probability that the answer is "yes". The bars count how many predictions fall
                        into each confidence band.
                    </p>
                    <p>
                        Notice the pile-ups at both ends. This model is not shy — most of its predictions are
                        either near 0 or near 1.
                    </p>
                </>
            ),
        },
        {
            title: 'What does "over 90%" promise?',
            body: (
                <>
                    <p>
                        The last bar is the model saying "over 90% sure". If that number means anything, then
                        about 9 in 10 of those cases should turn out to be "yes".
                    </p>
                    <p>
                        That is the definition of <Code>calibration</Code>: among all cases where the model says
                        p, the outcome should happen about a fraction p of the time. We can check this, because
                        we know the true outcomes.
                    </p>
                </>
            ),
        },
        {
            title: 'The reliability diagram',
            body: (
                <>
                    <p>
                        Group predictions into bins. For each bin, plot the average confidence (across) against
                        the fraction that really were "yes" (up). Bigger markers mean more predictions in that bin.
                    </p>
                    <p>
                        A perfectly calibrated model sits on the dashed diagonal. These square markers are
                        mostly off it: high-confidence bins sit <em>below</em> the line, which means the model
                        claims more certainty than it has earned.
                    </p>
                </>
            ),
        },
        {
            title: 'Measuring the gap',
            body: (
                <>
                    <p>
                        The red bars are the gaps. Averaging them, weighted by how many predictions each bin
                        holds, gives the <Code>expected calibration error</Code> (ECE):{' '}
                        <strong>{f3(BEFORE.ece)}</strong> here. Zero would be perfect.
                    </p>
                    <p>
                        The <Code>Brier score</Code> is a second view: the average squared distance between the
                        stated probability and the 0/1 outcome. Ours is {f3(BEFORE.brier)}; lower is better.
                        Unlike ECE, it also punishes models that are well calibrated but uninformative.
                    </p>
                </>
            ),
        },
        {
            title: 'Turn the confidence knob',
            body: (
                <>
                    <p>
                        Over-confident models often have logits (the raw scores before the sigmoid) that are
                        simply too large. <Code>Temperature scaling</Code> divides them by one number T before
                        converting to a probability: <Code>sigmoid(logit / T)</Code>.
                    </p>
                    <p>
                        Drag the slider. T above 1 softens the model; T below 1 makes it even louder. Watch the
                        markers climb toward the diagonal and the ECE fall — then overshoot if you go too far.
                    </p>
                </>
            ),
        },
        {
            title: 'Let the data pick T',
            body: (
                <>
                    <p>
                        Instead of eyeballing, fit T on separate data: we used a calibration half of the
                        examples and chose the T with the lowest log-loss. It came out at{' '}
                        <strong>T = {f2(BEST_T)}</strong>.
                    </p>
                    <p>
                        The circles are measured on the other half, which the fit never saw. ECE drops from{' '}
                        {f3(BEFORE.ece)} to <strong>{f3(AFTER.ece)}</strong>, and the Brier score from{' '}
                        {f3(BEFORE.brier)} to {f3(AFTER.brier)}.
                    </p>
                </>
            ),
        },
        {
            title: 'Before and after',
            body: (
                <>
                    <p>
                        Overlaid, the faint squares (before) have been pulled toward the diagonal by the circles
                        (after). In the top bin the model used to claim an average of {pc(topB.conf)} and was right{' '}
                        {pc(topB.acc)} of the time; it now claims {pc(topA.conf)} and is right {pc(topA.acc)}.
                    </p>
                    <p>
                        In scikit-learn the heavier-weight relatives are{' '}
                        <Code>CalibratedClassifierCV</Code> (Platt or isotonic) and{' '}
                        <Code>sklearn.calibration.calibration_curve</Code> to draw this very diagram.
                    </p>
                </>
            ),
        },
        {
            title: 'The honest caveats',
            body: (
                <>
                    <p>
                        Calibration changes the confidence, not the ranking. Dividing every logit by the same
                        positive T never flips a decision at the 0.5 threshold, so accuracy stays put
                        (here {pc(ACC)} before and after). AUC is untouched as well.
                    </p>
                    <p>
                        Our test half has only {TEST.logits.length} rows, so the middle bins hold a handful of
                        points each and are noisy — treat the exact numbers as a demonstration, not a benchmark.
                        Real projects use thousands of rows, and a calibration set kept apart from both training
                        and test data.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A calibrated model's <strong>"p" means p</strong>. Check it with a reliability diagram and ECE,
                and if it is off, a single temperature (or Platt/isotonic scaling) fitted on held-out data
                often fixes it without changing which cases the model gets right.
            </p>
            <p>
                Pair this with the <Code>ROC & AUC</Code> and <Code>Confusion Matrix</Code> essays: those judge
                ranking and decisions, calibration judges the probabilities. In the Playground, try{' '}
                <Code>calibration_curve</Code> on a random forest or logistic regression and compare.
            </p>
        </>
    ),
};
