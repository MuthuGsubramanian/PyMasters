import Code from '../Code';
import EmbeddingsVisual from '../EmbeddingsVisual';

// Explains essay: Embeddings & Semantic Search (see pages/Explains.jsx).
export default {
    slug: 'embeddings',
    title: 'Embeddings & Semantic Search',
    tagline: 'How a computer knows two sentences "mean" the same thing',
    minutes: 7,
    subtitle:
        'Keyword search only finds what it can spell-check. Semantic search finds what you meant. Underneath both is the same idea: turn text into a vector, and let geometry stand in for meaning. Scroll to watch ten short lesson blurbs become real vectors, get mapped in space, and get searched — every weight and every ranking below is computed live from the text, nothing is hand-placed.',
    Visual: EmbeddingsVisual,
    steps: [
        {
            title: 'Search that only knows spelling',
            body: (
                <>
                    <p>
                        Here are ten short lesson blurbs — some about ML algorithms, some about Python basics, some
                        about retrieval itself. To a computer they're just strings of characters; it has no idea
                        which ones are "about" the same thing.
                    </p>
                    <p>
                        A search box that just matches exact words would miss a query like{' '}
                        <em>"grouping unlabeled data"</em> against a blurb that says <em>"clusters"</em> — same
                        idea, different word. We need a representation where <strong>meaning</strong>, not spelling,
                        determines closeness.
                    </p>
                </>
            ),
        },
        {
            title: 'Turn text into numbers',
            body: (
                <>
                    <p>
                        The classic first move: count words, weighted by how distinctive they are. This is{' '}
                        <Code>TF-IDF</Code> — <Code>term frequency</Code> (how often a word appears in this doc)
                        times <Code>inverse document frequency</Code> (a penalty for words that show up
                        everywhere). Every one of the 45 words across our ten blurbs gets a slot.
                    </p>
                    <p>
                        The bars are one document's real weight vector: common connective words are filtered out,
                        and words unique to this blurb (<Code>kmeans</Code>, <Code>unlabeled</Code>) score higher
                        than the one shared with another algorithm blurb (<Code>data</Code>).
                    </p>
                </>
            ),
        },
        {
            title: 'Plot the vectors',
            body: (
                <>
                    <p>
                        Each document is now a point in a 45-dimensional space — one axis per vocabulary word. No
                        human can picture 45 dimensions, so we compress it to 2 with{' '}
                        <Code>PCA</Code> (principal component analysis): find the two directions along which the
                        documents differ the most, and project onto those.
                    </p>
                    <p>
                        Nobody told the algorithm which blurb belongs to which topic — the three regions (circles,
                        squares, triangles) emerged purely from shared vocabulary. That's the payoff of turning
                        text into vectors: <strong>topic becomes geometry</strong>.
                    </p>
                </>
            ),
        },
        {
            title: "Distance isn't quite it — cosine similarity",
            body: (
                <>
                    <p>
                        A small, exact example: review <Code>A</Code> says "dog" five times. Review{' '}
                        <Code>B</Code> says "dog" once — same topic, just shorter. Review <Code>C</Code> mostly
                        says "dog" but mentions "cat" once too.
                    </p>
                    <p>
                        By raw distance, C sits closer to A than B does — B's dot is just far down the same line.
                        But by <strong>angle</strong>, B is a perfect match (cos = 1.00) and C is slightly off
                        (cos = 0.95), because B points in <em>exactly</em> the same direction as A. Semantic search
                        cares about direction, not length, so it uses <Code>cosine similarity</Code> — which is why
                        a one-line query can match a whole paragraph.
                    </p>
                </>
            ),
        },
        {
            title: 'Ask a question, find the nearest vectors',
            body: (
                <>
                    <p>
                        Pick a query below. It gets vectorized the exact same way as the documents, dropped onto
                        the same map, and every document is ranked by cosine similarity to it — the connecting
                        line points at the winner.
                    </p>
                    <p className="text-text-muted text-sm">
                        Try "python dictionaries" and watch it land in the python cluster and outrank every ML
                        blurb, even ones that also mention "data".
                    </p>
                </>
            ),
        },
        {
            title: "When the words don't match",
            body: (
                <>
                    <p>
                        Now the honest failure. Query: <em>"puppies and kittens are cute"</em>. Every similarity
                        score comes back at 0% — the query shares <strong>zero vocabulary words</strong> with any
                        of our ten blurbs, so a keyword vector has nothing to match on, no matter how "close" the
                        topic might feel to a human.
                    </p>
                    <p>
                        This is the ceiling of bag-of-words vectors like TF-IDF: they can only ever connect
                        documents that share literal words.
                    </p>
                </>
            ),
        },
        {
            title: 'Real embeddings go further',
            body: (
                <>
                    <p>
                        Modern <Code>embedding models</Code> — like <Code>all-MiniLM-L6-v2</Code>, one of this
                        week's most-used small models — replace hand-built TF-IDF with a neural network trained on
                        hundreds of millions of sentence pairs. It learns to place <em>"puppy"</em> near{' '}
                        <em>"dog"</em> even though the two share no letters, because it saw enough real usage to
                        learn the relationship.
                    </p>
                    <p>
                        Production search rarely stops at one similarity pass, either: a fast embedding model
                        retrieves a broad candidate set (this step), then a slower <Code>cross-encoder reranker</Code>{' '}
                        re-scores just those candidates for precision. Speed first, accuracy second — the two-stage
                        pattern behind most real RAG pipelines.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        Ten documents fit in memory and get searched in a blink. Real systems index millions to
                        billions of vectors, which means brute-force cosine search doesn't scale — production
                        systems use an approximate index like <Code>FAISS</Code> or <Code>HNSW</Code> that trades a
                        sliver of accuracy for enormous speed.
                    </p>
                    <p>
                        And "semantically similar" isn't "factually correct" — a nearby vector means the wording is
                        related, not that the retrieved text is true. The 2D map here is also a compression: real
                        similarity is always computed in the full-dimensional space, the picture is just for us.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Semantic search = <strong>turn text into a vector, compare vectors by cosine similarity, rank by
                the result</strong>. Bag-of-words vectors like TF-IDF only connect shared words; learned embedding
                models connect shared <em>meaning</em> — and real pipelines usually retrieve broad, then rerank
                precise.
            </p>
            <p>
                Go build it: the Classroom lessons <Code>The Heart of RAG: Cosine Similarity From Scratch</Code> and{' '}
                <Code>Semantic Search with all-MiniLM-L6-v2</Code> implement exactly this in real code, and{' '}
                <Code>Reranking: The Two-Stage Trick That Fixes Bad RAG</Code> covers the second stage. Or ask
                Vaathiyaar to embed a few sentences with <Code>sentence-transformers</Code> in the Playground and
                watch real cosine scores appear.
            </p>
        </>
    ),
};
