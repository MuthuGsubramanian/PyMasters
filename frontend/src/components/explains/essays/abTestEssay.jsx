import Code from '../Code';
import ABTestVisual from '../ABTestVisual';

// Explains essay: A/B testing and p-values via a permutation test
// (see pages/Explains.jsx for the registry).
export default {
    slug: 'ab-testing-p-values',
    title: 'A/B Testing & p-values',
    tagline: 'Is the difference real, or just luck of the draw?',
    minutes: 7,
    subtitle:
        'You changed a button, a layout, a model. Group B did better. But groups differ by chance alone — so how much better is "better enough"? We answer it with the most honest tool there is: shuffle the labels thousands of times and see how often luck beats you. Every shuffle below is computed for real.',
    Visual: ABTestVisual,
    steps: [
        {
            title: 'Two designs, two piles of numbers',
            body: (
                <>
                    <p>
                        Twelve visitors saw design A (circles), twelve saw design B (squares). For each we
                        recorded minutes spent on the page. Each dashed line marks a group's average.
                    </p>
                    <p>
                        This is an <Code>A/B test</Code>: two groups, one thing changed, one number measured.
                    </p>
                </>
            ),
        },
        {
            title: 'B looks better — by about 1.7 minutes',
            body: (
                <>
                    <p>
                        B's average is higher. The red bar is the gap between the averages: our{' '}
                        <Code>test statistic</Code>. Ship B?
                    </p>
                    <p>
                        Not yet. Even if both designs were identical, two random groups of 12 people would
                        almost never have exactly equal averages. Some gap appears by luck. The real question
                        is: <em>how big a gap does luck alone produce?</em>
                    </p>
                </>
            ),
        },
        {
            title: 'Imagine the design did nothing',
            body: (
                <>
                    <p>
                        This imagined world is the <Code>null hypothesis</Code>: A and B behave identically.
                        If so, the circle/square tag on each visitor means nothing — we could pour all 24
                        sessions into one pot.
                    </p>
                    <p>
                        And if the tags mean nothing, we can re-deal them at random and the new groups are
                        just as believable as the real ones.
                    </p>
                </>
            ),
        },
        {
            title: 'Shuffle once',
            body: (
                <>
                    <p>
                        Randomly deal 12 sessions to "A" and 12 to "B", ignoring who really saw what, and
                        recompute the gap. This one is a gap that arose purely from luck — we <em>know</em>{' '}
                        it is luck because we made the groups up.
                    </p>
                    <p>
                        One shuffle tells us little. Thousands tell us the whole shape of luck.
                    </p>
                </>
            ),
        },
        {
            title: 'Shuffle two thousand times',
            body: (
                <>
                    <p>
                        Drag the slider. Each shuffle drops one fake gap into the histogram. The pile settles
                        into a hill centred on zero: most luck-gaps are small, big ones are rare, and the
                        direction is a coin flip.
                    </p>
                    <p className="text-text-muted text-sm">
                        This is a <Code>permutation test</Code>. The shuffles come from a fixed-seed
                        generator inside the page, so you and I see identical bars.
                    </p>
                </>
            ),
        },
        {
            title: 'Where does the real gap land?',
            body: (
                <>
                    <p>
                        Now mark the gap we actually observed. It sits far out on the right edge of the hill —
                        in territory where luck almost never goes.
                    </p>
                    <p>
                        That is the whole argument: <em>if the design did nothing, we would rarely see a gap
                        this big</em>. So "it did nothing" looks like a poor explanation.
                    </p>
                </>
            ),
        },
        {
            title: 'That fraction is the p-value',
            body: (
                <>
                    <p>
                        Count the shuffles whose gap was at least as large as ours (in either direction — we'd
                        have been just as interested in B being worse). Those are the red bars. Out of 2000
                        shuffles that is about 10, giving p ≈ 0.005.
                    </p>
                    <p>
                        So the <Code>p-value</Code> is: <strong>the probability of a gap this extreme when
                        nothing is going on.</strong> A small p is evidence against "nothing is going on";
                        the usual cut-off of 0.05 is a convention, not a law of nature.
                    </p>
                </>
            ),
        },
        {
            title: 'What a p-value is not',
            body: (
                <>
                    <p>
                        It is <strong>not</strong> the chance that B is better, and not the size of the
                        improvement. A huge experiment can return p = 0.0001 for a gain nobody would notice;
                        a tiny one can miss a real gain. Always report the gap itself, plus an interval for it.
                    </p>
                    <p>
                        Other honest caveats: decide the sample size and the metric <em>before</em> you look;
                        peeking at the result daily and stopping when p dips below 0.05 inflates false
                        alarms; and test ten metrics and one will look "significant" by luck.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A p-value = <strong>shuffle the labels many times and ask how often luck alone matches or
                beats the gap you saw</strong>. Small means luck is a poor explanation; it never says how
                big or how important the effect is.
            </p>
            <p>
                Try it yourself in the Playground: pool two lists, <Code>random.shuffle</Code> them 2000
                times, and count. For the sampling idea underneath, see the Bootstrap essay; for the
                prior-belief view of the same question, see Bayesian Inference.
            </p>
        </>
    ),
};
