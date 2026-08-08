import Code from '../Code';
import ROCVisual from '../ROCVisual';

// Explains essay: ROC Curve & AUC (see pages/Explains.jsx for the registry).
export default {
    slug: 'roc-auc',
    title: 'ROC Curve & AUC',
    tagline: 'Judging a classifier without picking a threshold first',
    minutes: 6,
    subtitle:
        'The Confusion Matrix essay picked one threshold and asked "how good is this?" ROC/AUC asks a bigger question: how good is this classifier, across every threshold at once? Scroll to sweep the threshold for real and watch the curve build itself.',
    Visual: ROCVisual,
    steps: [
        {
            title: 'One threshold isn\'t the whole story',
            body: (
                <>
                    <p>
                        The Confusion Matrix essay picked a single decision threshold and judged the classifier
                        at that one cut point. But two models can each have a favourite threshold and still
                        differ wildly in overall quality — and choosing between them shouldn't require also
                        choosing a threshold first.
                    </p>
                    <p>
                        Here are 20 emails, already scored by a trained spam classifier: squares are true spam,
                        circles are genuine mail (ham). An <Code>ROC curve</Code> is how we judge the classifier
                        itself, independent of any one cut point.
                    </p>
                </>
            ),
        },
        {
            title: 'Two rates that matter',
            body: (
                <>
                    <p>
                        Pick a threshold — say 0.5 — and every email scoring above it gets flagged spam. Two
                        numbers summarise the damage: the <Code>true positive rate</Code> (TPR), the fraction of
                        real spam caught, and the <Code>false positive rate</Code> (FPR), the fraction of real
                        mail wrongly flagged.
                    </p>
                    <p>
                        At t = 0.5 this classifier catches 6/6 = 100% of spam while wrongly flagging 2/14 ≈ 14%
                        of real mail. TPR is exactly the "recall" from the Confusion Matrix essay — FPR is its
                        mirror image, computed over the negative class instead.
                    </p>
                </>
            ),
        },
        {
            title: 'Sweep the threshold',
            body: (
                <>
                    <p>
                        Instead of committing to one threshold, walk it down from 1 to 0 and, at every value,
                        plot (FPR, TPR) as a point. Loosen the threshold and TPR only climbs — every
                        already-caught spam email stays caught — while FPR climbs too, once real mail starts
                        crossing the line.
                    </p>
                    <p>
                        Nine of this classifier's 22 achievable thresholds are plotted here already. Each
                        remaining email adds one more point before the sweep reaches t = 0.
                    </p>
                </>
            ),
        },
        {
            title: 'The full curve',
            body: (
                <>
                    <p>
                        Finish the sweep and the points trace a staircase from (0,0) — flag nothing — to (1,1)
                        — flag everything. The dashed diagonal is what a classifier with zero skill produces: a
                        coin flip gains true positives and false positives at the same rate.
                    </p>
                    <p>
                        The further the curve bows toward the top-left corner — high TPR, low FPR — the better
                        the classifier separates spam from ham, at every threshold simultaneously.
                    </p>
                </>
            ),
        },
        {
            title: 'Area under the curve',
            body: (
                <>
                    <p>
                        Shade the region beneath the staircase and measure it: that's the <Code>AUC</Code>, area
                        under the ROC curve, computed here by summing trapezoids under the real points — no
                        fitted model, no approximation library. This classifier scores AUC = 0.964.
                    </p>
                    <p>
                        AUC has a clean reading: it's the probability that a randomly chosen spam email scores
                        higher than a randomly chosen ham email. 1.0 is perfect separation, 0.5 is a coin flip —
                        this one gets the ordering right 96.4% of the time.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the threshold and watch two things move together: the cut line on the email strip,
                        and a marker sliding along the curve you already built. Every position on the curve is a
                        threshold you could actually deploy.
                    </p>
                    <p className="text-text-muted text-sm">
                        Push it to the extremes and you land in the curve's corners — t near 1 gives (0,0), t
                        near 0 gives (1,1). Notice the AUC caption never moves as you drag: it summarises the
                        whole curve, not any single point on it.
                    </p>
                </>
            ),
        },
        {
            title: 'Same emails, a weaker filter',
            body: (
                <>
                    <p>
                        Same 20 emails, but scored by a weaker rule — a crude keyword count instead of a trained
                        model. Its curve sags much closer to the diagonal.
                    </p>
                    <p>
                        The AUC gap — 0.679 versus 0.964 — makes "weaker" concrete: pick almost any threshold on
                        the weak curve, and the trained model has one nearby that catches more spam for the same
                        number of false alarms.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        AUC is threshold-independent, which is also its blind spot: it can't tell you which
                        threshold to ship, and a model that's excellent everywhere except your actual operating
                        region can still out-score one that's great exactly where you need it.
                    </p>
                    <p>
                        It's also a poor summary when positives are rare (99% ham, 1% spam) — a{' '}
                        <Code>precision-recall curve</Code> reacts to class imbalance the way AUC doesn't, and is
                        the better tool there. And AUC says nothing about calibration: a classifier can rank
                        correctly (high AUC) while its raw scores are terrible probabilities.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                ROC/AUC = <strong>sweep every threshold, plot true-positive rate against false-positive rate,
                and measure the area under the resulting curve</strong>. It's the standard way to compare
                classifiers without committing to an operating point — 1.0 is perfect, 0.5 is a coin flip.
            </p>
            <p>
                Pair it with the <strong>Confusion Matrix</strong> essay to pick an actual threshold once AUC has
                picked the model, and ask Vaathiyaar to plot <Code>roc_curve</Code> and{' '}
                <Code>roc_auc_score</Code> from scikit-learn on a real dataset in the Playground.
            </p>
        </>
    ),
};
