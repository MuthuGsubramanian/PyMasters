import Code from '../Code';
import BM25Visual from '../BM25Visual';

// Explains essay: BM25 keyword ranking (see pages/Explains.jsx for the registry).
export default {
    slug: 'bm25-search-ranking',
    title: 'BM25: How Search Ranks Pages',
    tagline: 'The 30-year-old formula still inside most search boxes',
    minutes: 7,
    subtitle:
        'Before embeddings, search engines had to rank pages with nothing but word counts — and the recipe they settled on, BM25, is still the first stage of many RAG systems. Build it one idea at a time on seven tiny help pages. Every score here is computed for real from the page text.',
    Visual: BM25Visual,
    steps: [
        {
            title: 'Seven pages, one query',
            body: (
                <>
                    <p>
                        A help centre has seven pages. A user types <Code>reset password</Code>. Which page should come first?
                        The bars show how long each page is — remember that, length will matter.
                    </p>
                    <p>
                        Page 3 is "how to reset a forgotten password in three steps". Page 2 is a pile of password tips.
                        Page 5 explains how to recover access with your login credentials. We want a formula that ranks these sensibly.
                    </p>
                </>
            ),
        },
        {
            title: 'Step 1: count the query words',
            body: (
                <>
                    <p>
                        The simplest signal: how often does each query word appear on each page? Circles are
                        "reset", squares are "password". This count is the <Code>term frequency</Code>, or tf.
                    </p>
                    <p>
                        Pages 4, 5 and 6 contain neither word. Page 2 contains "password" five times and never "reset".
                    </p>
                </>
            ),
        },
        {
            title: 'Step 2: rare words matter more',
            body: (
                <>
                    <p>
                        "Reset" appears on only 2 of 7 pages; "password" on 4. A word that shows up almost everywhere
                        tells you little, so each word gets a weight: the <Code>inverse document frequency</Code>.
                        Here "reset" weighs about 1.16 and "password" about 0.58.
                    </p>
                    <p>
                        The formula is <Code>ln(1 + (N − df + 0.5) / (df + 0.5))</Code> — N pages, df of them containing the word.
                    </p>
                </>
            ),
        },
        {
            title: 'Step 3: multiply, add, and watch it go wrong',
            body: (
                <>
                    <p>
                        Classic <Code>tf × idf</Code>, summed over query words. The winner is page 2 — the one that
                        repeats "password" five times and never mentions resetting. That's keyword stuffing, and it works
                        because raw counts grow without limit.
                    </p>
                    <p>
                        Pages 1 and 3, which actually answer the question, come second and third.
                    </p>
                </>
            ),
        },
        {
            title: 'Fix 1: saturation',
            body: (
                <>
                    <p>
                        The second mention of a word is evidence; the fifth is mostly noise. BM25 replaces the raw count
                        with <Code>tf × (k1 + 1) / (tf + k1)</Code>. With k1 = 1.2: one mention → 1.0, two → 1.38,
                        five → 1.77, and it can never exceed 2.2.
                    </p>
                    <p>
                        The dashed line is the raw count; the solid curve flattens out. Repetition stops paying.
                    </p>
                </>
            ),
        },
        {
            title: 'Fix 2: be fair to long pages — try it',
            body: (
                <>
                    <p>
                        A long page mentions many words by accident, so BM25 also divides by a length factor
                        <Code> 1 − b + b × (length / average length)</Code>, with b = 0.75. Page 6 is 29 words against an
                        average of about 12, so it is penalised.
                    </p>
                    <p>
                        Drag <Code>k1</Code>. Small k1 saturates almost immediately (stuffed page 2 sinks); big k1 lets
                        repetition count again (page 2 climbs). Defaults of 1.2–2.0 are a compromise.
                    </p>
                </>
            ),
        },
        {
            title: 'The ranking',
            body: (
                <>
                    <p>
                        With k1 = 1.2, page 3 (1.94) edges page 1 (1.85); the stuffed page 2 falls to 1.05, and
                        page 7 (only "password") scores 0.70. The pages that really explain resetting a password now lead.
                    </p>
                    <p>
                        Libraries such as <Code>rank_bm25</Code>, Elasticsearch and SQLite FTS5 all run this family of formula.
                    </p>
                </>
            ),
        },
        {
            title: 'The catch: it only matches words',
            body: (
                <>
                    <p>
                        Page 5 tells the user how to recover access — but it shares no word with the query, so it scores
                        exactly zero. BM25 has no idea that "recover account access" and "reset password" mean the same.
                    </p>
                    <p>
                        That gap is why modern search pairs BM25 with <Code>embeddings</Code>: BM25 is exact, cheap and
                        great at rare names and codes; embeddings catch meaning. Blending both is called hybrid retrieval.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                BM25 = <strong>rare words weigh more, repeats saturate, long pages get a fair discount</strong>. Three
                small fixes to raw word counting, and no training data needed.
            </p>
            <p>
                Next, see how meaning-based matching works in the <Code>Embeddings</Code> and <Code>Attention</Code> essays,
                then try scoring your own documents in the Playground.
            </p>
        </>
    ),
};
