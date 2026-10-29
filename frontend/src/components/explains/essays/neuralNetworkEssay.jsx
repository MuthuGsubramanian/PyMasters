import Code from '../Code';
import NeuralNetworkVisual from '../NeuralNetworkVisual';

// Explains essay: neural networks & backpropagation (see pages/Explains.jsx for the registry).
export default {
    slug: 'neural-networks-backprop',
    title: 'Neural Networks & Backpropagation',
    tagline: 'How a handful of tiny functions learn a shape no straight line can',
    minutes: 8,
    subtitle:
        'A neural network is a stack of simple "weigh, add, bend" units. Backpropagation is just the chain rule telling every weight which way to move. Scroll to train a tiny 2-4-1 network on a puzzle that defeats any straight line — every gradient and loss shown is computed for real.',
    Visual: NeuralNetworkVisual,
    steps: [
        {
            title: 'A puzzle with no straight-line answer',
            body: (
                <>
                    <p>
                        Twenty-four points in four clusters. Circles sit in two opposite corners, squares in the
                        other two. This is the classic XOR pattern.
                    </p>
                    <p>
                        Try to draw one straight line with circles on one side and squares on the other. You can't
                        — any line leaves a corner on the wrong side.
                    </p>
                </>
            ),
        },
        {
            title: 'What a straight line manages',
            body: (
                <>
                    <p>
                        We trained logistic regression on these points (same loss, same learning rate, same number
                        of steps). The shaded map shows its belief at every spot: one flat tilt, and it gets
                        exactly 50% right — a coin flip.
                    </p>
                    <p>
                        Training more doesn't help. The model family simply can't express the answer.
                    </p>
                </>
            ),
        },
        {
            title: 'A neuron: weigh, add, bend',
            body: (
                <>
                    <p>
                        A single <Code>neuron</Code> multiplies each input by a weight, adds a bias, then squashes
                        the sum with a bend such as <Code>tanh</Code>. Our network has 4 such hidden neurons, each
                        looking at the point from its own tilted angle, and one output neuron that combines their
                        opinions into a probability.
                    </p>
                    <p>
                        This is epoch 0: weights are small random numbers, so the map is a vague blur and the
                        accuracy is chance (50%).
                    </p>
                </>
            ),
        },
        {
            title: 'Loss: one number for "how wrong"',
            body: (
                <>
                    <p>
                        For each point the network outputs a probability of "square". <Code>Cross-entropy</Code>{' '}
                        punishes confident wrong answers hard and averages over all points. At the start it is
                        0.710, close to ln 2 ≈ 0.693 — what you get by always saying 50/50.
                    </p>
                    <p>
                        Training means making this number small. After 10 epochs it has dipped to about 0.645 and
                        the map has started to bend.
                    </p>
                </>
            ),
        },
        {
            title: 'Backpropagation: blame, passed backwards',
            body: (
                <>
                    <p>
                        How much should each weight change? Start at the output: for sigmoid plus cross-entropy
                        the error is simply <Code>prediction − label</Code>. Multiply by a hidden neuron's output
                        and you get that output weight's gradient.
                    </p>
                    <p>
                        To reach deeper weights, pass the error <em>backwards</em> through each connection and
                        through the tanh's slope — the chain rule, one layer at a time. That's all
                        backpropagation is: reuse each layer's result for the layer before it.
                    </p>
                </>
            ),
        },
        {
            title: 'Step downhill, repeat',
            body: (
                <>
                    <p>
                        Every weight moves a small step against its gradient (<Code>weight −= 0.8 × gradient</Code>
                        ), the loss is recomputed, and the loop repeats. By epoch 30 the loss is 0.322 and all 24
                        points are classified correctly.
                    </p>
                    <p>
                        The hidden neurons have each carved one fold in the map; combined, they wrap the two
                        opposite corners together.
                    </p>
                </>
            ),
        },
        {
            title: 'Scrub through training',
            body: (
                <>
                    <p>
                        Drag the slider to replay training. Points drawn with a red outline are still misclassified
                        at that epoch; they vanish as the map bends around them.
                    </p>
                    <p className="text-text-muted text-sm">
                        Every snapshot is a real set of weights from the run, not an animation.
                    </p>
                </>
            ),
        },
        {
            title: 'After 300 epochs — and the caveats',
            body: (
                <>
                    <p>
                        Final loss: 0.012, with the map hugging each cluster. The solid loss curve falls steadily
                        while the straight line's dashed curve stays near 0.69 forever.
                    </p>
                    <p>
                        Honest caveats: this data is tiny and clean, so the network can memorise it — real work
                        needs a held-out test set (see the Train/Test Split essay). A different random start or
                        learning rate can land in a different fit, and without a bend like <Code>tanh</Code> between
                        layers, stacking layers would collapse back into one straight line.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A neural network = <strong>layers of weigh-add-bend units, trained by computing the loss, sending
                blame backwards with the chain rule (backpropagation), and nudging every weight downhill</strong>.
                The bends are what let it learn shapes a straight line cannot.
            </p>
            <p>
                Revisit <Code>Gradient Descent</Code> for the stepping rule, <Code>Logistic Regression</Code> for
                the single-neuron case, and <Code>Regularization</Code> for taming overfitting. Then rebuild this
                network in NumPy in the Playground.
            </p>
        </>
    ),
};
