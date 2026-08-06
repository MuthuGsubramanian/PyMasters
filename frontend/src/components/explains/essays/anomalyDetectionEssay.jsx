import Code from '../Code';
import AnomalyDetectionVisual from '../AnomalyDetectionVisual';

// Explains essay: Anomaly Detection (see pages/Explains.jsx for the registry).
export default {
    slug: 'anomaly-detection',
    title: 'Anomaly Detection',
    tagline: "Finding the reading that doesn't belong",
    minutes: 6,
    subtitle:
        "Twenty response times from the same API, and two of them already look wrong to the eye. But \"looks wrong\" isn't a number a pipeline can act on. Scroll to see two real ways of turning that gut feeling into a threshold — and why the obvious one can quietly miss the second anomaly while it's busy catching the first.",
    Visual: AnomalyDetectionVisual,
    steps: [
        {
            title: "Twenty readings, two that don't fit",
            body: (
                <>
                    <p>
                        Here are twenty consecutive response times from one API endpoint, in milliseconds. Most sit in
                        a tight little cluster. Two clearly don't — one towers over the rest, one is just noticeably
                        higher than its neighbours.
                    </p>
                    <p>
                        Spotting that by eye is easy on twenty points. On twenty thousand, across a hundred endpoints,
                        nobody is looking at a chart. Anomaly detection is the attempt to write down, precisely, what
                        "doesn't fit" means — so a machine can flag it instead of a human squinting at a graph.
                    </p>
                </>
            ),
        },
        {
            title: 'What "normal" looks like',
            body: (
                <>
                    <p>
                        The simplest definition of normal: compute the <Code>mean</Code> and the{' '}
                        <Code>standard deviation</Code> of everything you've got, and treat values close to the mean
                        as typical. The shaded band above is the mean plus and minus two standard deviations —
                        everything a "usual" reading is expected to land inside.
                    </p>
                    <p>
                        Both numbers are real, computed from these exact twenty readings — nothing here is picked to
                        look tidy.
                    </p>
                </>
            ),
        },
        {
            title: 'The z-score',
            body: (
                <>
                    <p>
                        Turn "how far from the mean" into a single number with the <Code>z-score</Code>:{' '}
                        <span style={{ fontFamily: 'monospace' }}>z = (x − mean) / σ</span>. It says how many standard
                        deviations away a point sits. A common rule of thumb flags anything with{' '}
                        <Code>|z| &gt; 2</Code>.
                    </p>
                    <p>
                        Applied here, the huge spike gets a z-score above 4 and is flagged without argument. But the
                        moderately-high reading — the one that still looked off a moment ago — sits at barely 0.8σ
                        from the mean. By this rule, it passes as normal.
                    </p>
                </>
            ),
        },
        {
            title: 'One extreme value can hide another',
            body: (
                <>
                    <p>
                        The mean and standard deviation above were computed from <em>all twenty</em> readings —
                        including the huge spike. That single point drags the mean up and inflates σ enough to widen
                        the "normal" band until the second, smaller anomaly fits inside it.
                    </p>
                    <p>
                        Set the spike aside and recompute: the mean drops sharply, σ shrinks to a fraction of its
                        former size, and the second reading's z-score jumps past 4 — now unmistakably unusual. This is{' '}
                        <Code>masking</Code>: a big enough outlier can hide a smaller one from a statistic that the
                        outlier itself helped compute.
                    </p>
                </>
            ),
        },
        {
            title: 'A robust alternative: the median and IQR',
            body: (
                <>
                    <p>
                        Mean and σ are dragged by extreme values because they're built from every value's actual
                        magnitude. Quartiles aren't — <Code>Q1</Code> and <Code>Q3</Code> are defined by{' '}
                        <em>rank</em> (the value a quarter of the way up, and three-quarters of the way up the sorted
                        list), so a couple of extreme points barely move them.
                    </p>
                    <p>
                        The <Code>IQR</Code> (Q3 − Q1) measures the spread of the typical middle half of the data.
                        Tukey's fences — <Code>Q1 − 1.5×IQR</Code> and <Code>Q3 + 1.5×IQR</Code> — mark where "normal"
                        ends, using only that robust spread.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the threshold and watch how many of the twenty readings get flagged, using the same
                        contaminated mean and σ from before. You have to pull it well under 1σ before the second
                        anomaly finally crosses the line.
                    </p>
                    <p className="text-text-muted text-sm">
                        In this tidy example that happens to not misfire on anything else. In a noisier, real dataset
                        a threshold pulled that low routinely starts flagging perfectly ordinary readings too — the
                        z-score's real weakness isn't a wrong formula, it's that it trusts numbers the anomaly itself
                        was allowed to distort.
                    </p>
                </>
            ),
        },
        {
            title: 'IQR catches both, unmoved by contamination',
            body: (
                <>
                    <p>
                        Compute Q1 and Q3 from the full, contaminated set of twenty — spike and all — and the fences
                        land in almost the same place they would without it. Both the huge spike and the moderate
                        reading fall outside them and get flagged together, in one pass, with one threshold.
                    </p>
                    <p>
                        No masking, because nothing here depended on the outliers to compute the yardstick that finds
                        them. That's the whole advantage of a rank-based statistic over a magnitude-based one.
                    </p>
                </>
            ),
        },
        {
            title: 'A flag is not a verdict',
            body: (
                <>
                    <p>
                        Both methods answer "is this statistically unusual relative to the rest of this batch?" —
                        not "is this wrong." A genuine traffic surge or a legitimately hard query is still an
                        anomaly by these numbers, and deserves a very different response than a bug does. The
                        threshold (2σ, 1.5×IQR) is a convention, not a law of nature.
                    </p>
                    <p>
                        Static thresholds also assume the data has no rhythm. Response times that double every day at
                        peak traffic aren't anomalies — they're a pattern a flat mean-and-σ band was never built to
                        see. Anomaly detection tells you where to look; deciding what it means is still a human job.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Anomaly detection = <strong>define "normal" with a statistic, then flag what falls outside it</strong>.
                The z-score is simple but can be <Code>masked</Code> by the very outliers it's meant to catch, because
                the mean and σ it relies on move when contaminated. The IQR's fences, built from rank rather than
                magnitude, stay put — at the cost of a rule of thumb (1.5×IQR) instead of a clean probabilistic
                threshold.
            </p>
            <p>
                The <strong>EDA</strong> essay is where this instinct starts — go back and reread its outliers step.
                The <strong>DBSCAN</strong> essay shows a third route: outliers as points too sparse to join any
                cluster, no threshold tuning required. Then ask Vaathiyaar to run these fences over a real{' '}
                <Code>pandas</Code> column in the Playground.
            </p>
        </>
    ),
};
