import Code from '../Code';
import AttentionVisual from '../AttentionVisual';

// Explains essay: Attention — the mechanism behind Transformers
// (see pages/Explains.jsx for the registry).
export default {
    slug: 'attention',
    title: 'Attention',
    tagline: 'How "bank" figures out it\'s next to a river',
    minutes: 7,
    subtitle:
        'Every large language model — GPT, Claude, Gemini — is built on one operation repeated billions of times: attention. It lets each word rewrite its own meaning by looking at the words around it. Scroll through a real computation on a real sentence — every score, weight, and blended vector here is the actual arithmetic, not an illustration.',
    Visual: AttentionVisual,
    steps: [
        {
            title: 'One word, two meanings',
            body: (
                <>
                    <p>
                        Our sentence: <em>&ldquo;the bank of the river was muddy&rdquo;</em>. You knew instantly
                        which kind of bank. A word-counting model has no idea — and neither does a static
                        embedding, which stores <strong>one frozen vector per word</strong>. Look at bank&rsquo;s
                        stored vector: its money sense and water sense are locked in a permanent 0.9-to-0.9 tie.
                    </p>
                    <p>
                        In the <strong>Embeddings</strong> essay, every word got one fixed point in space. That
                        breaks on ambiguous words: bank must sit forever halfway between vault and riverbed.
                        Attention is the fix — let the <em>sentence</em> decide what the word means, every time.
                    </p>
                </>
            ),
        },
        {
            title: 'Let the sentence talk to itself',
            body: (
                <>
                    <p>
                        The core move is almost rude in its simplicity: <strong>every token looks at every other
                        token</strong> — including itself. Seven tokens means 7 × 7 = 49 pairwise glances, all
                        evaluated at once.
                    </p>
                    <p>
                        This is called <Code>self-attention</Code>: the sentence attends to itself, with no fixed
                        window and no left-to-right crawl. Whether the clue sits next door or forty words away,
                        the mechanism reaches it in a single step — one big matrix multiply, which is exactly what
                        GPUs love.
                    </p>
                </>
            ),
        },
        {
            title: 'Three jobs: query, key, value',
            body: (
                <>
                    <p>
                        Each token&rsquo;s embedding is projected into three roles. Its <Code>query</Code> is the
                        question it asks (&ldquo;I&rsquo;m an ambiguous noun — who can pin me down?&rdquo;). Its{' '}
                        <Code>key</Code> is the tag it advertises (&ldquo;I&rsquo;m about water and
                        nature&rdquo;). Its <Code>value</Code> is the content it hands over if selected.
                    </p>
                    <p>
                        In a real Transformer, three learned matrices <Code>W_Q</Code>, <Code>W_K</Code>,{' '}
                        <Code>W_V</Code> produce them. Here we use tiny 4-number embeddings and a simple hand-set
                        projection, so you can trace every digit that follows — but the arithmetic is the genuine
                        article.
                    </p>
                </>
            ),
        },
        {
            title: 'Relevance is a dot product',
            body: (
                <>
                    <p>
                        How relevant is each token to bank? Multiply bank&rsquo;s query with every key:{' '}
                        <Code>q · k</Code>. Vectors pointing the same way score high; unrelated ones score near
                        zero. These bars are the real numbers: <Code>river</Code> scores 3.63 against bank&rsquo;s
                        query, while <Code>the</Code> manages 0.16 — over twenty times weaker.
                    </p>
                    <p>
                        Why? bank and river share the thing-ness and water directions of the embedding space, so
                        their product piles up. A function word like <Code>the</Code> lives almost entirely in the
                        grammar direction, which bank&rsquo;s query barely asks about.
                    </p>
                </>
            ),
        },
        {
            title: 'Softmax: scores become shares',
            body: (
                <>
                    <p>
                        Raw scores grow with the vector dimension, so we first divide by <Code>√d</Code> (here
                        √4 = 2) to keep them tame — that&rsquo;s the &ldquo;scaled&rdquo; in scaled dot-product
                        attention. Then <Code>softmax</Code> exponentiates and normalises, turning scores into
                        weights that sum to exactly 1.
                    </p>
                    <p>
                        The real distribution: bank keeps <strong>39%</strong> of its attention on itself, gives{' '}
                        <strong>28%</strong> to river, <strong>14%</strong> to muddy — and roughly 5% each to the
                        function words. Nothing gets exactly zero; softmax hedges, it never slams doors.
                    </p>
                </>
            ),
        },
        {
            title: 'The blend: a vector that read the room',
            body: (
                <>
                    <p>
                        Final move: multiply each token&rsquo;s <em>value</em> vector by its weight and add them
                        up. That weighted average is bank&rsquo;s <strong>new</strong> vector — built fresh for
                        this sentence.
                    </p>
                    <p>
                        Watch the dimensions. The money component collapses from <Code>0.90</Code> to{' '}
                        <Code>0.35</Code>, while the water component climbs from <Code>0.90</Code> to{' '}
                        <Code>0.95</Code>. Nobody told the model bank meant riverbank — the weighted blend with
                        river and muddy simply drowned the finance sense. This is a{' '}
                        <Code>contextual embedding</Code>: same word, different sentence, different vector.
                    </p>
                </>
            ),
        },
        {
            title: 'The whole trick in one picture',
            body: (
                <>
                    <p>
                        This diagram <em>is</em> attention: one token&rsquo;s links to every token, thickness equal
                        to the real softmax weight, the little self-loop reminding you a token may keep most of its
                        attention for itself. Everything else in a Transformer is plumbing around this picture.
                    </p>
                    <p>
                        And because every row of weights is just matrix arithmetic —{' '}
                        <Code>softmax(QKᵀ/√d)·V</Code> — all seven tokens compute their blends simultaneously, in
                        one pass. No loops, no recurrence. That single formula is why the 2017 paper could be
                        titled <em>&ldquo;Attention Is All You Need&rdquo;</em>.
                    </p>
                </>
            ),
        },
        {
            title: 'Interrogate it yourself',
            body: (
                <>
                    <p>
                        Pick a focus token and read its real weight distribution. <Code>river</Code> pulls hardest
                        on its water neighbours — bank at 23%, muddy at 20%. Then try <Code>the</Code>: its row is
                        almost perfectly flat, about 14% everywhere.
                    </p>
                    <p>
                        That flatness is honest — this content-focused head has nothing useful to say about a bare
                        article, so softmax spreads the weight evenly. A shrug, in arithmetic form. Which raises a
                        question: wouldn&rsquo;t we want a <em>different</em> head for words like that?
                    </p>
                </>
            ),
        },
        {
            title: 'Many heads, one Transformer',
            body: (
                <>
                    <p>
                        Yes — and that&rsquo;s exactly <Code>multi-head attention</Code>. Run several attentions in
                        parallel, each with its own learned projections. Our second head amplifies the grammar
                        dimension instead of content: now <Code>the</Code> attends to <Code>of</Code>,{' '}
                        <Code>was</Code>, and the other <Code>the</Code> at ~20% each, ignoring the nouns. One
                        head tracks meaning, another tracks structure — computed for real on the same sentence.
                    </p>
                    <p>
                        Scale it up and you have a modern LLM: dozens of heads per layer, vectors thousands of
                        dimensions wide, dozens of layers stacked so each round of blending feeds the next.
                        Between your prompt and the answer, this same lookup — query, key, value, softmax, blend —
                        runs billions of times.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Attention = <strong>each token asks a question (Q), scores every token&rsquo;s tag (K) with a dot
                product, softmaxes the scores into weights, and takes the weighted blend of their content
                (V)</strong>. The result is a context-aware vector — how &ldquo;bank&rdquo; learns it&rsquo;s next
                to a river, and the single mechanism Transformers repeat at scale.
            </p>
            <p>
                Read the <strong>Embeddings</strong> essay first if the vectors felt mysterious, then ask
                Vaathiyaar in the <strong>Playground</strong> to implement{' '}
                <Code>softmax(Q @ K.T / sqrt(d)) @ V</Code> in NumPy on this exact sentence — it&rsquo;s about ten
                lines. The <strong>Classroom</strong>&rsquo;s AI track picks up from here with how these blends are
                trained.
            </p>
        </>
    ),
};
