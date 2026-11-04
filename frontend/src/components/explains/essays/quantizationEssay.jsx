import Code from '../Code';
import QuantizationVisual from '../QuantizationVisual';

// Explains essay: Quantization (see pages/Explains.jsx for the registry).
// Numbers quoted in the prose come from the visual's real computation.
export default {
    slug: 'quantization',
    title: 'Quantization',
    tagline: 'Shrinking a model by rounding its numbers — carefully',
    minutes: 6,
    subtitle:
        'A model is mostly a giant list of decimal numbers called weights. Storing each one in 32 bits is generous. Quantization asks: how coarsely can we round them before the model notices? It is why an 8-billion-parameter model can run on a laptop. Scroll to round 48 real weights and measure the damage.',
    Visual: QuantizationVisual,
    steps: [
        {
            title: 'A model is a pile of numbers',
            body: (
                <>
                    <p>
                        Each circle is one weight — one number the model learned. Real models have billions; we
                        use 48 so you can see them all. Stored as <Code>float32</Code>, each costs 32 bits.
                    </p>
                    <p>
                        Most weights are small and bunched near zero, but one (the high circle) is far larger than
                        the rest. Real models have these too, and they will matter later.
                    </p>
                </>
            ),
        },
        {
            title: 'Only a few values allowed',
            body: (
                <>
                    <p>
                        With <Code>b</Code> bits you can store only 2<sup>b</sup> different codes. At 3 bits that is
                        eight, and a symmetric scheme uses seven of them: −3, −2, −1, 0, 1, 2, 3 times a step size.
                        The dashed lines mark the only values we can now represent.
                    </p>
                    <p>
                        The step size, called the <Code>scale</Code>, is chosen so the largest weight lands on
                        the outermost line: <Code>scale = max|w| / 3</Code>.
                    </p>
                </>
            ),
        },
        {
            title: 'Snap every weight to the nearest line',
            body: (
                <>
                    <p>
                        Each weight is divided by the scale, rounded to a whole number (its <Code>integer code</Code>),
                        and later multiplied back. The squares show the recovered values; the short vertical
                        segments show how far each weight moved.
                    </p>
                    <p>
                        Averaging the squared lengths of those segments gives the mean squared error — a single
                        number for the damage. At 3 bits it is about 0.052.
                    </p>
                </>
            ),
        },
        {
            title: 'More bits, finer grid',
            body: (
                <>
                    <p>
                        At 8 bits there are 255 usable levels and the squares sit almost exactly on the circles.
                        The error drops to about 0.000025 — roughly two thousand times smaller than at 3 bits.
                    </p>
                    <p>
                        That is why 8-bit quantization is often called nearly free: a quarter of the memory, and
                        the rounding noise is tiny next to the weights themselves.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: drag the bits',
            body: (
                <>
                    <p>
                        Slide from 8 bits down to 2. Notice the pattern: every bit you remove roughly doubles the
                        step size, so the squared error grows about four-fold. At 2 bits there are only three
                        levels (−1, 0, +1 times the scale) and the picture falls apart.
                    </p>
                    <p className="text-text-muted text-sm">
                        These are the real errors for these 48 weights, not an illustration.
                    </p>
                </>
            ),
        },
        {
            title: 'The outlier problem',
            body: (
                <>
                    <p>
                        The one large weight sets the scale for everyone. Because the grid must stretch to reach
                        it, the step is coarse for all the small weights — that is where most of the 4-bit error
                        comes from.
                    </p>
                    <p>
                        The tempting fix is to ignore the outlier when picking the scale and clamp it. Look at the
                        result: the error gets <em>worse</em> (about 0.049 against 0.011), because we destroyed the
                        one value that mattered most. Outliers in real LLMs often carry important signal, so
                        clipping them is a gamble, not a free win.
                    </p>
                </>
            ),
        },
        {
            title: '4 bits: an eighth of the memory',
            body: (
                <>
                    <p>
                        With a single scale for all 48 weights, 4 bits gives seven levels on each side of zero and
                        an error of about 0.011, at 12.5% of the float32 memory — an 8× saving. This is the
                        format behind many "Q4" local models.
                    </p>
                    <p>
                        In practice you store the integer codes plus the scale, and either dequantize on the fly
                        or run integer arithmetic directly.
                    </p>
                </>
            ),
        },
        {
            title: 'Give each block its own scale',
            body: (
                <>
                    <p>
                        A better trick is <Code>block-wise</Code> quantization: split the weights into small
                        groups (here 8 each) and give every group its own scale. The outlier now only stretches
                        the grid of its own block; the other five blocks get fine steps.
                    </p>
                    <p>
                        At 4 bits the error falls to about 0.0026, over four times better than one shared scale.
                        The honest cost: you store six scales as well, so the true size is slightly above 4 bits per
                        weight. And MSE on weights is only a proxy — what matters is whether the model's answers
                        stay good, which you must measure on real tasks.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Quantization = <strong>store small integer codes plus a scale, instead of full-precision
                decimals</strong>. Each bit removed halves the grid resolution, outliers dominate the error, and
                per-block scales are the standard defence. It trades a little accuracy for a lot of memory.
            </p>
            <p>
                In Classroom, try the trending-AI lessons on running small local models; pair this essay with{' '}
                <Code>Embeddings</Code> (where vectors can be quantized too) and <Code>Neural Network</Code> (where
                the weights come from). In the Playground, quantize a NumPy array by hand: divide by the scale,
                round, multiply back, and measure the error yourself.
            </p>
        </>
    ),
};
