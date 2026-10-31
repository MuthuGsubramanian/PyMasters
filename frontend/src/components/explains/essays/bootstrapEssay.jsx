import Code from '../Code';
import BootstrapVisual from '../BootstrapVisual';

// Explains essay: The Bootstrap (see pages/Explains.jsx for the registry).
// 12 delivery times, resampled with replacement 1,000 times with a seeded
// generator. Every number quoted below is computed in BootstrapVisual.jsx.
export default {
    slug: 'bootstrap',
    title: 'The Bootstrap',
    tagline: 'Error bars from a single sample, by resampling it',
    minutes: 6,
    subtitle:
        'You measured something once and got one number. How much would that number change if you could repeat the experiment? You usually cannot — but you can do the next best thing: treat your sample as a stand-in for the world and resample it. Scroll to watch 1,000 resamples build an error bar.',
    Visual: BootstrapVisual,
    steps: [
        {
            title: 'One sample, one number',
            body: (
                <>
                    <p>
                        A food-delivery app logs 12 delivery times, in minutes. Each filled circle on the number
                        line is one order. The <Code>median</Code> is <Code>19.5</Code> minutes — half the
                        orders were faster, half slower.
                    </p>
                    <p>
                        Notice the two slow orders far to the right (45 and 68). The median shrugs them off,
                        which is why it is a popular choice for skewed data like this.
                    </p>
                </>
            ),
        },
        {
            title: 'How much should we trust it?',
            body: (
                <>
                    <p>
                        Those were just 12 orders. A different 12 would give a different median, and we would
                        like to say something like "the typical delivery time is 19.5 minutes, give or take
                        this much".
                    </p>
                    <p>
                        For a mean there is a textbook formula for "give or take". For a median there is no
                        simple one — and for many modern statistics (a ratio, a model's accuracy, a quantile)
                        there is none at all. We need a method that works for <em>any</em> statistic.
                    </p>
                </>
            ),
        },
        {
            title: 'Resample with replacement',
            body: (
                <>
                    <p>
                        Here is the trick. We cannot go back to the world for a fresh sample — but we can
                        draw a fresh sample from <em>our sample</em>. Pick one of the 12 orders at random,
                        write it down, put it back, and repeat 12 times. That is "sampling with replacement".
                    </p>
                    <p>
                        The picture shows one such resample. Some orders were drawn twice or three times
                        (stacked circles with a ×); in this draw 5 orders were never picked (dashed rings) and{' '}
                        4 were drawn more than once. The resample median came out as <Code>21.5</Code>.
                    </p>
                </>
            ),
        },
        {
            title: 'Do it again, and again',
            body: (
                <>
                    <p>
                        Each resample gives its own median, drawn here as a diamond. The first eight are{' '}
                        <Code>21.5, 19.5, 17, 18.5, 20, 17.5, 21, 19.5</Code>. The dashed line is the original
                        median.
                    </p>
                    <p>
                        They wobble around it. That wobble is exactly the thing we wanted: a sense of how much
                        a median computed from 12 orders moves when the particular orders change.
                    </p>
                </>
            ),
        },
        {
            title: '100 resamples',
            body: (
                <>
                    <p>
                        Let a computer do it 100 times and pile up the medians in a histogram — each bar counts
                        how many resamples landed in that two-minute bin. A shape appears: a hump around the
                        original median.
                    </p>
                    <p>
                        This pile is the <em>bootstrap distribution</em>. It is our stand-in for the
                        distribution we would get if we could rerun the whole experiment many times.
                    </p>
                </>
            ),
        },
        {
            title: '1,000 resamples',
            body: (
                <>
                    <p>
                        With 1,000 resamples the shape settles. It is lumpy rather than a smooth bell — a
                        median of 12 numbers can only take certain values — and it has a longer tail to the
                        right, pulled by those slow orders.
                    </p>
                    <p>
                        The average of the 1,000 medians is <Code>20.1</Code> and their standard deviation is{' '}
                        <Code>3.6</Code> minutes. That standard deviation is the bootstrap standard error of
                        the median.
                    </p>
                </>
            ),
        },
        {
            title: 'Read off the interval',
            body: (
                <>
                    <p>
                        To get a 95% <Code>percentile interval</Code>, sort the 1,000 medians and chop off the
                        lowest 2.5% and highest 2.5%. What remains spans <Code>15.5</Code> to{' '}
                        <Code>28.5</Code> minutes — the solid bars. The dashed outlines are the discarded tails.
                    </p>
                    <p>
                        Notice it is not symmetric: it reaches 9 minutes above the sample median but only 4
                        below. The bootstrap inherits the skew of your data instead of assuming a bell curve.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: slide the number of resamples',
            body: (
                <>
                    <p>
                        Drag the slider. With 10 resamples the pile is a few stray bars; by a few hundred the
                        interval stops jumping around. At 100 it reads [16, 26]; at 1,000 it widens to
                        [15.5, 28.5] as rarer outcomes show up in the tails.
                    </p>
                    <p className="text-text-muted text-sm">
                        More resamples makes the <em>computation</em> more precise. It does not make the
                        sample bigger — the 12 orders are still all you know.
                    </p>
                </>
            ),
        },
        {
            title: 'The fine print',
            body: (
                <>
                    <p>
                        The bootstrap cannot invent information. If the sample is tiny, or misses a whole kind
                        of order (say, rush-hour deliveries), every resample misses it too and the interval
                        will be too optimistic. It also struggles with extremes: the bootstrap of a sample{' '}
                        <em>maximum</em> is notoriously unreliable.
                    </p>
                    <p>
                        And resampling must respect the data's structure: if rows are correlated (the same
                        customer, a time series) resample whole groups or blocks, not individual rows. With
                        12 points the percentile interval is also known to run narrow; more refined variants
                        exist (BCa, bootstrap-t) for when it matters.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                The bootstrap = <strong>resample your data with replacement many times, recompute your
                statistic each time, and read the spread of those results as your uncertainty</strong>. Here
                one median of 19.5 minutes became "somewhere between about 15.5 and 28.5", with no formulas
                and no bell-curve assumption.
            </p>
            <p>
                It connects to <strong>Cross-Validation</strong> (another way to turn one dataset into many
                evaluations) and <strong>Random Forest</strong> (each tree trains on a bootstrap sample —
                that is the "bag" in bagging). In the <strong>Playground</strong>, try{' '}
                <Code>random.choices(data, k=len(data))</Code> in a loop with <Code>statistics.median</Code>{' '}
                and compare your interval with the one here.
            </p>
        </>
    ),
};
