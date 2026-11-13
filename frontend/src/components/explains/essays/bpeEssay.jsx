import Code from '../Code';
import BPEVisual from '../BPEVisual';

// Explains essay: Byte-Pair Encoding tokenization (see pages/Explains.jsx for the registry).
// Every number in the prose comes from the visual's real merge computation.
export default {
    slug: 'bpe-tokenization',
    title: 'Tokenization (BPE)',
    tagline: 'How a language model chops text into pieces before it reads a word',
    minutes: 6,
    subtitle:
        'A language model never sees letters or whole words — it sees tokens. Byte-Pair Encoding builds the token list by one simple habit: find the two neighbours that appear together most often and glue them. Scroll to watch it run on a four-word corpus, with every count computed for real.',
    Visual: BPEVisual,
    steps: [
        {
            title: 'Start with single characters',
            body: (
                <>
                    <p>
                        Our whole training text is four words: <Code>low</Code> (seen 5 times),{' '}
                        <Code>lower</Code> (2), <Code>newest</Code> (6) and <Code>widest</Code> (3). Each row shows
                        one word split into characters, drawn as thin outlined tiles. The <Code>_</Code> tile just
                        marks &quot;the word ends here&quot;.
                    </p>
                    <p>
                        Written this way the corpus costs 95 tokens and the vocabulary is only 11 symbols. Short
                        vocabulary, long sequences — BPE will trade one for the other.
                    </p>
                </>
            ),
        },
        {
            title: 'Count the neighbours',
            body: (
                <>
                    <p>
                        Look at every pair of adjacent tiles and add up how often it occurs, weighted by how common
                        the word is. The pair <Code>e s</Code> appears in <Code>newest</Code> (6 times) and{' '}
                        <Code>widest</Code> (3 times), so it scores 9.
                    </p>
                    <p>
                        Honest detail: <Code>e s</Code>, <Code>s t</Code> and <Code>t _</Code> all score 9. The
                        algorithm needs a tie-break rule; here it is alphabetical. Real tokenizers pick some fixed
                        rule too, and different rules give slightly different vocabularies.
                    </p>
                </>
            ),
        },
        {
            title: 'Merge the winner',
            body: (
                <>
                    <p>
                        Glue <Code>e</Code> and <Code>s</Code> into a new symbol <Code>es</Code> everywhere it
                        occurs. It is drawn as a filled, bold tile — a real token now, not just a letter. Nine
                        occurrences became one symbol each, so the corpus shrinks from 95 tokens to 86 while the
                        vocabulary grows by exactly one.
                    </p>
                    <p>
                        That is the entire algorithm: count pairs, merge the best, repeat. The list of merges, in
                        order, <em>is</em> the tokenizer.
                    </p>
                </>
            ),
        },
        {
            title: 'Merges build on merges',
            body: (
                <>
                    <p>
                        The second merge uses the first: <Code>es</Code> + <Code>t</Code> becomes{' '}
                        <Code>est</Code>, and the third adds the end marker to make <Code>est_</Code>. After three
                        merges the whole word-ending &quot;est&quot; is a single tile, and the corpus costs 68
                        tokens.
                    </p>
                    <p>
                        Notice nobody told the algorithm that &quot;-est&quot; is a meaningful suffix. Frequency
                        alone discovered it. Sometimes frequency finds linguistic units; sometimes it finds odd
                        fragments — it only knows counts.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: drag the merges',
            body: (
                <>
                    <p>
                        Slide from 0 to 10 merges. Watch the &quot;tokens to write the corpus&quot; figure fall
                        (95 → 28) while the vocabulary rises (11 → 21). Every merge makes text shorter and the
                        dictionary bigger.
                    </p>
                    <p className="text-text-muted text-sm">
                        Both numbers are computed from the real merges, not illustrated.
                    </p>
                </>
            ),
        },
        {
            title: 'Common words become single tokens',
            body: (
                <>
                    <p>
                        By merge five, <Code>l o w</Code> has collapsed into one token <Code>low</Code>, and the
                        corpus costs 54 tokens. A common word earns its own entry; a rare word stays in pieces.
                    </p>
                    <p>
                        This is why frequent English words are one token in real models while rare names, typos
                        and unusual words split into several. Fewer tokens means cheaper and faster processing, so
                        the vocabulary spends its slots where the text is.
                    </p>
                </>
            ),
        },
        {
            title: 'Eight merges in',
            body: (
                <>
                    <p>
                        After eight merges <Code>newest_</Code> is one whole token and <Code>low</Code> sits beside
                        its neighbours, 36 tokens in total — down from 95. The frequent words are nearly
                        whole; <Code>widest</Code> (only 3 occurrences) is still mostly pieces.
                    </p>
                    <p>
                        There is a stopping rule: you choose how many merges to run, which sets the vocabulary size.
                        Real models run tens of thousands of merges, trading a larger embedding table against shorter
                        sequences.
                    </p>
                </>
            ),
        },
        {
            title: 'New words still work',
            body: (
                <>
                    <p>
                        The payoff: tokenize words the tokenizer never saw. Replay the ten merges in order on{' '}
                        <Code>lowest</Code> and you get <Code>low</Code> + <Code>est_</Code>; on{' '}
                        <Code>slowest</Code> you get <Code>s</Code> + <Code>low</Code> + <Code>est_</Code>. Neither word
                        was in the corpus, yet both are built from known pieces.
                    </p>
                    <p>
                        Words with no useful merges, like <Code>wider</Code> here, simply fall back to single
                        characters — six tokens. Nothing is ever &quot;unknown&quot;. The honest cost: text that
                        looks unlike the training data (other languages, code, long numbers) is split into many
                        small tokens, which is costlier and can hurt model quality.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Byte-Pair Encoding = <strong>start from characters, repeatedly merge the most frequent adjacent
                pair, and keep the ordered merge list as your tokenizer</strong>. Frequent text becomes few big
                tokens, rare text stays in small pieces, and any input can be encoded.
            </p>
            <p>
                In Classroom, try the trending-AI and AI-engineering lessons on embeddings and local models; pair
                this essay with <Code>Embeddings</Code> (what happens to each token next) and{' '}
                <Code>Attention</Code> (how the tokens then talk to each other). In the Playground, write the
                count-and-merge loop yourself with a <Code>dict</Code> and <Code>collections.Counter</Code>.
            </p>
        </>
    ),
};
