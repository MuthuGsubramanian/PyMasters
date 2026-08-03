import Code from '../Code';
import SHAPVisual from '../SHAPVisual';

// Explains essay: SHAP values (see pages/Explains.jsx for the registry).
// Fulfils admin content request 50488d645ae9.
export default {
    slug: 'shap-values',
    title: 'SHAP Values',
    tagline: "Explaining any model's predictions, fairly",
    minutes: 7,
    subtitle:
        'A boosted-tree model prices your house and answers only with a number. SHAP cracks the box open: it splits every single prediction into fair per-feature contributions, using a piece of Nobel-winning game theory. Scroll to watch an exact Shapley computation — every number below is genuinely calculated, nothing is illustrative.',
    Visual: SHAPVisual,
    steps: [
        {
            title: 'The black box answers "6.5"',
            body: (
                <>
                    <p>
                        Here's a small house-price model — think of the XGBoost essay's ensemble, hundreds of
                        little trees voting. Feed it house A (big, recently built, central) and it says{' '}
                        <Code>6.5</Code>. Feed it a different house, a different number.
                    </p>
                    <p>
                        A bank can't tell a customer "the trees said so". We need the number <em>itemised</em>:
                        how much came from size, how much from age, how much from location?
                    </p>
                </>
            ),
        },
        {
            title: 'The naive answer changes with the order',
            body: (
                <>
                    <p>
                        Obvious idea: reveal features one at a time and log how much the expected price moves.
                        Reveal size first and it's worth <Code>+1.20</Code>. Reveal it <em>last</em> — after
                        location is already known — and the very same fact is worth <Code>+1.50</Code>.
                    </p>
                    <p>
                        Neither is wrong; size and location genuinely work together (central big houses sell at a
                        premium). But an explanation that depends on an arbitrary ordering isn't an explanation.
                    </p>
                </>
            ),
        },
        {
            title: "Shapley's fix: average every order",
            body: (
                <>
                    <p>
                        Lloyd Shapley solved exactly this in 1953 — for splitting a team's payout among players.
                        Score each player's marginal contribution in <em>every possible joining order</em>, then
                        average. With 3 features that's all <Code>3! = 6</Code> orders, listed here for size:
                        +1.20 in three of them, +1.50 in the other three.
                    </p>
                    <p>
                        The average, <Code>φ(size) = +1.35</Code>, is the <strong>Shapley value</strong> — the
                        one attribution that provably treats every feature symmetrically.
                    </p>
                </>
            ),
        },
        {
            title: 'Start from the average house',
            body: (
                <>
                    <p>
                        Every SHAP explanation starts at the <Code>base value</Code> — what the model predicts
                        knowing nothing about your house, i.e. its average output over the data: here{' '}
                        <Code>3.61</Code>.
                    </p>
                    <p>
                        Then the features push. Size, the biggest factor for house A, moves the estimate up by
                        its φ of +1.35. The bars you're watching are those pushes, drawn to scale.
                    </p>
                </>
            ),
        },
        {
            title: 'The full waterfall',
            body: (
                <>
                    <p>
                        All three features stacked: size <Code>+1.35</Code>, location <Code>+0.98</Code>, age{' '}
                        <Code>+0.56</Code>. Base 3.61 plus the pushes lands on exactly 6.50 — the model's actual
                        prediction, itemised.
                    </p>
                    <p>
                        That's the <Code>efficiency</Code> property, and it's what separates SHAP from vaguer
                        importance scores: the attributions are <em>guaranteed</em> to add up to the prediction.
                    </p>
                </>
            ),
        },
        {
            title: 'Contributions can be negative',
            body: (
                <>
                    <p>
                        House C is just as big as A — but old and far out. Size still pushes up (+1.16), while
                        location (−0.64) and age (−0.34) drag the estimate <em>below</em> what size promised,
                        down to 3.80.
                    </p>
                    <p>
                        Notice size's credit shrank from +1.35 to +1.16 even though the house is the same size:
                        without the central location, the size-×-location synergy is gone, and SHAP fairly stops
                        paying size for it.
                    </p>
                </>
            ),
        },
        {
            title: 'It always adds up',
            body: (
                <>
                    <p>
                        Back to house A with the receipts printed: <Code>3.61 + 1.35 + 0.98 + 0.56 = 6.50</Code>,
                        to the last decimal. This is the picture to remember — a prediction as a short, honest
                        ledger from "average house" to "this house".
                    </p>
                    <p>
                        In practice you'd render it with <Code>shap.plots.waterfall</Code>, and the beeswarm
                        summary plot is just thousands of these ledgers overlaid.
                    </p>
                </>
            ),
        },
        {
            title: 'Explain a house yourself',
            body: (
                <>
                    <p>
                        Pick a house and read its ledger. B is instructive: every feature works <em>against</em>{' '}
                        it, and the φ values total −1.61 — exactly the gap from the 3.61 base down to its 2.00
                        prediction.
                    </p>
                    <p className="text-text-muted text-sm">
                        These are exact Shapley values — all six orderings enumerated live, missing features
                        averaged over the background houses.
                    </p>
                </>
            ),
        },
        {
            title: 'The fine print',
            body: (
                <>
                    <p>
                        Exact Shapley needs <Code>2ⁿ</Code> coalition evaluations — fine for 3 features,
                        impossible for 300. Real libraries cheat cleverly: <Code>TreeSHAP</Code> computes tree
                        ensembles exactly in polynomial time (why SHAP and XGBoost are best friends), and{' '}
                        <Code>KernelSHAP</Code> samples orderings for everything else.
                    </p>
                    <p>
                        And one honest caveat: SHAP explains what the <em>model</em> used, not what <em>causes</em>{' '}
                        prices. If the model learned a spurious pattern, SHAP will faithfully itemise the
                        spurious pattern.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                SHAP = <strong>each prediction split into per-feature pushes from the base value, averaged over
                every feature ordering</strong> so the credit is fair, with the guarantee that the pushes sum
                exactly to the prediction. Positive φ pushed it up, negative pulled it down — and interactions
                get split evenly between the features involved.
            </p>
            <p>
                See it on a real model: ask Vaathiyaar in the Playground for <Code>shap.TreeExplainer</Code> on
                an <Code>XGBRegressor</Code> — the waterfall from this essay, on your own data. The XGBoost
                essay explains the model being explained.
            </p>
        </>
    ),
};
