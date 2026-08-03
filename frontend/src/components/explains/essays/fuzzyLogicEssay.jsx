import Code from '../Code';
import FuzzyLogicVisual from '../FuzzyLogicVisual';

// Explains essay: Fuzzy Logic (see pages/Explains.jsx for the registry).
export default {
    slug: 'fuzzy-logic',
    title: 'Fuzzy Logic',
    tagline: 'Reasoning in shades of grey',
    minutes: 6,
    subtitle:
        'Classical logic insists every statement is true or false. But is 29.9°C "hot"? Sort of. Fuzzy logic makes "sort of" mathematically precise — and it quietly runs your rice cooker, your camera\'s autofocus, and your car\'s brakes. Scroll to build a fuzzy controller from scratch.',
    Visual: FuzzyLogicVisual,
    steps: [
        {
            title: 'The world according to Boolean',
            body: (
                <>
                    <p>
                        Classical (crisp) logic sorts everything into two bins. Define "hot" as{' '}
                        <Code>temp ≥ 30</Code> and membership in the set of hot things is a step function: you're
                        in, or you're out. Zero or one, nothing between.
                    </p>
                    <p>Computers love this. Reality… doesn't.</p>
                </>
            ),
        },
        {
            title: 'The 0.2° absurdity',
            body: (
                <>
                    <p>
                        Under the crisp rule, 29.9° is <em>not hot</em> — full stop — while 30.1° is{' '}
                        <em>completely hot</em>. A fifth of a degree flips the universe.
                    </p>
                    <p>
                        Any thermostat built this way slams between states at the boundary. Humans never talk like
                        this: we say "warmish", "pretty hot", "borderline". Language already knows what the maths
                        is missing.
                    </p>
                </>
            ),
        },
        {
            title: 'Membership is a dial, not a switch',
            body: (
                <>
                    <p>
                        Fuzzy logic's move (Lotfi Zadeh, 1965): let membership be <em>any</em> value between 0 and
                        1. The step becomes a ramp. At 29°, membership in "hot" is <Code>μ = 0.50</Code> — half
                        hot, genuinely.
                    </p>
                    <p>
                        A <Code>fuzzy set</Code> is exactly this: a set you can partially belong to, defined by
                        its membership function.
                    </p>
                </>
            ),
        },
        {
            title: 'Overlapping truths',
            body: (
                <>
                    <p>
                        Real systems define several overlapping sets. At 26°, this room is{' '}
                        <span style={{ color: '#f59e0b' }}><strong>warm to degree 0.5</strong></span>{' '}
                        <em>and</em>{' '}
                        <span style={{ color: 'var(--destructive)' }}><strong>hot to degree 0.2</strong></span>{' '}
                        — both at once, no contradiction.
                    </p>
                    <p>
                        Important: these are <em>not</em> probabilities. It isn't "20% chance the room is hot" —
                        the temperature is known exactly. It's <em>partial truth</em> of a vague word.
                    </p>
                </>
            ),
        },
        {
            title: 'Rules that fire partially',
            body: (
                <>
                    <p>
                        Now write control rules the way a human would: <Code>IF cold → fan slow</Code>,{' '}
                        <Code>IF warm → fan medium</Code>, <Code>IF hot → fan fast</Code>.
                    </p>
                    <p>
                        In crisp logic exactly one rule would fire. In fuzzy logic <strong>every rule fires to
                        the degree its condition is true</strong> — the bars show each rule's strength at the
                        current temperature. At 26°, "warm" argues at 50% volume and "hot" at 20%.
                    </p>
                </>
            ),
        },
        {
            title: 'Blend to one decision',
            body: (
                <>
                    <p>
                        The fan needs a single number, so the firing rules are blended —{' '}
                        <Code>defuzzification</Code>. The simplest recipe is a weighted average: each rule's
                        output speed, weighted by how strongly it fired.
                    </p>
                    <p>
                        At 26° that lands near 58% — a smooth, sensible in-between no crisp rule could produce.
                    </p>
                </>
            ),
        },
        {
            title: 'Drive it yourself',
            body: (
                <>
                    <p>
                        Slide the temperature from 0° to 45° and watch the whole pipeline react: memberships
                        rise and fall, rules trade dominance, and the fan speed glides — no jumps, no thresholds
                        slamming.
                    </p>
                    <p className="text-text-muted text-sm">
                        Find the crossover: around 22–27° control passes gradually from "warm" to "hot". A crisp
                        controller would have one cliff there instead.
                    </p>
                </>
            ),
        },
        {
            title: 'Where fuzzy lives',
            body: (
                <>
                    <p>
                        This exact pattern — fuzzify inputs, fire weighted rules, defuzzify — ships in rice
                        cookers, washing machines, camera autofocus, anti-lock brakes and HVAC systems. It shines
                        when you have <em>expert intuition in words</em> but no precise model of the physics.
                    </p>
                    <p>
                        Its limits are honest too: membership curves are hand-designed, not learned. When you have
                        lots of data and no expert rules, the learning methods elsewhere in these essays usually
                        win.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Fuzzy logic = <strong>truth on a dial</strong>: membership functions turn vague words into
                numbers in [0, 1], IF-THEN rules fire in proportion to those numbers, and defuzzification blends
                them into one smooth action. Not probability — partial truth.
            </p>
            <p>
                Want to build one? Ask Vaathiyaar in the Playground for a fuzzy thermostat with{' '}
                <Code>scikit-fuzzy</Code> — the essay's fan controller in ~20 lines of Python.
            </p>
        </>
    ),
};
