import Code from '../Code';
import SamplingVisual from '../SamplingVisual';

// Explains essay: Temperature & sampling (see pages/Explains.jsx for the registry).
// Numbers quoted in the prose come from the visual's real computation. The eight
// scores are illustrative, not read from a real model.
export default {
    slug: 'temperature-sampling',
    title: 'Temperature & Sampling',
    tagline: 'How a language model picks its next word from a list of scores',
    minutes: 6,
    subtitle:
        'A language model never "writes" a word directly. It scores every word it knows, and a separate, simple procedure picks one. That procedure is where temperature, top-k and top-p live. Scroll to turn eight made-up scores into probabilities and watch each knob reshape them.',
    Visual: SamplingVisual,
    steps: [
        {
            title: 'The model hands back scores',
            body: (
                <>
                    <p>
                        After "The capital of France is", the model produces one number per candidate word, called
                        a <Code>logit</Code>. We show eight; a real model scores tens of thousands. A bigger number
                        means "more likely".
                    </p>
                    <p>
                        These scores are not probabilities: they can be negative, and they do not add up to 1. (The
                        eight here are invented for teaching, not read from a real model.)
                    </p>
                </>
            ),
        },
        {
            title: 'Softmax turns scores into probabilities',
            body: (
                <>
                    <p>
                        <Code>softmax</Code> exponentiates every score and divides by the total, so everything
                        becomes positive and sums to 1. Now "Paris" has 72% of the probability, "the" 12%, and
                        the rest share what is left.
                    </p>
                    <p>
                        Note that the gap shrank in a particular way: "Paris" scored only 1.4 times as much as "the"
                        (6.0 vs 4.2), but its probability is about six times larger. Exponentials stretch gaps.
                    </p>
                </>
            ),
        },
        {
            title: 'Low temperature: sharper',
            body: (
                <>
                    <p>
                        Temperature <Code>T</Code> divides every score before softmax. At T = 0.5 the differences
                        double, and "Paris" jumps from 72% to 96%. The other words nearly vanish.
                    </p>
                    <p>
                        The uncertainty of the distribution, measured as entropy, falls from 1.47 bits to 0.29. As
                        T approaches 0 you get <em>greedy decoding</em>: always the top word, the same answer every
                        time.
                    </p>
                </>
            ),
        },
        {
            title: 'High temperature: flatter',
            body: (
                <>
                    <p>
                        At T = 2 the scores are halved and the distribution spreads out: "Paris" drops to 41%, and
                        even "not" gets 3%. Entropy rises to 2.52 bits.
                    </p>
                    <p>
                        More variety, but also more chances to pick a poor word. Pushed to infinity, every word
                        becomes equally likely: pure noise.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: drag the temperature',
            body: (
                <>
                    <p>
                        Slide from 0.2 up to 3. At 0.2 "Paris" holds essentially 100%; at 3 it falls to about 30%.
                        Temperature never changes the <em>order</em> of the words, only how much the leader leads by.
                    </p>
                    <p className="text-text-muted text-sm">
                        Every bar is recomputed from the eight scores as you move the slider.
                    </p>
                </>
            ),
        },
        {
            title: 'Top-k: keep only the best k',
            body: (
                <>
                    <p>
                        <Code>top-k</Code> removes everything but the k highest words (dashed bars with a cross),
                        then renormalises so the survivors sum to 1. With k = 3, the kept words held 90.6% of the
                        probability; after renormalising "Paris" has 79.6%.
                    </p>
                    <p>
                        It cuts off the long tail of silly words. Its weakness: k is fixed, whether the model is
                        sure (one good word) or unsure (fifty plausible ones).
                    </p>
                </>
            ),
        },
        {
            title: 'Top-p: keep the smallest set that adds up',
            body: (
                <>
                    <p>
                        <Code>top-p</Code> (nucleus sampling) walks down the sorted words, adding probabilities
                        until the total reaches p, here 0.9, and keeps just those. At T = 1 that takes three words,
                        covering 90.6%.
                    </p>
                    <p>
                        Same result as top-k = 3 in this case, but for a different reason, which the next step
                        makes visible.
                    </p>
                </>
            ),
        },
        {
            title: 'Top-p adapts; top-k does not',
            body: (
                <>
                    <p>
                        Raise the temperature to 2 and keep p = 0.9: now six words are needed to reach 92.5%. When
                        the model is confident the nucleus is small; when it is unsure the nucleus grows on its own.
                    </p>
                    <p>
                        Honest caveats: these knobs change style, not truth. A confident wrong answer stays wrong at
                        low temperature, and the order in which APIs apply temperature, top-k and top-p differs
                        between libraries, so check the one you use.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Picking the next word = <strong>softmax(scores / temperature), optionally trimmed by top-k or top-p,
                then one random draw</strong>. Low temperature makes output predictable, high temperature makes it
                varied, and trimming protects you from the long tail of unlikely words.
            </p>
            <p>
                Pair this essay with <Code>Attention</Code> (where the scores come from) and <Code>Quantization</Code>{' '}
                (how the model that produces them is shrunk). In the Playground, write softmax with NumPy, divide the
                scores by a temperature, and draw samples with a seeded generator to see the frequencies match the bars.
            </p>
        </>
    ),
};
