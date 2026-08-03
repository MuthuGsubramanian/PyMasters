import Code from '../Code';
import DBSCANVisual from '../DBSCANVisual';

// Explains essay: DBSCAN clustering (see pages/Explains.jsx for the registry).
export default {
    slug: 'dbscan',
    title: 'DBSCAN Clustering',
    tagline: 'Finding groups that refuse to be round',
    minutes: 6,
    subtitle:
        'K-means finds groups by distance to a centre, which quietly assumes every group is a round blob. Real data is rarely that polite — moons, rings, and streaks show up all the time, along with stray points that don\'t belong to any group. DBSCAN finds clusters by crowding instead: a point belongs if it has enough neighbours nearby. Scroll to watch it grow clusters for real, on a shape k-means cannot handle.',
    Visual: DBSCANVisual,
    steps: [
        {
            title: 'A shape that breaks the centroid idea',
            body: (
                <>
                    <p>
                        Twenty-five points: a crescent, a round blob, and four loners scattered far from both. No
                        labels — figuring out the groups is the whole task.
                    </p>
                    <p>
                        Try to picture k-means here. Any centroid dropped inside the crescent sits closer to points
                        on the far side of the blob than to the crescent's own tips — a curved group has no single
                        centre that's "close" to all of it. Distance-to-a-point breaks down. DBSCAN uses a different
                        idea entirely: crowding.
                    </p>
                </>
            ),
        },
        {
            title: 'The core idea: a crowded neighbourhood',
            body: (
                <>
                    <p>
                        Pick a point and draw a circle of radius <Code>eps</Code> around it. Count how many other
                        points land inside. That's its neighbourhood size — nothing more exotic than that.
                    </p>
                    <p>
                        The highlighted point above has real neighbours inside its circle — computed the same way
                        for every point in this dataset. If that count meets a threshold called{' '}
                        <Code>minPts</Code>, the point is crowded enough to anchor a cluster.
                    </p>
                </>
            ),
        },
        {
            title: 'Core, border, and noise',
            body: (
                <>
                    <p>
                        Every point falls into one of three kinds. A <strong>core</strong> point (filled circle) has
                        at least <Code>minPts</Code> neighbours within eps — it's crowded enough on its own. A{' '}
                        <strong>border</strong> point (open square) isn't crowded itself, but sits inside a core
                        point's circle, so it gets pulled into that cluster anyway. Everything else is{' '}
                        <strong>noise</strong> (a cross) — too far from any crowd to belong anywhere.
                    </p>
                    <p>
                        Notice this classification needed no cluster count, no centroid, no k. It's a purely local
                        question: "how many neighbours do I have?"
                    </p>
                </>
            ),
        },
        {
            title: 'Clusters grow by contagion',
            body: (
                <>
                    <p>
                        Start at one core point and jump to every point in its circle. Any of <em>those</em> that are
                        also core points get their circles searched too, chaining outward — the dashed links trace
                        who pulled whom in. This is why DBSCAN can trace a curve: it never needs a single centre,
                        only an unbroken trail of crowded neighbourhoods.
                    </p>
                    <p>The crescent's tips are border points — not crowded enough to start the chain, but close
                        enough to a core point to ride along at the end.</p>
                </>
            ),
        },
        {
            title: 'A new chain starts where the old one runs dry',
            body: (
                <>
                    <p>
                        Once a chain can't reach any more core points, that cluster is finished. The algorithm moves
                        to the next unvisited point — here, one inside the blob — and if it's core, a second,
                        completely independent chain begins.
                    </p>
                    <p>
                        Two clusters, two separate contagions, discovered without ever being told there would be two
                        of anything.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it yourself',
            body: (
                <>
                    <p>
                        Drag eps and watch the cluster and noise counts respond — these are real re-runs of the
                        algorithm on every move, not a canned animation.
                    </p>
                    <p className="text-text-muted text-sm">
                        Slide it low and the crescent — whose points sit farther apart than the blob's — starves
                        into noise while the tighter blob survives. That gap is the algorithm's central trade-off,
                        coming up next.
                    </p>
                </>
            ),
        },
        {
            title: 'Two clusters, no k required',
            body: (
                <>
                    <p>
                        At a sensible eps, the crescent and the blob each resolve into their own cluster — correctly
                        shaped, correctly separated — and the four loners are correctly left as noise. In
                        scikit-learn this whole essay is <Code>DBSCAN(eps=32, min_samples=3).fit(X)</Code>.
                    </p>
                    <p>
                        Outlier detection came free. K-means must assign every point to some cluster; DBSCAN is
                        allowed to say "this one doesn't belong anywhere" — often exactly what you want for fraud
                        or sensor-glitch detection.
                    </p>
                </>
            ),
        },
        {
            title: 'The catches',
            body: (
                <>
                    <p>
                        eps and minPts aren't free — pick eps too small (as just seen) and sparser clusters vanish
                        into noise while denser ones survive. Pick it too large and separate clusters can fuse into
                        one. In practice you'd scan a <Code>k-distance plot</Code> for a natural "elbow" rather than
                        guess.
                    </p>
                    <p>
                        The deeper limit: DBSCAN uses one global eps, so it struggles when clusters genuinely differ
                        in density, exactly as above. <Code>HDBSCAN</Code> fixes this by letting density thresholds
                        vary per region — worth reaching for when a single eps can't satisfy every cluster at once.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                DBSCAN = <strong>classify points as core, border, or noise by neighbourhood crowding, then grow
                clusters by chaining core points together</strong>. No k to guess, any shape a chain of neighbourhoods
                can trace, and outliers fall out as noise for free — at the cost of tuning eps and minPts instead.
            </p>
            <p>
                The <strong>K-Means</strong> essay called this exact blind spot out by name — go back and reread its
                "catches" step now that you've seen the fix. Then ask Vaathiyaar to run <Code>DBSCAN</Code> on real
                data in the Playground.
            </p>
        </>
    ),
};
