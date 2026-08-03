import Code from '../Code';
import ConfusionMatrixVisual from '../ConfusionMatrixVisual';

// Explains essay: Confusion Matrix, Precision & Recall
// (see pages/Explains.jsx for the registry).
export default {
    slug: 'confusion-matrix',
    title: 'Confusion Matrix',
    tagline: 'Why accuracy lies, and what to count instead',
    minutes: 6,
    subtitle:
        'A disease-screening model can score 83% accuracy while missing every sick patient it was built to find. The confusion matrix is the honest ledger that exposes the trick — and precision and recall are the two numbers that tell you what accuracy hides. Scroll to screen 24 patients yourself.',
    Visual: ConfusionMatrixVisual,
    steps: [
        {
            title: 'The accuracy trap',
            body: (
                <>
                    <p>
                        Meet our clinic: 24 patients, of whom only 4 actually have the disease — the squares on
                        the strip. The other 20, the circles, are healthy. This imbalance is completely normal:
                        most people screened for anything are fine.
                    </p>
                    <p>
                        Now build the laziest "model" imaginable: predict <em>healthy</em> for everyone. It gets
                        20 of 24 right — <Code>83% accuracy</Code> — while catching exactly zero sick patients.
                        One number, and it's proudly pointing the wrong way.
                    </p>
                </>
            ),
        },
        {
            title: 'Four kinds of right and wrong',
            body: (
                <>
                    <p>
                        A real classifier gives each patient a score, and everyone to the right of the vertical
                        line gets called sick. That creates exactly four outcomes: sick and caught
                        (<Code>TP</Code>), sick but missed (<Code>FN</Code>), healthy but flagged
                        (<Code>FP</Code>), and healthy and cleared (<Code>TN</Code>).
                    </p>
                    <p>
                        Arrange the four counts in a 2×2 grid — actual truth as rows, prediction as columns —
                        and you have the <Code>confusion matrix</Code>. Here at a threshold of 0.5: 3 caught,
                        1 missed, 3 false alarms, 17 correctly cleared. Every metric that follows is just
                        arithmetic on these four cells.
                    </p>
                </>
            ),
        },
        {
            title: 'Precision: when we raise the alarm, are we right?',
            body: (
                <>
                    <p>
                        Read the matrix down its first column — everyone we <em>called</em> sick. Six alarms
                        went off; only 3 were real. <Code>precision = TP / (TP + FP)</Code> = 3/6 ={' '}
                        <Code>50%</Code>.
                    </p>
                    <p>
                        Precision is the trust-the-alarm number. Low precision means worried healthy people,
                        needless follow-up tests, and a model everyone learns to ignore — the boy who cried
                        wolf, quantified.
                    </p>
                </>
            ),
        },
        {
            title: 'Recall: of the truly sick, how many did we catch?',
            body: (
                <>
                    <p>
                        Now read across the top row — the 4 patients who are <em>actually</em> sick. We caught
                        3 of them. <Code>recall = TP / (TP + FN)</Code> = 3/4 = <Code>75%</Code>.
                    </p>
                    <p>
                        Recall is the don't-miss-anyone number. That one missed square is a sick patient sent
                        home with a clean bill — in screening, the most expensive mistake on the board. Notice
                        the lazy predict-healthy model from step one had a recall of exactly 0%.
                    </p>
                </>
            ),
        },
        {
            title: 'The tug-of-war',
            body: (
                <>
                    <p>
                        Precision and recall pull against each other, and the rope is the threshold. Slide it
                        left (line A, at 0.25) and every square is caught — recall <Code>100%</Code> — but 11
                        healthy people get flagged, so precision collapses to <Code>27%</Code>.
                    </p>
                    <p>
                        Slide it right (line B, at 0.75) and every alarm is real — precision{' '}
                        <Code>100%</Code> — but half the sick patients walk out undetected: recall{' '}
                        <Code>50%</Code>. And here's the kicker: B has the <em>highest accuracy yet</em>, 92%.
                        Accuracy genuinely cannot see this trade.
                    </p>
                </>
            ),
        },
        {
            title: 'One matrix, two numbers',
            body: (
                <>
                    <p>
                        Back at the balanced threshold of 0.5, the full picture: the matrix counts on the left,
                        the metric bars on the right. Precision 50%, recall 75%, and an F1 of 0.60 that blends
                        the two.
                    </p>
                    <p>
                        And look at the small print: this classifier's accuracy is 83% — <em>identical</em> to
                        the do-nothing model from step one. Same accuracy, utterly different behaviour: one
                        catches 3 of 4 sick patients, the other catches none. That's the whole argument for
                        the matrix in one line.
                    </p>
                </>
            ),
        },
        {
            title: 'Slide the threshold yourself',
            body: (
                <>
                    <p>
                        Drag the slider and watch the ledger rebalance in real time. As the line sweeps right,
                        false alarms drain out of the bottom-left cell while misses pile into the top-right —
                        precision climbs as recall falls.
                    </p>
                    <p className="text-text-muted text-sm">
                        Challenges: find the threshold where every alarm is real (precision 100%), the one
                        where every square is caught (recall 100%), and the one that maximises F1. No single
                        setting wins all three — that's the point.
                    </p>
                </>
            ),
        },
        {
            title: 'F1, and choosing by cost',
            body: (
                <>
                    <p>
                        When you need one number, <Code>F1 = 2·P·R / (P + R)</Code> — the harmonic mean —
                        punishes lopsidedness: a model with precision 100% but recall 10% scores a dismal F1,
                        where a plain average would flatter it.
                    </p>
                    <p>
                        But the real decision is about the price of each mistake. Disease screening: a miss can
                        be fatal, a false alarm is a follow-up test — favour <strong>recall</strong>. Spam
                        filtering: a miss is one junk email, a false alarm buries a real message — favour{' '}
                        <strong>precision</strong>. The matrix doesn't choose for you; it makes the choice
                        visible.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Confusion matrix = <strong>the four honest counts</strong> behind any classifier: caught,
                missed, false alarm, cleared. <Code>precision</Code> asks "when we raise the alarm, are we
                right?", <Code>recall</Code> asks "of the real cases, how many did we catch?", and the
                threshold trades one for the other — a trade accuracy is structurally blind to on imbalanced
                data.
            </p>
            <p>
                These scores only mean anything measured on held-out data — that's the{' '}
                <strong>Train / Test Split</strong> essay, this one's natural sibling. Then head to the{' '}
                <strong>Classroom</strong> ML track to compute one with{' '}
                <Code>sklearn.metrics.confusion_matrix</Code>, or ask Vaathiyaar in the{' '}
                <strong>Playground</strong> to sweep the threshold on a real classifier and plot the
                precision-recall curve.
            </p>
        </>
    ),
};
