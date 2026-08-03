import Code from '../Code';
import NaiveBayesVisual from '../NaiveBayesVisual';

// Explains essay: Naive Bayes, via a spam filter (see pages/Explains.jsx).
// Every number in the visual is really computed from the tiny corpus at load.
export default {
    slug: 'naive-bayes',
    title: 'Naive Bayes',
    tagline: 'The spam filter that counts its way to a verdict',
    minutes: 7,
    subtitle:
        'Before deep learning, before even the word "data science", one algorithm was already quietly reading your email: Naive Bayes. It has no layers, no gradients — just counting, a 260-year-old rule, and one gloriously wrong assumption that works anyway. Scroll to build a real spam filter from twenty emails. (Every probability below is genuinely computed — nothing is faked.)',
    Visual: NaiveBayesVisual,
    steps: [
        {
            title: 'The oldest trick in machine learning',
            body: (
                <>
                    <p>
                        In the late 1990s, inboxes were drowning — and the fix that saved them wasn't clever
                        rules like "block anyone selling watches". It was <strong>counting</strong>. Take emails
                        people already sorted into <Code>spam</Code> and <Code>ham</Code> (the good stuff), and
                        tally how often each word shows up in each pile.
                    </p>
                    <p>
                        Here's our whole training set: 8 spam and 12 ham emails, reduced to word counts. That
                        also gives us the <Code>prior</Code> — before reading a single word, any new email is
                        spam with probability 8/20 = 0.40.
                    </p>
                </>
            ),
        },
        {
            title: 'Bayes’ rule, in plain words',
            body: (
                <>
                    <p>
                        Notice what we can and can't count. We <em>can</em> count "how often does{' '}
                        <Code>free</Code> appear in spam?" — that's <Code>P(words | spam)</Code>. But the
                        question we actually need answered is the reverse: "given these words, is this
                        spam?" — <Code>P(spam | words)</Code>.
                    </p>
                    <p>
                        Bayes' rule is the flip that connects them: the probability of spam given the words is
                        proportional to the probability of the words given spam, times the prior. Score spam
                        and ham with the same formula; whichever is larger wins. Our starting log-odds is
                        ln(0.40/0.60) ≈ −0.41 — a small head start for ham.
                    </p>
                </>
            ),
        },
        {
            title: 'The naive assumption',
            body: (
                <>
                    <p>
                        One problem: <Code>P(words | spam)</Code> for a whole email is unknowable — we'd need to
                        have seen that exact email before. So we cheat, boldly: <strong>pretend every word is
                        independent</strong> of every other. Then the probability of an email is just each
                        word's probability multiplied together — one table lookup per word.
                    </p>
                    <p>
                        That assumption is plainly false ("free" and "winner" travel together in spam), which is
                        why the method is called <em>naive</em>. Each likelihood is smoothed slightly — e.g.{' '}
                        <Code>P(free | spam)</Code> = (14+1)/(46+8) ≈ 0.278 versus barely 0.057 for ham. Hold
                        that "+1" thought; it returns at the end.
                    </p>
                </>
            ),
        },
        {
            title: 'Every word is a weight',
            body: (
                <>
                    <p>
                        Multiplying many small probabilities underflows fast, so we take logarithms and{' '}
                        <em>add</em> instead. Each word's contribution becomes a single number: the log of its
                        spam likelihood over its ham likelihood. For <Code>free</Code> that's
                        ln(0.278/0.057) ≈ +1.59.
                    </p>
                    <p>
                        Now every word in the vocabulary is a signed weight — a bar pushing the verdict one way
                        or the other. <Code>winner</Code> and <Code>click</Code> shove hard toward spam
                        (rightward bars); <Code>lunch</Code> and <Code>meeting</Code> pull just as hard toward
                        ham (leftward). Classifying is now literally addition.
                    </p>
                </>
            ),
        },
        {
            title: 'A spammy message, scored',
            body: (
                <>
                    <p>
                        Let's score <Code>"free winner click urgent"</Code> for real. Start at the prior
                        (−0.41, ham's head start), then let each word push the running total: +1.59, +2.28,
                        +1.77, +0.79. The evidence stacks step by step, like a waterfall, ending far to the
                        spam side.
                    </p>
                    <p>
                        Final log-odds ≈ +6.03, which converts back to <strong>P(spam) ≈ 99.8%</strong>.
                        Four table lookups and five additions — that's the entire classification.
                    </p>
                </>
            ),
        },
        {
            title: 'A clean message, scored',
            body: (
                <>
                    <p>
                        Same machinery, opposite outcome: <Code>"meeting lunch report project"</Code>. Every
                        word here lives in the ham pile, so every bar pushes left, and the total plunges to
                        about −7.43 — <strong>P(spam) ≈ 0.06%</strong>.
                    </p>
                    <p>
                        Notice the model never "understood" either email. It has no idea what a meeting{' '}
                        <em>is</em>. It only knows which pile those words usually come from — and for spam
                        filtering, that's astonishingly close to enough.
                    </p>
                </>
            ),
        },
        {
            title: 'A tug-of-war',
            body: (
                <>
                    <p>
                        The honest test is a message with a foot in both worlds:{' '}
                        <Code>"free click meeting report"</Code>. Two words yank right (+1.59, +1.77), two yank
                        left (−1.89, −1.22). The waterfall zigzags across the 50/50 line as each side lands its
                        punch.
                    </p>
                    <p>
                        The evidence nearly cancels: final log-odds ≈ −0.15, or <strong>P(spam) ≈ 46%</strong>.
                        Ham wins — by a whisker, and only because the prior broke the tie. Real filters treat
                        scores this close as "uncertain" and let them through rather than risk eating your mail.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: pick a message',
            body: (
                <>
                    <p>
                        Press any of the four candidate messages and watch its real evidence stack up. Can you
                        predict the verdict before the bars finish? Note how{' '}
                        <Code>"urgent project report"</Code> lands: <Code>urgent</Code> pushes toward spam, but
                        two office words out-vote it.
                    </p>
                    <p className="text-text-muted text-sm">
                        This is also why spammers started writing "fr3e" and "w1nner" — misspellings dodge the
                        lookup table. The arms race between filters and obfuscation is a whole story of its own.
                    </p>
                </>
            ),
        },
        {
            title: 'The zero-count trap — and why naive works anyway',
            body: (
                <>
                    <p>
                        One landmine: <Code>winner</Code> never appears in our ham pile, so its raw likelihood is
                        0/45 = 0. Multiply by zero and a single word <em>vetoes</em> an entire class — one
                        "winner" in grandma's email and it could never be ham. <Code>Laplace smoothing</Code>{' '}
                        fixes this by pretending we saw every word once in every class: (0+1)/(45+8) ≈ 0.019.
                        Small, but never zero.
                    </p>
                    <p>
                        And the naive assumption? Correlated words ("free" + "winner") get double-counted, so
                        the model is <em>overconfident</em> — that 99.8% deserves a raised eyebrow. But the{' '}
                        <em>ranking</em> of spam over ham usually survives, which is why this humble counter
                        remains a fierce baseline for text classification to this day.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Naive Bayes = <strong>count words per class, smooth the counts, add up each word's
                log-evidence, compare to the prior</strong>. Wrong assumption, right rankings, near-zero
                training cost — and every probability is inspectable, unlike most models. It's the same
                "evidence accumulates" instinct you saw trees formalise in the Decision Trees and XGBoost
                essays, and the same honest-evaluation rules from Train/Test Split apply before you trust
                any accuracy number.
            </p>
            <p>
                Build it in two lines: open the <strong>Playground</strong> and ask Vaathiyaar for{' '}
                <Code>sklearn</Code>'s <Code>MultinomialNB</Code> with a <Code>CountVectorizer</Code> on a few
                sentences — then peek at <Code>feature_log_prob_</Code> to see this essay's word-weights, for
                real. When you're ready for words as <em>meaning</em> rather than counts, the Embeddings essay
                picks up the story.
            </p>
        </>
    ),
};
