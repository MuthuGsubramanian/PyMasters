import Code from '../Code';
import BayesianInferenceVisual from '../BayesianInferenceVisual';

// Explains essay: Bayesian Inference (see pages/Explains.jsx for the registry).
export default {
    slug: 'bayesian-inference',
    title: 'Bayesian Inference',
    tagline: 'Updating a belief, one visitor at a time',
    minutes: 7,
    subtitle:
        'A new button ships and you want to know its true click-through rate — but "true" is exactly what you don\'t have, only a trickle of visitors. Bayesian inference is the discipline of turning a starting belief plus real observations into an honest, ever-updating estimate. Scroll to watch a real posterior sharpen, visitor by visitor.',
    Visual: BayesianInferenceVisual,
    steps: [
        {
            title: 'An unknown rate, before any data',
            body: (
                <>
                    <p>
                        A new "Upgrade" button just shipped. Some fraction <Code>p</Code> of visitors will click
                        it — but nobody knows that fraction yet. It could be 5%, it could be 60%.
                    </p>
                    <p>
                        This is the entire setup for Bayesian inference: one unknown quantity, and a stream of
                        evidence about to arrive that will narrow it down.
                    </p>
                </>
            ),
        },
        {
            title: 'The prior: what you believe before looking',
            body: (
                <>
                    <p>
                        Before any visitors arrive, we write down a <Code>prior</Code> — a curve over every
                        possible rate from 0% to 100%, expressing how plausible each one is. Here it's completely
                        flat: every rate is equally plausible, because we truly have no idea yet.
                    </p>
                    <p>
                        That flat curve is a <Code>Beta(1, 1)</Code> distribution — the standard "I know nothing"
                        starting point for a rate.
                    </p>
                </>
            ),
        },
        {
            title: 'One visitor changes everything a little',
            body: (
                <>
                    <p>
                        The first visitor arrives and clicks. Bayes' theorem says: <Code>posterior ∝ likelihood ×
                        prior</Code> — combine what just happened with what you believed before. One click makes
                        high rates a bit more plausible and the curve tilts, but barely.
                    </p>
                    <p>
                        One data point can't tell you much. Watch the shaded band — it's still nearly the whole
                        width of the chart.
                    </p>
                </>
            ),
        },
        {
            title: 'Five visitors: a lean appears',
            body: (
                <>
                    <p>
                        Five visitors in, with a mix of clicks and non-clicks, the curve has a real shape: a peak
                        forming below the middle, and a visibly narrower shaded band around it.
                    </p>
                    <p>
                        Because a <Code>Beta</Code> prior combined with click/no-click data produces another{' '}
                        <Code>Beta</Code>, updating is one line of arithmetic — no simulation required: add each
                        click to the first parameter, each non-click to the second.
                    </p>
                </>
            ),
        },
        {
            title: 'Twenty visitors: sharpening up',
            body: (
                <>
                    <p>
                        By twenty visitors the peak is unmistakable and the band has pulled in tight around it.
                        More evidence means less room for the rate to plausibly be somewhere else.
                    </p>
                    <p>
                        Notice the curve is also taller, not just narrower — height and width move together as
                        certainty grows, both drawn from the same real numbers.
                    </p>
                </>
            ),
        },
        {
            title: 'Run it yourself',
            body: (
                <>
                    <p>
                        Drag the slider to replay all 60 real visits one at a time. Watch the marker line hunt for
                        its resting place and the shaded 90% band close in around it.
                    </p>
                    <p className="text-text-muted text-sm">
                        That shaded band is a <Code>credible interval</Code>: a real, computed range that we're 90%
                        confident contains the true rate — not a rule of thumb, an actual integral of the curve.
                    </p>
                </>
            ),
        },
        {
            title: 'Sixty visitors: a confident estimate',
            body: (
                <>
                    <p>
                        All 60 visits in, and the curve has collapsed to a tight peak with a narrow band around it.
                        This is the posterior: not a single guessed number, but a full distribution over how
                        confident we should be in each possible rate.
                    </p>
                    <p>
                        In code, this entire essay is <Code>a, b = 1 + clicks, 1 + misses</Code> and a{' '}
                        <Code>Beta(a, b)</Code> distribution — <Code>scipy.stats.beta</Code> in one line.
                    </p>
                </>
            ),
        },
        {
            title: 'When the prior refuses to move',
            body: (
                <>
                    <p>
                        Here are two runs on the exact same 60 visitors. The solid curve started flat, like every
                        step so far. The dashed curve started skeptical — convinced the rate was near 50% and
                        fairly sure of it.
                    </p>
                    <p>
                        After 60 visitors they've drifted toward each other, but the dashed curve is still pulled
                        noticeably off the data. A confident prior takes real evidence to overturn — this is the
                        honest cost of Bayesian methods: your starting belief is a choice, and a bad one lingers
                        until the data is large enough to drown it out.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Bayesian inference = <strong>start with a prior belief, multiply by the likelihood of what you
                observed, get a posterior</strong> — and with a <Code>Beta</Code> prior on a click/no-click rate,
                that update is just addition. The result is never a single number but a full curve of plausibility,
                with a credible interval you can actually compute.
            </p>
            <p>
                The <strong>Naive Bayes</strong> essay puts the same theorem to work classifying instead of
                estimating a rate. Ask Vaathiyaar to run this exact update in the Playground with{' '}
                <Code>scipy.stats.beta</Code> on your own sequence of outcomes.
            </p>
        </>
    ),
};
