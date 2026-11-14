import Code from '../Code';
import BM25Visual from '../BM25Visual';

// Explains essay: BM25 keyword search (see pages/Explains.jsx for the registry).
export default {
    slug: 'bm25',
    title: 'BM25 Keyword Search',
    tagline: 'How search engines rank pages by the words they contain',
    minutes: 7,
    subtitle:
        'Before embeddings, search engines ranked documents by counting words — and the best of those formulas, BM25, still powers Elasticsearch, Lucene and most "hybrid" RAG systems today. Scroll to build it one idea at a time on six tiny documents. Every score here is computed for real.',
    Visual: BM25Visual,
    steps: [
        {
            title: 'Six documents, one query',
            body: (
                <>
                    <p>
                        Here are six tiny "web pages", each drawn as a strip of word cells. The query is{' '}
                        <Code>python sort</Code>. Wherever a document contains <em>python</em> its strip shows a{' '}
                        <strong>circle</strong>; wherever it contains <em>sort</em> it shows a{' '}
                        <strong>square</strong>. Grey cells are every other word.
                    </p>
                    <p>
                        The job: put the documents in the best order for that query, using nothing but the words
                        on the page. No meaning, no AI — just text. BM25 is a recipe for doing that well.
                    </p>
                </>
            ),
        },
        {
            title: 'Stage 1: just count',
            body: (
                <>
                    <p>
                        The naive recipe: score = how many times query words appear. Count the circles and
                        squares and you get 6 for the "keyword-stuffed page", 4 each for "sorting a list" and
                        "sorting algorithms", 3 for the beginner tutorial, and 1 for the other two.
                    </p>
                    <p>
                        The winner is the page that just repeats <em>sort</em> and adds <em>buy cheap deals</em>.
                        That is the first lesson of search: raw counts are easy to game, and they treat every
                        word as equally important. Both problems need fixing.
                    </p>
                </>
            ),
        },
        {
            title: 'Stage 2: rare words are worth more',
            body: (
                <>
                    <p>
                        <em>python</em> appears in 5 of the 6 documents, so seeing it tells you very little —
                        nearly everything has it. <em>sort</em> appears in only 3, so it narrows things down.
                        BM25 weights each word by its <Code>IDF</Code> (inverse document frequency):{' '}
                        <Code>ln(1 + (N − df + 0.5) / (df + 0.5))</Code>, where N is the number of documents and
                        df the number containing the word.
                    </p>
                    <p>
                        Here that gives <em>python</em> a weight of 0.24 and <em>sort</em> a weight of 0.69 —
                        almost three times as much. Multiply each count by its weight and the order is still
                        led by the stuffed page (4.16 for its sort squares, plus 0 circles), but the single-
                        circle pages now sit clearly at the bottom.
                    </p>
                </>
            ),
        },
        {
            title: 'Stage 3: diminishing returns',
            body: (
                <>
                    <p>
                        Is a page that says <em>sort</em> six times really twice as relevant as one that says
                        it three times? Probably not. BM25 squashes repeated words with a saturating curve:{' '}
                        <Code>tf × (k1 + 1) / (tf + k1)</Code>. With <Code>k1 = 1.2</Code>, the first occurrence
                        is worth a lot, the second a bit less, and by the sixth you are barely adding anything.
                    </p>
                    <p>
                        Watch the bars: the stuffed page's lead collapses from 4.16 against 2.32 (nearly 2×) to
                        1.27 against 1.33 — it now loses to "sorting a list". Repetition has been tamed, not
                        banned: the curve flattens out but never turns downward.
                    </p>
                </>
            ),
        },
        {
            title: 'Stage 4: long documents get a discount',
            body: (
                <>
                    <p>
                        A 23-word page has twice the chance of containing any given word just by being long.
                        So BM25 compares each document's length with the average (about 12.8 words here) and
                        stretches the saturation point for long ones: the denominator becomes{' '}
                        <Code>tf + k1 × (1 − b + b × length / avg_length)</Code>.
                    </p>
                    <p>
                        With <Code>b = 0.75</Code>, "sorting algorithms (long)" drops from 1.29 to 1.05 — it
                        mentions both words twice, but spread across a lot of text. Meanwhile the short pasta
                        scraper creeps up slightly. This is the complete BM25 formula; the scores are now final.
                    </p>
                </>
            ),
        },
        {
            title: 'The ranking',
            body: (
                <>
                    <p>
                        Sort by score and you get the search results: <strong>sorting a list</strong> (1.30),
                        the stuffed page (1.26), the long algorithms page (1.05), then the three weak matches.
                        Not perfect — the stuffed page should arguably be last — but its lead from counting
                        (6 against 4) is now a margin of just 0.05.
                    </p>
                    <p>
                        Notice what BM25 never needed: training data, labels or a GPU. It is a formula over
                        word counts, built from a table of which words appear where (an{' '}
                        <Code>inverted index</Code>), and it scores millions of documents in milliseconds.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Two dials control the whole thing. <Code>k1</Code> sets how fast repeats stop helping:
                        slide it down to about 0.5 and the stuffed page falls to third; push it to 2 and it
                        takes first place again. <Code>b</Code> sets how hard length is punished: at{' '}
                        <Code>b = 0</Code> the long algorithms page jumps back up and nearly catches the leader.
                    </p>
                    <p className="text-text-muted text-sm">
                        (Common defaults are k1 between 1.2 and 2 and b = 0.75 — sensible starting points, but
                        the best values depend on your documents, so tune them against queries you care about.)
                    </p>
                </>
            ),
        },
        {
            title: 'The fine print',
            body: (
                <>
                    <p>
                        BM25 only matches <strong>words</strong>. A page about "ordering a list" shares no
                        words with <em>python sort</em> and scores exactly 0, however relevant it is; typos,
                        synonyms and paraphrases are invisible to it. That is the gap embeddings fill — they
                        match by meaning.
                    </p>
                    <p>
                        The flip side: embeddings can miss exact names, error codes and rare identifiers that
                        BM25 nails. That is why production RAG systems often run <em>both</em> and merge the
                        two rankings, a pattern called hybrid search.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                BM25 = <strong>count the query words, weight rare ones up, let repeats saturate, and discount
                long documents</strong>. Each of those four ideas fixes a specific way that naive counting
                goes wrong, and together they make a fast, training-free ranker that is still hard to beat on
                exact-match queries. Pair it with the Embeddings essay to see the other half of modern search:
                BM25 asks "do the words match?" while embeddings ask "does the meaning match?". The Attention
                essay shows how language models then use whatever you retrieve.
            </p>
            <p>
                Feel it in code: open the <strong>Playground</strong> and ask Vaathiyaar to implement BM25
                from scratch in plain Python on a few sentences — then change k1 and b and watch the ranking
                move, exactly like this essay.
            </p>
        </>
    ),
};
