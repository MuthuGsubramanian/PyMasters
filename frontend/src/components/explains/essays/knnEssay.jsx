import Code from '../Code';
import KNNVisual from '../KNNVisual';

// Explains essay: k-Nearest Neighbours (see pages/Explains.jsx for the registry).
export default {
    slug: 'knn',
    title: 'k-Nearest Neighbours',
    tagline: 'No training, no rules — just ask the neighbours',
    minutes: 6,
    subtitle:
        'Most models study their data and distil it into rules or weights. k-nearest neighbours refuses to study at all: it memorises every example, and when a new point arrives it asks the closest few "what are you?" and takes a vote. Scroll to watch the vote — every distance and every verdict here is computed for real.',
    Visual: KNNVisual,
    steps: [
        {
            title: 'The laziest model in ML',
            body: (
                <>
                    <p>
                        Here are twenty labelled examples — two loose clusters, circles on one side, squares on
                        the other, with a messy overlap zone in between. Training a k-NN model on them takes no
                        time at all, because <strong>there is no training</strong>. The model simply stores the
                        points, labels and all.
                    </p>
                    <p>
                        Textbooks call this <Code>lazy learning</Code>: all the work is postponed until a
                        prediction is actually needed. The dataset itself <em>is</em> the model.
                    </p>
                </>
            ),
        },
        {
            title: 'A stranger arrives',
            body: (
                <>
                    <p>
                        Now a new, unlabelled point shows up — the diamond, sitting awkwardly in the overlap
                        zone. Circle or square? k-NN's entire strategy: measure the straight-line{' '}
                        <Code>euclidean distance</Code> from the diamond to <em>every</em> stored point.
                    </p>
                    <p>
                        That's the whole formula: <Code>√((x₁−x₂)² + (y₁−y₂)²)</Code>, twenty times over. No
                        gradients, no splits, no parameters — just a ruler.
                    </p>
                </>
            ),
        },
        {
            title: 'k = 1: trust the closest',
            body: (
                <>
                    <p>
                        The simplest rule sets <Code>k = 1</Code>: whatever the single nearest point is, copy its
                        label. And here that goes wrong immediately — the nearest point is a lone square stranded
                        deep in circle territory, the kind of point that's mislabelled or just a fluke.
                    </p>
                    <p>
                        Verdict: <strong>square</strong>, decided entirely by one suspicious data point. With
                        k = 1, every noisy example owns a little kingdom of wrong answers around itself.
                    </p>
                </>
            ),
        },
        {
            title: 'k = 3: take a vote',
            body: (
                <>
                    <p>
                        Widen the circle to the <em>three</em> nearest and let them vote. The stray square is
                        still in the jury — but now two circles sit beside it, and the verdict flips to{' '}
                        <strong>circle</strong>, 2–1.
                    </p>
                    <p>
                        That's the entire reason k exists: voting is noise-cancelling. One fluke can't outvote
                        the honest neighbours around it.
                    </p>
                </>
            ),
        },
        {
            title: 'k = 7: a steadier jury',
            body: (
                <>
                    <p>
                        At <Code>k = 7</Code> the enclosing circle reaches through the whole local
                        neighbourhood: six circles against the one stray square, 6–1. Same verdict as k = 3, but
                        with a majority so comfortable that no single point could change it.
                    </p>
                    <p>
                        Small practical habit: keep k <em>odd</em> for two-class problems, so the vote can never
                        tie.
                    </p>
                </>
            ),
        },
        {
            title: 'k = 15: too many opinions',
            body: (
                <>
                    <p>
                        So bigger is better? Push to <Code>k = 15</Code> and the enclosing circle swallows most
                        of the plot — including the far cluster, which has nothing to do with the diamond's
                        neighbourhood. Squares outnumber circles in the dataset overall, so the vote comes back{' '}
                        <strong>square</strong>, 8–7.
                    </p>
                    <p>
                        This is the other failure mode: too small a k and noise wins; too large a k and the
                        global majority drowns the local signal. At the extreme, k = all points predicts the most
                        common class every single time.
                    </p>
                </>
            ),
        },
        {
            title: 'The Goldilocks k',
            body: (
                <>
                    <p>
                        So k is a dial between two errors: tiny k listens to flukes (the jittery, overfitting
                        end), huge k listens to everyone (the blurry, underfitting end). Somewhere in the middle
                        — here, around k = 7 — the vote reflects the actual neighbourhood.
                    </p>
                    <p>
                        There's no formula for the right k. In practice you try several values and keep the one
                        that scores best on held-out data — exactly the discipline from the Train/Test Split
                        essay.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag the slider and watch the jury grow. These are the real distances: the verdict flips
                        at both ends — the stray square wins at k = 1, and the far cluster wins at k = 15.
                    </p>
                    <p className="text-text-muted text-sm">
                        (Watch k = 11 closely — the vote narrows to 6–5. One more pair of neighbours and the
                        local cluster starts losing its grip.)
                    </p>
                </>
            ),
        },
        {
            title: 'The fine print',
            body: (
                <>
                    <p>
                        Distance is k-NN's only idea, so anything that distorts distance breaks it. If one
                        feature is measured in thousands (income) and another in tens (age), the plot is
                        effectively stretched along one axis and the "nearest" neighbours are chosen almost
                        entirely by the big-unit feature — so <strong>always standardise features first</strong>.
                        In very high dimensions distance itself goes strange: everything ends up nearly
                        equidistant (the <Code>curse of dimensionality</Code>), and "nearest" stops meaning much.
                    </p>
                    <p>
                        And remember the lazy bargain: training was free, but every prediction measures the
                        entire dataset — slow at scale, and the whole training set must stay in memory forever.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                k-NN = <strong>memorise everything, then let the k closest points vote</strong>. The dial k
                trades noise-sensitivity (small k) against blurred-out local signal (large k), and distance only
                means something if your features share a scale. Don't confuse it with k-means: the shared letter
                is a coincidence — k-NN is <em>supervised</em> (it needs labels to vote with), while k-means is{' '}
                <em>unsupervised</em> (it invents groups where no labels exist). And where the Decision Trees
                essay showed a model that compresses data into printable rules, k-NN never abstracts at all — it
                keeps the raw data and answers from it directly.
            </p>
            <p>
                Feel it in code: open the <strong>Playground</strong> and ask Vaathiyaar for a{' '}
                <Code>KNeighborsClassifier</Code> demo in scikit-learn — then sweep k and watch the accuracy
                curve rise and fall, exactly like this essay.
            </p>
        </>
    ),
};
