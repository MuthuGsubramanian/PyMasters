import Code from '../Code';
import SoftmaxTemperatureVisual from '../SoftmaxTemperatureVisual';

// Explains essay: Softmax & Temperature (see pages/Explains.jsx for the registry).
// Every number quoted below comes from the visual's real computation
// (six hand-picked scores: 6.0, 4.2, 3.5, 3.0, 2.2, 0.5).
export default {
    slug: 'softmax-temperature',
    title: 'Softmax & Temperature',
    tagline: 'How a language model turns scores into a choice of next word',
    minutes: 6,
    subtitle:
        'A language model never "picks" a word directly. It scores every word it knows, and a small formula called softmax turns those scores into probabilities. A single dial — temperature — decides whether the model plays it safe or takes risks. Scroll to push six real scores through the formula and watch the dial change the odds.',
    Visual: SoftmaxTemperatureVisual,
    steps: [
        {
            title: 'Scores, not answers',
            body: (
                <>
                    <p>
                        After the prompt "The capital of France is", the model produces one raw number per
                        candidate word. These are called <Code>logits</Code>. Here we look at six candidates;
                        a real model scores tens of thousands.
                    </p>
                    <p>
                        A higher score means "fits better". But the numbers are awkward: <Code>6.0</Code> is not
                        "6 times as likely" as anything, and scores can even be negative. We need a way to turn them
                        into honest probabilities.
                    </p>
                </>
            ),
        },
        {
            title: 'Step one: exponentiate',
            body: (
                <>
                    <p>
                        First, raise <Code>e</Code> to the power of each score. That does two useful things: every
                        result is positive, and gaps get amplified. A 1.8-point lead (6.0 vs 4.2) becomes a
                        roughly 6× lead (403.4 vs 66.7).
                    </p>
                    <p>
                        The bars here are rescaled so the biggest fits on screen. The smallest word, "banana", has
                        shrunk to 1.6 — still above zero, just tiny.
                    </p>
                </>
            ),
        },
        {
            title: 'Step two: divide by the total',
            body: (
                <>
                    <p>
                        The six exponentiated values add up to 534.0. Divide each by that sum and the results add up
                        to exactly 1. That's the entire formula: <Code>softmax(x) = e^x / Σ e^x</Code>.
                    </p>
                    <p>
                        Now "Paris" gets 75.5%, "the" 12.5%, "a" 6.2%, and so on. The diamond marks the most likely
                        word. Notice the model is confident but not certain — 24.5% of the probability sits on
                        other words.
                    </p>
                </>
            ),
        },
        {
            title: 'Turn the temperature down',
            body: (
                <>
                    <p>
                        Temperature <Code>T</Code> divides every score before the exponent:{' '}
                        <Code>e^(x / T)</Code>. With <Code>T = 0.5</Code>, the gaps between scores double in
                        effect, so the leader pulls even further ahead: "Paris" jumps from 75.5% to 96.4%.
                    </p>
                    <p>
                        The uncertainty (entropy) drops from 1.23 bits to 0.26 bits. Low temperature means
                        predictable, repeatable, and a bit boring output.
                    </p>
                </>
            ),
        },
        {
            title: 'Turn the temperature up',
            body: (
                <>
                    <p>
                        With <Code>T = 2</Code> the opposite happens: the gaps shrink and the distribution flattens.
                        "Paris" falls to 47.0%, while "located" and even "banana" gain real chances (7.0% and
                        3.0%).
                    </p>
                    <p>
                        Entropy rises to 2.12 bits. The scores never changed — only how sharply we convert them into
                        odds. That is why one model can sound careful or adventurous without being retrained.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the slider from 0.1 up to 3. Near the bottom, almost all the probability collapses onto
                        "Paris" (at 0.1 it is indistinguishable from 100%). Near the top, even "Paris" is down to
                        about 36%.
                    </p>
                    <p className="text-text-muted text-sm">
                        Find the temperature where "Paris" is just under 50%. Then ask: would you trust a model
                        answering a factual question at that setting?
                    </p>
                </>
            ),
        },
        {
            title: 'Trimming the tail: top-p',
            body: (
                <>
                    <p>
                        Even at <Code>T = 1</Code>, a 0.3% chance for "banana" adds up over thousands of words in a
                        long reply. <Code>Top-p</Code> (nucleus) sampling drops the unlikely tail: keep the
                        smallest set of top words whose probabilities reach <Code>p</Code>, throw away the rest.
                    </p>
                    <p>
                        With <Code>p = 0.9</Code>, "Paris", "the" and "a" are kept (75.5% + 12.5% + 6.2% = 94.2%,
                        which is the first total to pass 90%). The dashed bars are dropped; the survivors are
                        rescaled to sum to 1 — "Paris" becomes 80.2%.
                    </p>
                </>
            ),
        },
        {
            title: 'Honest caveats',
            body: (
                <>
                    <p>
                        <Code>T = 0</Code> would divide by zero, so libraries treat it as "always take the top word"
                        (greedy decoding). Greedy is repeatable but can loop or get stuck in dull phrasing.
                        Temperature also doesn't make a model more <em>correct</em>: it only reshapes how the
                        model's existing beliefs are sampled.
                    </p>
                    <p>
                        The six scores here were chosen by hand to illustrate the formula. Real models' scores come
                        from their final layer, and the exact numbers differ for every prompt. Providers also
                        differ in which sampling knobs they expose and how they combine them.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Softmax = <strong>exponentiate every score, then divide by the total</strong>. Temperature divides
                the scores first: low <Code>T</Code> sharpens toward the favourite, high <Code>T</Code> flattens
                toward a coin toss. Top-p then cuts off the unlikely tail before sampling.
            </p>
            <p>
                The same softmax shows up inside <strong>Attention</strong> (turning similarity scores into
                weights) and <strong>Logistic Regression</strong> (its multi-class form). Try it yourself in the
                Playground: write softmax in six lines of NumPy and plot it at three temperatures.
            </p>
        </>
    ),
};
