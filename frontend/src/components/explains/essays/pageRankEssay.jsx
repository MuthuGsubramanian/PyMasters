import Code from '../Code';
import PageRankVisual from '../PageRankVisual';

// Explains essay: PageRank & the random surfer (see pages/Explains.jsx for the
// registry). A five-page web; every rank quoted below is computed in
// PageRankVisual.jsx by plain power iteration.
export default {
    slug: 'pagerank',
    title: 'PageRank',
    tagline: 'Ranking pages by who links to them, with a random surfer',
    minutes: 7,
    subtitle:
        'Before Google could rank the web, it needed a way to say which pages matter without reading them. The answer: a page matters if pages that matter link to it. That sounds circular — and the way out of the circle is a lovely little loop of arithmetic. Scroll to run it.',
    Visual: PageRankVisual,
    steps: [
        {
            title: 'A tiny web',
            body: (
                <>
                    <p>
                        Here are five pages, A to E. An arrow from one page to another means "the first page
                        links to the second". A links to B and C, B links to C, C links back to A, and D and E
                        link to each other and both link to C.
                    </p>
                    <p>
                        Nobody has told us what any page says. All we have is the pattern of arrows — and the
                        question is whether that pattern alone can tell us which page is most important.
                    </p>
                </>
            ),
        },
        {
            title: 'The random surfer',
            body: (
                <>
                    <p>
                        Imagine someone clicking links forever, with no goal. On each page they pick one of its
                        outgoing links at random. From A that is ½ for B and ½ for C. From B there is only one
                        link, so C gets probability 1.
                    </p>
                    <p>
                        Pages that the surfer lands on often are, in a fair sense, pages the web "points at"
                        often. <Code>PageRank</Code> is just the long-run share of time the surfer spends on
                        each page.
                    </p>
                </>
            ),
        },
        {
            title: 'Start everyone equal',
            body: (
                <>
                    <p>
                        We could simulate a surfer, but there is a neater way. Give every page the same starting
                        rank: 1 ÷ 5 = <Code>0.200</Code>. Think of rank as a pot of sand on each page.
                    </p>
                    <p>
                        The rule for one round: every page splits its sand evenly among the pages it links to
                        and sends it along the arrows. Then every page adds up whatever arrived. That is all
                        the algorithm is.
                    </p>
                </>
            ),
        },
        {
            title: 'One round',
            body: (
                <>
                    <p>
                        After one round: A holds <Code>0.200</Code> (all of C's sand), B holds{' '}
                        <Code>0.100</Code> (half of A's), and C holds <Code>0.500</Code> — it received half of
                        A's, all of B's, and half each of D's and E's. D and E hold <Code>0.100</Code> each.
                    </p>
                    <p>
                        The total is still 1.000; sand moved but none was created or lost. Circle size now shows
                        who is winning: C, fed by four different pages.
                    </p>
                </>
            ),
        },
        {
            title: 'A problem: rank drains away',
            body: (
                <>
                    <p>
                        Keep going and the numbers settle — but look where. After 20 rounds A and C each hold
                        about <Code>0.400</Code>, B holds <Code>0.200</Code>, and D and E hold essentially{' '}
                        <Code>0.000</Code>.
                    </p>
                    <p>
                        Why? D and E only receive from each other, yet each sends half of its sand off to C every
                        round. Their combined rank halves each time: 0.4, 0.2, 0.1, 0.05… A page that few link
                        to is not just ranked low, it is erased — and that is too harsh.
                    </p>
                </>
            ),
        },
        {
            title: 'The fix: teleporting',
            body: (
                <>
                    <p>
                        Real surfers get bored and type a new address. Model that: with probability{' '}
                        <Code>d = 0.85</Code> follow a link, with probability 0.15 jump to a page chosen
                        uniformly from all five. In sand terms, every page receives 0.15 ÷ 5 = 0.030 for free,
                        every round, and passes on only 85% of what it holds.
                    </p>
                    <p>
                        Round 1 now gives C <Code>0.455</Code> and D and E <Code>0.115</Code> each. No page can
                        reach zero, because the free share keeps refilling it. The number d is the{' '}
                        <em>damping factor</em>; 0.85 is the value from the original paper.
                    </p>
                </>
            ),
        },
        {
            title: 'It settles',
            body: (
                <>
                    <p>
                        Repeat until the numbers stop moving. After about 20 rounds the total change per round
                        is below 0.0001, and the ranks are C <Code>0.372</Code>, A <Code>0.346</Code>, B{' '}
                        <Code>0.177</Code>, and D and E <Code>0.052</Code> each. The circle sizes you see are
                        these numbers.
                    </p>
                    <p>
                        This is <em>power iteration</em>: apply the same rule over and over and the answer
                        converges to the one distribution that the rule leaves unchanged. That fixed point is
                        the PageRank, and it does not depend on where you started.
                    </p>
                </>
            ),
        },
        {
            title: 'Try it: slide the damping',
            body: (
                <>
                    <p>
                        Drag the slider. At <Code>d = 0</Code> the surfer always teleports, links are ignored,
                        and every page is <Code>0.200</Code>. At <Code>d = 0.5</Code> D and E rise to{' '}
                        <Code>0.133</Code>; at <Code>0.7</Code> they are <Code>0.092</Code>. As d approaches 1
                        they sink towards the zero of the drain problem.
                    </p>
                    <p className="text-text-muted text-sm">
                        Damping is a dial between "trust the links completely" and "ignore them completely".
                        Higher d means the link structure matters more, but convergence also takes more rounds.
                    </p>
                </>
            ),
        },
        {
            title: 'The fine print',
            body: (
                <>
                    <p>
                        PageRank measures popularity in a link graph, not quality or truth. A page can be
                        well-linked because it is good — or because someone built many pages pointing at it,
                        which is why modern search treats link spam carefully and blends many other signals.
                    </p>
                    <p>
                        Two honest notes. Pages with no outgoing links (dead ends) need a rule too; the usual
                        one is to treat them as linking to every page. And this five-page toy is solved by
                        simple loops; at web scale the same idea is run with sparse matrices on clusters. The
                        ideas also appear far from search: ranking papers by citations, accounts in a social
                        graph, or states in a Markov chain.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                PageRank = <strong>start with equal rank, repeatedly pass each page's rank along its links
                (keeping a small teleport share for everyone), and the numbers converge to the long-run share
                of time a random surfer spends on each page</strong>. In our web that put C first at 0.372
                and kept D and E alive at 0.052.
            </p>
            <p>
                It connects to <strong>Gradient Descent</strong> (another "repeat a small rule until it
                stops changing" method) and <strong>Bayesian Inference</strong> (updating beliefs round by
                round). In the <strong>Playground</strong>, store the links as a dict of lists, loop the
                update rule 30 times with plain Python, and compare your ranks with the ones above.
            </p>
        </>
    ),
};
