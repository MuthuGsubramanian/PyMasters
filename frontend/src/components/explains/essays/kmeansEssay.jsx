import Code from '../Code';
import KMeansVisual from '../KMeansVisual';

// Explains essay: K-Means clustering (see pages/Explains.jsx for the registry).
export default {
    slug: 'k-means',
    title: 'K-Means Clustering',
    tagline: 'Finding groups when nobody gave you labels',
    minutes: 6,
    subtitle:
        'Every model so far had an answer key — labelled apples, known prices. But most of the world\'s data comes with no labels at all. K-means is the classic way to let structure reveal itself: guess some group centres, let the points vote, move the centres, repeat. Scroll to run it — these iterations are computed for real.',
    Visual: KMeansVisual,
    steps: [
        {
            title: 'Data without an answer key',
            body: (
                <>
                    <p>
                        Twenty-four customers, plotted by two behaviours — say, visits per month and average
                        spend. No labels, no categories, nobody telling us what the groups are.
                    </p>
                    <p>
                        Your eye already sees three clumps. That's the entire goal of <Code>clustering</Code>:
                        make the machine see them too. This is <Code>unsupervised</Code> learning — no answer key,
                        the structure must speak for itself.
                    </p>
                </>
            ),
        },
        {
            title: 'Guess k centres',
            body: (
                <>
                    <p>
                        K-means starts with a confession: <em>you</em> must choose <Code>k</Code>, the number of
                        clusters. We'll say k = 3 and drop three centroids (the crosses) at rough starting spots.
                    </p>
                    <p>
                        Note how mediocre the starting positions are — none sits on a clump. That's fine.
                        The algorithm's job is to fix bad guesses.
                    </p>
                </>
            ),
        },
        {
            title: 'Assign: every point picks a side',
            body: (
                <>
                    <p>
                        Step one of the loop: each point joins its <strong>nearest</strong> centroid — plain
                        straight-line distance. The colours are that vote, and with these seed positions some of
                        them are clearly wrong.
                    </p>
                    <p>Don't fix it by hand. Wait for step two.</p>
                </>
            ),
        },
        {
            title: 'Update: centres move to the middle',
            body: (
                <>
                    <p>
                        Step two: each centroid teleports to the <Code>mean</Code> of the points that chose it —
                        literally the "means" in k-means. The dashed trails show the jump.
                    </p>
                    <p>
                        A centroid that captured parts of two clumps gets pulled between them… which changes which
                        points are nearest to it. So we assign again.
                    </p>
                </>
            ),
        },
        {
            title: 'Repeat until nothing moves',
            body: (
                <>
                    <p>
                        Assign → update → assign → update. Each round, borders shift a little less. When an update
                        moves no centroid, the algorithm stops: it has <Code>converged</Code> — and it's
                        guaranteed to, usually within a handful of iterations.
                    </p>
                </>
            ),
        },
        {
            title: 'Run it yourself',
            body: (
                <>
                    <p>
                        Drive the loop with the button: assign, move, re-assign. Watch a badly-placed centroid get
                        rescued in two rounds.
                    </p>
                    <p className="text-text-muted text-sm">
                        These aren't canned animations — the assignments and centroid positions are the real
                        k-means iterations on these points.
                    </p>
                </>
            ),
        },
        {
            title: 'Converged',
            body: (
                <>
                    <p>
                        Three centroids, each parked in the middle of a clump; every point coloured by its nearest
                        centre. In scikit-learn, all of the above is{' '}
                        <Code>KMeans(n_clusters=3).fit(X)</Code>.
                    </p>
                    <p>
                        The centroids themselves are often the deliverable: "our customers fall into three
                        profiles, and here is the average behaviour of each."
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        The honest bit. Choose <Code>k</Code> badly and k-means will happily deliver nonsense —
                        here k = 2 forces two real groups to share a centroid. (The <Code>elbow method</Code> and{' '}
                        <Code>silhouette score</Code> help pick k.)
                    </p>
                    <p>
                        It also assumes round, similar-sized blobs (crescents and rings break it — see{' '}
                        <Code>DBSCAN</Code>), and bad seeds can stick in poor solutions — which is why real
                        implementations default to <Code>k-means++</Code> seeding and multiple restarts.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                K-means = <strong>choose k, then loop: assign each point to its nearest centroid, move each
                centroid to its points' mean, stop when nothing moves</strong>. Fast, simple, everywhere — and
                only as good as your choice of k and its assumption of round blobs.
            </p>
            <p>
                Ask Vaathiyaar to cluster real data in the Playground with <Code>KMeans</Code>, then plot the
                elbow curve to justify k — the two-minute version of a real segmentation project.
            </p>
        </>
    ),
};
