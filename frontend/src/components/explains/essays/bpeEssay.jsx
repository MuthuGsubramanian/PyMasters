import Code from '../Code';
import BPEVisual from '../BPEVisual';

// Explains essay: Byte-pair encoding / tokenization (see pages/Explains.jsx for the registry).
// Every number in the prose comes from the visual's real merge computation
// (verified against an independent Python implementation).
export default {
    slug: 'tokenization-bpe',
    title: 'Tokenization (BPE)',
    tagline: 'How language models chop text into pieces',
    minutes: 6,
    subtitle:
        'A language model never sees letters or words — it sees tokens, integer IDs for chunks of text. Where do the chunks come from? Not from a dictionary: they are learned by counting. Byte-pair encoding starts from single characters and keeps gluing together whichever neighbours appear most often. Scroll to run it on four tiny words.',
    Visual: BPEVisual,
    steps: [
        {
            title: 'Why not just use letters or words?',
            body: (
                <>
                    <p>
                        Whole words as units give an enormous vocabulary and break on any new word. Single letters
                        never break, but make every sentence very long, and a model must re-learn what{' '}
                        <Code>l-o-w</Code> means each time.
                    </p>
                    <p>
                        <Code>Subword</Code> tokenization sits between. Here is a corpus of four words, with how
                        often each appeared. Dashed boxes are single characters; there are 10 distinct ones.
                    </p>
                </>
            ),
        },
        {
            title: 'Count the neighbours',
            body: (
                <>
                    <p>
                        Look at every pair of adjacent pieces and count how often it occurs, weighting by how many
                        times each word appeared. <Code>e s</Code> occurs 9 times: 6 in <Code>newest</Code> and 3
                        in <Code>widest</Code>.
                    </p>
                    <p>
                        <Code>s t</Code> also scores 9 — a tie. This demo breaks ties alphabetically; real
                        tokenizers pick some fixed rule too, so the same text always gives the same tokens.
                    </p>
                </>
            ),
        },
        {
            title: 'Merge the winner',
            body: (
                <>
                    <p>
                        Glue the most frequent pair into one new piece, <Code>es</Code>, and add it to the
                        vocabulary. The outlined box is the piece just created. Every word containing that pair
                        changes at once.
                    </p>
                    <p>
                        Then count again — the counts have changed, because <Code>es</Code> is now a unit.{' '}
                        <Code>es t</Code> is now the top pair, with 9.
                    </p>
                </>
            ),
        },
        {
            title: 'Repeat, and words start to form',
            body: (
                <>
                    <p>
                        After 4 merges the order was <Code>e+s</Code>, <Code>es+t</Code>, <Code>l+o</Code>,{' '}
                        <Code>lo+w</Code>. The word <Code>low</Code> is now a single token, and{' '}
                        <Code>est</Code> is a reusable ending shared by two different words.
                    </p>
                    <p>
                        Nobody told the algorithm that "est" is a suffix. It simply occurs a lot, so it earned a
                        place in the vocabulary.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: drag the merge count',
            body: (
                <>
                    <p>
                        Move the slider and watch the pieces grow from characters toward whole words. Early merges
                        are cheap, general pieces; later ones only help rare, specific words.
                    </p>
                    <p className="text-text-muted text-sm">
                        These are the real merges computed on this corpus, not a canned animation.
                    </p>
                </>
            ),
        },
        {
            title: 'The finished vocabulary',
            body: (
                <>
                    <p>
                        After 12 merges, every training word is a single token. The vocabulary is the 10 starting
                        characters plus 12 merged pieces: 22 entries. Each entry gets an integer ID, and that ID
                        is what the model actually receives.
                    </p>
                    <p>
                        The number of merges is the one dial you choose. Real tokenizers run tens of thousands of
                        merges over enormous text, not 12 over four words.
                    </p>
                </>
            ),
        },
        {
            title: 'Using it on words it has never seen',
            body: (
                <>
                    <p>
                        To tokenize new text, replay the merges in the same order. <Code>lowest</Code> never
                        appeared in training, yet it becomes <Code>low</Code> + <Code>est</Code>: two pieces the
                        model already knows. <Code>newer</Code> becomes <Code>n</Code> + <Code>ew</Code> +{' '}
                        <Code>er</Code>.
                    </p>
                    <p>
                        That is the point: a small vocabulary that still covers unlimited new words, by
                        falling back to smaller known parts.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        The fallback has limits. <Code>wide</Code> shares no learned merge with this corpus, so it
                        shatters into four characters. Words and languages that were rare in the training text get
                        split into many tokens — which costs more context window and more money per sentence.
                    </p>
                    <p>
                        Production tokenizers usually work on bytes rather than characters, so any text at all can
                        be encoded. Tokenization also explains odd model behaviour: a model that sees{' '}
                        <Code>low</Code> as one unit cannot easily "see" the letters inside it.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                BPE = <strong>start from characters, repeatedly merge the most frequent adjacent pair, and keep
                the merge list</strong>. The list is the tokenizer: replay it to encode any text, and the result
                is a compact, learned vocabulary of reusable pieces.
            </p>
            <p>
                Next, see what happens to those token IDs in <Code>Embeddings</Code> and{' '}
                <Code>Attention</Code>. In Classroom, the transformers-from-scratch track has a lesson on
                tokenization and embeddings. In the Playground, write the merge loop yourself — it is about
                fifteen lines with a <Code>Counter</Code>.
            </p>
        </>
    ),
};
