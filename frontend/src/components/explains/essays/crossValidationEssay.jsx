import Code from '../Code';
import CrossValidationVisual from '../CrossValidationVisual';

// Explains essay: Cross-Validation (see pages/Explains.jsx for the registry).
// Sequel to Train/Test Split: one held-out score is a sample of size one;
// k-fold turns it into a measurement with error bars. All fold scores shown
// in the visual are real OLS fits computed at module load.
export default {
    slug: 'cross-validation',
    title: 'Cross-Validation',
    tagline: 'One test score is a coin flip — five are a measurement',
    minutes: 6,
    subtitle:
        'The train/test split keeps a model honest — but the score it gives you depends on which points happened to land in the test set. Get a lucky draw and a mediocre model looks brilliant. Cross-validation fixes this with one move: let every point take a turn being held out. Scroll to watch five real evaluations happen.',
    Visual: CrossValidationVisual,
    steps: [
        {
            title: 'Recap: hold data back to score honestly',
            body: (
                <>
                    <p>
                        From the Train/Test Split essay: never grade a model on data it studied. Here are 20
                        points that follow a real line (plus noise). We hold out the last 20% — the four points
                        inside the outlined band — fit a line to the other 16, and score the held-out four.
                    </p>
                    <p>
                        The verdict: a mean squared error of <Code>4.54</Code>. One honest number.
                        Ship it… right?
                    </p>
                </>
            ),
        },
        {
            title: 'But which 20%?',
            body: (
                <>
                    <p>
                        Nothing says the holdout must be those particular four points. Here are two other
                        perfectly reasonable choices. The top row holds out the second band of points:
                        MSE <Code>0.17</Code>. The bottom row holds out the fourth band: MSE <Code>18.7</Code>.
                    </p>
                    <p>
                        Same data, same model, and the two scores differ by more than <strong>100×</strong> —
                        purely because of which points happened to be quiet and which happened to be noisy.
                        A single split doesn't measure your model; it samples one possible verdict.
                    </p>
                </>
            ),
        },
        {
            title: 'The k-fold idea',
            body: (
                <>
                    <p>
                        Cross-validation's fix is almost embarrassingly simple. Cut the data into{' '}
                        <Code>k</Code> equal <Code>folds</Code> — here k = 5, so five folds of four points,
                        labelled F1 to F5 along the row.
                    </p>
                    <p>
                        No fold is the test set. No fold is safe from being the test set. Every fold is about
                        to get its turn.
                    </p>
                </>
            ),
        },
        {
            title: 'Rotate: every fold takes one turn',
            body: (
                <>
                    <p>
                        Now run the experiment five times, once per row. In each round, one fold goes into the
                        vault as the test set — watch the outlined band step across the rows like a staircase —
                        and the model trains from scratch on the other four folds.
                    </p>
                    <p>
                        By the last row, every single point has been tested on exactly once, and no point was
                        ever tested by a model that trained on it. The train/test discipline survives intact.
                    </p>
                </>
            ),
        },
        {
            title: 'Five real scores',
            body: (
                <>
                    <p>
                        Each round produces its own score — these five numbers are real: a fresh least-squares
                        line fitted on 16 points, scored on the held-out 4, once per row.
                    </p>
                    <p>
                        Instead of one verdict, we now have a <em>distribution</em> of verdicts. And they are
                        not remotely identical.
                    </p>
                </>
            ),
        },
        {
            title: 'Lucky folds, unlucky folds',
            body: (
                <>
                    <p>
                        Look at the spread. F2's four points sit almost exactly on the true line, so testing on
                        them flatters the model: <Code>0.17</Code>. F4 drew the noisiest points in the dataset,
                        so testing on it is brutal: <Code>18.7</Code>.
                    </p>
                    <p>
                        A single split would have reported whichever of these five numbers fate handed you.
                        Cross-validation refuses to let one draw speak for the whole dataset.
                    </p>
                </>
            ),
        },
        {
            title: 'The report: mean ± spread',
            body: (
                <>
                    <p>
                        The deliverable is two numbers: the <Code>mean</Code> of the five scores and their
                        standard deviation — here <Code>5.55 ± 6.73</Code>. The mean is your best estimate of
                        real performance; the ± is an honesty interval that says how much the score wobbles
                        with the choice of holdout.
                    </p>
                    <p>
                        A wide ± is itself a finding: it means your dataset is small or noisy enough that any
                        single test score would have been partly luck. In scikit-learn the whole diagram is one
                        line: <Code>cross_val_score(model, X, y, cv=5)</Code>.
                    </p>
                </>
            ),
        },
        {
            title: 'Step through it yourself',
            body: (
                <>
                    <p>
                        Drive the rotation with the button: each press fits a brand-new line on the other four
                        folds and evaluates the current band, live. After the fifth fold, the mean ± spread
                        appears.
                    </p>
                    <p className="text-text-muted text-sm">
                        Watch for the jump when F4 gets scored — that's the unlucky draw a single split might
                        have handed you as "the" result.
                    </p>
                </>
            ),
        },
        {
            title: 'The price and the fine print',
            body: (
                <>
                    <p>
                        The costs are real. Five folds means five full training runs — with deep networks that
                        can hurt, which is why k = 5 or k = 10 are the standard compromises between cost and a
                        stable estimate. For classification with rare classes, use <Code>stratified</Code>{' '}
                        k-fold so every fold keeps the same class mix.
                    </p>
                    <p>
                        And the classic trap: any preprocessing that learns from data — scaling, imputation,
                        feature selection — must be fitted <em>inside</em> each fold, on that fold's training
                        portion only. Fit your scaler on all 20 points first and the test folds have already
                        leaked into training. scikit-learn's <Code>Pipeline</Code> exists precisely to make
                        this mistake hard.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Cross-validation = <strong>cut the data into k folds, give every fold one turn as the
                held-out test set, and report the mean ± spread of the k real scores</strong>. A single
                train/test split gives you one sample of your model's performance; k-fold gives you a
                measurement with error bars — at the price of k training runs.
            </p>
            <p>
                This essay leans on two others: <strong>Train/Test Split</strong> (why we hold data back at
                all) and <strong>Linear Regression</strong> (the least-squares line being refitted in every
                fold). To feel it in code, open the <strong>Playground</strong> and ask Vaathiyaar to run{' '}
                <Code>cross_val_score</Code> on a small dataset — then shuffle the rows and watch the fold
                scores change while the mean barely moves.
            </p>
        </>
    ),
};
