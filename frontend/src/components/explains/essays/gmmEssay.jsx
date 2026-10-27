import Code from '../Code';
import GMMVisual from '../GMMVisual';

// Explains essay: Gaussian Mixture Models & EM (see pages/Explains.jsx for the registry).
export default {
    slug: 'gaussian-mixture-models',
    title: 'Gaussian Mixture Models',
    tagline: 'Clustering where every point gets a probability, not a verdict',
    minutes: 7,
    subtitle:
        'K-means makes hard calls: each point belongs to exactly one group. Real groups overlap, stretch and tilt. A Gaussian mixture models each group as a bell-shaped cloud and lets every point belong to all of them — a little or a lot. Scroll to watch the Expectation–Maximisation loop fit two clouds; every number is computed for real.',
    Visual: GMMVisual,
    steps: [
        {
            title: 'Overlapping groups, no labels',
            body: (
                <>
                    <p>
                        Thirty-two points, two hidden groups. The upper-left group is wide and tilted; the
                        lower-right one is tighter. A few points sit in the gap between them, and nobody tells us
                        which group they came from.
                    </p>
                    <p>
                        K-means would draw a straight boundary and call it a day. But for a point in the gap,
                        "which side?" is the wrong question — "how likely is each side?" is the honest one.
                    </p>
                </>
            ),
        },
        {
            title: 'Each group is a bell-shaped cloud',
            body: (
                <>
                    <p>
                        A <Code>Gaussian mixture</Code> says: the data was produced by a few Gaussian (bell-curve)
                        clouds, each with a centre <Code>mean</Code>, a shape <Code>covariance</Code> (how wide, how
                        tilted), and a weight <Code>π</Code> (how big a share of the data it explains).
                    </p>
                    <p>
                        The ellipses mark roughly where each cloud keeps 95% of its points. Our two start as
                        identical round guesses, deliberately poor. The cross-shaped marks are the means; circles
                        and squares tell the two clouds apart.
                    </p>
                </>
            ),
        },
        {
            title: 'E-step: soft membership',
            body: (
                <>
                    <p>
                        The <strong>Expectation</strong> step asks, for each point: given the current clouds, how
                        probable is it that cloud 1 produced this point versus cloud 2? Those fractions are called{' '}
                        <Code>responsibilities</Code> and always sum to 1.
                    </p>
                    <p>
                        The markers now blend: a point fully claimed by one cloud looks solid, a point shared
                        between clouds shows a mix. The marker shape still follows whichever cloud claims the
                        larger share.
                    </p>
                </>
            ),
        },
        {
            title: 'M-step: refit using the shares',
            body: (
                <>
                    <p>
                        The <strong>Maximisation</strong> step refits each cloud as if the responsibilities were
                        true: the new mean is a <em>weighted</em> average of all points (heavy for points the cloud
                        owns, near-zero for others), and the new covariance is the weighted spread around it.
                    </p>
                    <p>
                        Watch the ellipses slide towards their groups and the upper-left one stretch and tilt to
                        match the real shape. K-means can never do that — its clusters are always round.
                    </p>
                </>
            ),
        },
        {
            title: 'Alternate: E, M, E, M…',
            body: (
                <>
                    <p>
                        Better clouds give better responsibilities; better responsibilities give better clouds.
                        By the fourth round the picture barely changes. This chicken-and-egg loop is the{' '}
                        <Code>EM algorithm</Code>.
                    </p>
                    <p>
                        K-means is secretly the same loop with two simplifications: round clouds, and
                        responsibilities rounded to 0 or 1.
                    </p>
                </>
            ),
        },
        {
            title: 'Run it yourself',
            body: (
                <>
                    <p>
                        Press the button to run one full EM round at a time. The readout shows the{' '}
                        <Code>log-likelihood</Code>: how plausible the data is under the current clouds.
                    </p>
                    <p className="text-text-muted text-sm">
                        It starts at −350.0 and climbs to −299.5 here. These are the real EM updates on these
                        32 points, not a canned animation.
                    </p>
                </>
            ),
        },
        {
            title: 'Converged — and not everything is certain',
            body: (
                <>
                    <p>
                        Two ellipses hugging two groups, with weights of about 50% each (16 points apiece). Most
                        points are claimed by one cloud with near-100% confidence — but one point in the gap is
                        about 89% cloud 2 and 11% cloud 1, and the soft markers show it.
                    </p>
                    <p>
                        In scikit-learn: <Code>GaussianMixture(n_components=2).fit(X)</Code>, then{' '}
                        <Code>predict_proba(X)</Code> returns exactly these shares.
                    </p>
                </>
            ),
        },
        {
            title: 'Why it stops, and the catches',
            body: (
                <>
                    <p>
                        Each EM round can only raise the log-likelihood or leave it unchanged — that's the
                        guarantee, and why the curve here climbs and flattens. The guarantee is only for a{' '}
                        <em>local</em> peak though: bad starting clouds can land on a worse fit, so use several
                        restarts (<Code>n_init</Code>).
                    </p>
                    <p>
                        You still choose the number of components; compare <Code>BIC</Code> across values to
                        avoid over-fitting. And the model assumes bell-shaped clouds — crescents and rings need
                        something like DBSCAN.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                A Gaussian mixture = <strong>a few bell-shaped clouds, each with a mean, a shape and a weight,
                fitted by alternating soft assignment (E) and weighted refitting (M)</strong>. It gives you
                probabilities, not verdicts, and handles stretched, tilted groups that k-means cannot.
            </p>
            <p>
                Compare it with the <Code>K-Means</Code> essay, check how it handles outliers in{' '}
                <Code>Anomaly Detection</Code> (low likelihood = suspicious), then try{' '}
                <Code>GaussianMixture</Code> on your own data in the Playground and pick components with BIC.
            </p>
        </>
    ),
};
