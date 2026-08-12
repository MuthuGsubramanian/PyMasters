import Code from '../Code';
import HierarchicalClusteringVisual from '../HierarchicalClusteringVisual';

// Explains essay: Hierarchical clustering (see pages/Explains.jsx for the registry).
export default {
    slug: 'hierarchical-clustering',
    title: 'Hierarchical Clustering',
    tagline: 'Grouping without ever choosing k',
    minutes: 6,
    subtitle:
        'K-means and DBSCAN both make you commit upfront — pick k, or pick eps. Hierarchical clustering ducks the question: it builds every possible grouping at once, from twelve separate points down to one giant blob, and lets you pick where to stop afterwards. Scroll to watch the merges happen for real.',
    Visual: HierarchicalClusteringVisual,
    steps: [
        {
            title: 'Twelve points, zero decisions made',
            body: (
                <>
                    <p>
                        Twelve customers again, plotted by two behaviours. No labels — same starting point as
                        k-means. But this time we won't ask "how many groups?" before we start.
                    </p>
                    <p>
                        Instead we'll do the simplest possible thing, over and over: find the two things that are
                        currently closest together, and merge them. That's the entire algorithm.
                    </p>
                </>
            ),
        },
        {
            title: 'The rule: merge the closest pair',
            body: (
                <>
                    <p>
                        Measure the distance between every pair of points. Two points down in the bottom cluster
                        turn out to be nearest of all — the dashed line shows exactly how close.
                    </p>
                    <p>
                        Merge them into a single cluster. That's <Code>step one</Code> of{' '}
                        <Code>agglomerative</Code> clustering — "agglomerate" just means "stick together,"
                        starting from the bottom up.
                    </p>
                </>
            ),
        },
        {
            title: 'Merges keep zippering the closest things together',
            body: (
                <>
                    <p>
                        Do it again. And again. The rule never changes: find whichever two clusters — single points
                        or already-merged groups — are nearest, and join them. Below the scatter, a{' '}
                        <Code>dendrogram</Code> starts recording every merge as a bracket, with height standing for
                        the distance at which it happened.
                    </p>
                    <p>
                        Three merges in, and three unrelated pairs have already zippered together — one in each
                        blob, entirely independently.
                    </p>
                </>
            ),
        },
        {
            title: 'Whole blobs consolidate',
            body: (
                <>
                    <p>
                        Keep merging and something satisfying happens: each original blob eventually collapses into
                        one cluster, marker and colour now shared across every point inside it. The three blobs are
                        still separate from each other — nothing has forced them together yet.
                    </p>
                    <p>
                        Notice the bracket heights so far are all small and close together — these merges happened
                        between points that were genuinely near one another.
                    </p>
                </>
            ),
        },
        {
            title: 'Keep going and it all becomes one — but look at the gap',
            body: (
                <>
                    <p>
                        Nothing stops the algorithm at three clusters. Left alone, it keeps merging until every
                        point belongs to one giant cluster at the top of the tree — the <Code>root</Code>. The full
                        dendrogram, bottom to top, is shown here.
                    </p>
                    <p>
                        Look at the shaded band: the merges inside each blob happened at small heights, but joining
                        the blobs to each other required a huge jump. That jump is not a coincidence — it's the
                        dendrogram telling you exactly where the real structure is.
                    </p>
                </>
            ),
        },
        {
            title: 'Cut the tree wherever the gap tells you to',
            body: (
                <>
                    <p>
                        Drag the height slider. At every value, a horizontal cut line slices the dendrogram, and
                        every bracket below the line becomes a finished cluster — brackets above it fade out,
                        un-applied.
                    </p>
                    <p className="text-text-muted text-sm">
                        Slide low and you'll see many small clusters (k is large); slide high and everything
                        collapses toward one. This is real: the same union-find over the same computed merges,
                        re-run on every move.
                    </p>
                </>
            ),
        },
        {
            title: 'Three clean clusters — chosen, not guessed',
            body: (
                <>
                    <p>
                        Cut inside that big gap and you land here: three clusters, each matching a blob exactly. The
                        difference from k-means is what you never had to do — no k typed in advance, no restart if a
                        first guess was bad. In scikit-learn, this whole tree is{' '}
                        <Code>AgglomerativeClustering(n_clusters=3).fit(X)</Code>, or build the tree once with{' '}
                        <Code>scipy.cluster.hierarchy.linkage</Code> and cut it as many times as you like.
                    </p>
                    <p>
                        That reusability is the real selling point: one computation, any number of clusters,
                        decided after you've actually looked at the structure.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches: how you measure "closest cluster" matters',
            body: (
                <>
                    <p>
                        "Merge the closest pair" hides a choice: closest by what? <Code>Single linkage</Code>{' '}
                        (used everywhere above) measures the distance between a cluster's two <em>nearest</em>{' '}
                        members. <Code>Average linkage</Code> measures the mean distance across <em>every</em> pair
                        between the two clusters instead.
                    </p>
                    <p>
                        Run both on the same thirteen points — two blobs joined by three connector points — cut at
                        the identical height, and they disagree: single linkage's one-nearest-neighbour rule lets a
                        connector slip into a blob as soon as it's near just one member, while average linkage holds
                        out until a connector is close to the <em>whole</em> group. Same data, same height,
                        different clusters. Single linkage is also the one prone to chaining long, snake-like
                        clusters through noise — worth remembering before trusting a dendrogram blindly.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Hierarchical clustering = <strong>repeatedly merge the two closest clusters, record every merge and
                its height in a dendrogram, then cut the tree at whatever height makes sense</strong>. No k to
                commit to upfront, and the tree itself — the size of the gaps between merge heights — tells you
                where the real structure is.
            </p>
            <p>
                It's the direct answer to <strong>K-Means</strong>'s "how do I even choose k?" — and worth
                contrasting with <strong>DBSCAN</strong>'s density-based approach, which skips k entirely in a
                different way. Ask Vaathiyaar to plot a real dendrogram with{' '}
                <Code>scipy.cluster.hierarchy</Code> in the Playground next.
            </p>
        </>
    ),
};
