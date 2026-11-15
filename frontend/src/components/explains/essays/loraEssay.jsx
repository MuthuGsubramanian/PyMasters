import Code from '../Code';
import LoRAVisual from '../LoRAVisual';

// Explains essay: LoRA — low-rank adaptation (see pages/Explains.jsx for the registry).
export default {
    slug: 'lora',
    title: 'LoRA: Fine-Tuning with Two Thin Matrices',
    tagline: 'Why you can adapt a giant model by training a sliver of it',
    minutes: 6,
    subtitle:
        'Fine-tuning a large model normally means updating every weight — enormous memory, enormous checkpoints. LoRA rests on a quiet observation: the change fine-tuning makes is surprisingly simple. Scroll to see a real weight update squeezed into two thin matrices — the SVD here is computed for real.',
    Visual: LoRAVisual,
    steps: [
        {
            title: 'A frozen weight matrix',
            body: (
                <>
                    <p>
                        Inside a neural network, most of the knowledge lives in big grids of numbers called weight
                        matrices. Here is a toy one, 8 × 8 = 64 numbers. Real ones in language models are thousands
                        by thousands.
                    </p>
                    <p>
                        Call it <Code>W</Code>. Pretraining has already set it; now we want the model to do
                        something new, like follow your company&apos;s writing style.
                    </p>
                </>
            ),
        },
        {
            title: 'Full fine-tuning learns a full-size change',
            body: (
                <>
                    <p>
                        Ordinary fine-tuning nudges every entry of <Code>W</Code>. The total nudge is another grid
                        the same size, <Code>ΔW</Code> (&quot;delta W&quot;). Filled cells are increases, cells with a
                        dash are decreases.
                    </p>
                    <p>
                        Storing and training a whole <Code>ΔW</Code> for every layer costs as much as the model
                        itself, plus optimizer state on top.
                    </p>
                </>
            ),
        },
        {
            title: 'The change has only a few strong directions',
            body: (
                <>
                    <p>
                        A matrix can be split into independent &quot;directions&quot;, each with a strength — its{' '}
                        <Code>singular values</Code>. The bars show them for this <Code>ΔW</Code>:
                        two are large, the other two are tiny.
                    </p>
                    <p>
                        Honest caveat: we built this toy to be that way. The LoRA paper&apos;s claim is that real
                        fine-tuning updates tend to be like this too — an empirical finding, not a law.
                    </p>
                </>
            ),
        },
        {
            title: 'Rank 1: one tall column times one wide row',
            body: (
                <>
                    <p>
                        If only one direction mattered, <Code>ΔW</Code> would equal a tall thin matrix{' '}
                        <Code>B</Code> (8 × 1) times a short wide one <Code>A</Code> (1 × 8). That&apos;s 16 numbers
                        instead of 64.
                    </p>
                    <p>
                        The product on the right is the best possible rank-1 stand-in. It captures most of the
                        pattern, but about a third of <Code>ΔW</Code> is still missing.
                    </p>
                </>
            ),
        },
        {
            title: 'Rank 2: add the second direction',
            body: (
                <>
                    <p>
                        With <Code>r = 2</Code>, <Code>B</Code> is 8 × 2 and <Code>A</Code> is 2 × 8: 32 numbers.
                        The product now looks nearly identical to the real <Code>ΔW</Code> — only about 6.5% of it
                        is unexplained.
                    </p>
                    <p>
                        That <Code>r</Code> is LoRA&apos;s one dial: the <Code>rank</Code>, the number of directions
                        the update is allowed to use.
                    </p>
                </>
            ),
        },
        {
            title: 'Try the rank yourself',
            body: (
                <>
                    <p>
                        Slide <Code>r</Code> from 1 to 4. The error falls fast, then flattens: the first two
                        directions do nearly all of the work.
                    </p>
                    <p className="text-text-muted text-sm">
                        At r = 4 the toy is exact but uses 64 numbers — no saving, because 8 is so small. Savings
                        only appear when r is much smaller than the matrix size.
                    </p>
                </>
            ),
        },
        {
            title: 'Freeze W, train only B and A',
            body: (
                <>
                    <p>
                        This is the whole LoRA trick. Keep <Code>W</Code> frozen. Add a side path{' '}
                        <Code>B·A</Code> and train only those two small matrices: the layer then computes with{' '}
                        <Code>W + B·A</Code>. (In practice you start with <Code>B</Code> at zero so the model
                        begins unchanged, and apply a scaling factor.)
                    </p>
                    <p>
                        Here the learned update is found by SVD, but in real LoRA you never see <Code>ΔW</Code>:
                        gradient descent learns <Code>B</Code> and <Code>A</Code> directly.
                    </p>
                </>
            ),
        },
        {
            title: 'The payoff, and the catches',
            body: (
                <>
                    <p>
                        For one 4096 × 4096 layer, a full update is 16,777,216 numbers; rank 8 is 2 × 4096 × 8 =
                        65,536 — about 0.39%. Adapters are tiny files you can swap per task on one shared base
                        model.
                    </p>
                    <p>
                        The catches: if a task truly needs a high-rank change, a small <Code>r</Code> cannot
                        express it, and LoRA can underperform full fine-tuning. Rank is a hyperparameter you tune,
                        not a free lunch.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                LoRA = <strong>freeze the big matrix, learn its change as a product of two thin matrices</strong>.
                It works when the update is low-rank, so a handful of directions capture it.
            </p>
            <p>
                Next, see the Classroom lesson on LoRA and low-rank decomposition, and the{' '}
                <Code>PCA</Code> essay for the same &quot;few strong directions&quot; idea applied to data. Related:
                the <Code>quantization</Code> essay for shrinking the frozen base model too.
            </p>
        </>
    ),
};
