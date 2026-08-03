import Code from '../Code';
import PCAVisual from '../PCAVisual';

// Explains essay: PCA (see pages/Explains.jsx for the registry). Every number
// quoted below matches what PCAVisual computes from its actual point cloud
// (λ₁ ≈ 9.36, λ₂ ≈ 0.18, PC1 at ≈ 37.6°, variance explained ≈ 98.1%).
export default {
    slug: 'pca',
    title: 'PCA',
    tagline: 'Squeezing many columns into few — without losing the story',
    minutes: 6,
    subtitle:
        'Real datasets have dozens or thousands of columns, and many of them say almost the same thing. Principal Component Analysis finds the few directions that carry most of the information and lets you drop the rest — with a receipt telling you exactly how much you gave up. Scroll to watch sixteen real points lose a dimension and keep 98% of their story.',
    Visual: PCAVisual,
    steps: [
        {
            title: 'Two columns, one story',
            body: (
                <>
                    <p>
                        Each dot is a person: how tall they are (further right = taller) and how much they weigh
                        (higher up = heavier). The cloud isn't a blob — it's a stretched streak, because the two
                        measurements move together with a correlation of about 0.96.
                    </p>
                    <p>
                        That tilt is <em>redundancy</em>. Knowing someone's height already tells you most of their
                        weight. Two columns of numbers, but not really two columns of information — closer to one
                        and a bit. PCA is the tool that makes "one and a bit" precise.
                    </p>
                </>
            ),
        },
        {
            title: 'Which direction matters most?',
            body: (
                <>
                    <p>
                        Suppose you're only allowed to keep <strong>one</strong> number per person. You'd want the
                        single direction along which people differ the most — the axis that spreads the cloud out
                        widest. Keep positions along that axis, and you keep the most <Code>variance</Code>.
                    </p>
                    <p>
                        The dashed lines are candidate axes through the cloud's mean point. Some are clearly bad
                        (the cloud barely spreads along them); one tilt would be just right. Eyeballing it isn't
                        good enough, though — we want the provably best one.
                    </p>
                </>
            ),
        },
        {
            title: 'PC1: the answer has a formula',
            body: (
                <>
                    <p>
                        Here it is. Compute the <Code>covariance matrix</Code> — a 2×2 table saying how each column
                        varies and co-varies — and its top <Code>eigenvector</Code> points exactly along the
                        direction of maximum spread. That's the <strong>first principal component</strong>, PC1,
                        drawn through the mean at θ ≈ 37.6° for this cloud.
                    </p>
                    <p>
                        No search, no gradient descent — linear algebra hands over the optimum directly. In
                        scikit-learn the whole thing is <Code>PCA(n_components=1).fit(X)</Code>.
                    </p>
                </>
            ),
        },
        {
            title: 'Projecting: 2D becomes 1D',
            body: (
                <>
                    <p>
                        Now the compression. Every point drops <em>perpendicularly</em> onto PC1 — those short
                        segments are the drops, and the small markers on the axis are where each person lands.
                        A person's new description is a single number: their position along the line.
                    </p>
                    <p>
                        The drop is each point's <Code>reconstruction error</Code> — the bit of information thrown
                        away. Notice how short the drops are: because the cloud hugs the axis, almost nothing is
                        lost. Sixteen (height, weight) pairs just became sixteen single numbers.
                    </p>
                </>
            ),
        },
        {
            title: 'The receipt: variance explained',
            body: (
                <>
                    <p>
                        PCA doesn't just compress — it tells you the price. The eigenvalue attached to each
                        component is the variance along it. Here PC1 carries λ₁ ≈ 9.36 of the 9.54 total:{' '}
                        <strong>98.1% of the variance kept</strong>, under 2% lost.
                    </p>
                    <p>
                        Compare the naive alternative: just deleting the weight column keeps only 62% of the
                        variance. Rotating to the <em>right</em> axis before
                        dropping a dimension is the whole trick — same storage cost, far less information lost.
                    </p>
                </>
            ),
        },
        {
            title: 'Find PC1 yourself',
            body: (
                <>
                    <p>
                        Drag the slider to rotate a candidate axis through the mean and watch the captured
                        variance respond — it's computed from the real covariance matrix at every angle. Can you
                        find the tilt that maxes it out?
                    </p>
                    <p className="text-text-muted text-sm">
                        Notice the readout is a smooth hill with a single peak — exactly at PC1's angle. At 90° off
                        the peak you'd be capturing the <em>least</em> possible variance instead: that direction is
                        PC2.
                    </p>
                </>
            ),
        },
        {
            title: 'PC2 and the rotated world',
            body: (
                <>
                    <p>
                        The full picture: PCA didn't really delete anything — it <strong>rotated the coordinate
                        system</strong>. PC1 is the long axis of the cloud; PC2, at a right angle to it, is
                        whatever is left — here just 2% of the variance, roughly "heavy or light <em>for your
                        height</em>".
                    </p>
                    <p>
                        In the new coordinates the two columns are uncorrelated, and they arrive ranked by
                        importance. With 100 columns the story is identical: 100 components come out sorted by
                        eigenvalue, and you keep the first few that cover, say, 95% — that's how a 45-dimensional
                        text dataset gets flattened onto your screen in the Embeddings essay.
                    </p>
                </>
            ),
        },
        {
            title: 'Read the fine print',
            body: (
                <>
                    <p>
                        Three honest caveats. PCA is <strong>linear</strong> — it only finds straight axes, so a
                        curved or clustered structure can hide in the "unimportant" components. And direction of
                        variance ≠ direction of <em>importance</em>: the signal that separates your classes can
                        live in a low-variance component that PCA happily throws away.
                    </p>
                    <p>
                        Worst of all: <strong>units change the answer</strong>. Re-measure weight on a ×3 scale —
                        same people, same information — and PC1 swings from ≈ 38° to ≈ 67° (the dashed line).
                        Variance depends on units, so always standardise columns
                        (<Code>StandardScaler</Code>) before <Code>PCA</Code>, unless the columns genuinely share
                        a scale.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                PCA = <strong>rotate to the axes of maximum variance, keep the top few, and get a receipt</strong>{' '}
                (variance explained) for what you dropped. The axes are the covariance matrix's eigenvectors, the
                receipt is its eigenvalues — and the perpendicular drops are exactly what you paid.
            </p>
            <p>
                See it earn its keep in the <strong>Embeddings &amp; Semantic Search</strong> essay, where PCA
                flattens 45-dimensional text vectors onto a 2-D map. Then build one in the{' '}
                <strong>Classroom</strong>'s ML track, or ask Vaathiyaar in the <strong>Playground</strong> to run{' '}
                <Code>PCA().fit(X)</Code> on a real dataset and plot the explained-variance curve.
            </p>
        </>
    ),
};
