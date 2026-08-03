import Code from '../Code';
import EDAVisual from '../EDAVisual';

// Explains essay: Univariate → Bivariate → Multivariate analysis (EDA).
export default {
    slug: 'eda-univariate-bivariate-multivariate',
    title: 'One, Two, Many Variables',
    tagline: 'Univariate, bivariate & multivariate analysis',
    minutes: 6,
    subtitle:
        'Every data project starts the same way: a table too big to eyeball and a deadline. Exploratory data analysis is the discipline of looking before you model — one variable at a time, then pairs, then everything at once. Scroll through the same housing dataset at all three zoom levels.',
    Visual: EDAVisual,
    steps: [
        {
            title: 'A wall of numbers',
            body: (
                <>
                    <p>
                        Meet the dataset: houses, with their <Code>size</Code>, <Code>price</Code>,{' '}
                        <Code>age</Code> and <Code>dist</Code>ance to the city centre. Five hundred rows. Staring
                        at the raw table tells you approximately nothing.
                    </p>
                    <p>
                        The fix is a ritual with a name — <Code>EDA</Code>, exploratory data analysis — and it
                        always climbs the same ladder: one variable, two variables, many.
                    </p>
                </>
            ),
        },
        {
            title: 'Univariate: one column at a time',
            body: (
                <>
                    <p>
                        <strong>Uni</strong> = one. Take a single column — price — and ask only: what values does
                        it take, and how often? The histogram answers at a glance: where the bulk sits, how spread
                        out it is, and that long tail of expensive homes on the right.
                    </p>
                    <p>
                        This is where typos and outliers get caught — the house listed at 100× the median because
                        someone fat-fingered a zero.
                    </p>
                </>
            ),
        },
        {
            title: 'Mean vs median: the skew tell',
            body: (
                <>
                    <p>
                        Drop the two classic summaries onto the histogram and they <em>disagree</em>. The tail of
                        luxury homes drags the <span style={{ color: 'var(--destructive)' }}><strong>mean</strong></span>{' '}
                        to the right; the <span style={{ color: 'var(--accent-primary)' }}><strong>median</strong></span> —
                        the middle house — stays put.
                    </p>
                    <p>
                        Rule of thumb: when a distribution is skewed, report the median. ("Average house price"
                        headlines are usually the mean, quietly inflated by mansions.)
                    </p>
                </>
            ),
        },
        {
            title: 'Bivariate: two at a time',
            body: (
                <>
                    <p>
                        <strong>Bi</strong> = two. Now ask how columns move <em>together</em>: plot size against
                        price and a relationship appears that no histogram could show — bigger houses cost more,
                        with scatter around the trend.
                    </p>
                    <p>
                        The scatter plot is the workhorse of bivariate analysis; for two categorical columns you'd
                        use a cross-tab, for one of each, grouped box plots.
                    </p>
                </>
            ),
        },
        {
            title: 'Putting a number on it',
            body: (
                <>
                    <p>
                        The correlation coefficient <Code>r</Code> compresses the scatter into one number between
                        −1 and +1. Here <Code>r = 0.86</Code>: a strong positive relationship — and exactly the
                        slope-worthiness that the Linear Regression essay turns into a predictive line.
                    </p>
                    <p>
                        Caution: r measures <em>straight-line</em> association only. A perfect U-shape can score
                        r ≈ 0.
                    </p>
                </>
            ),
        },
        {
            title: 'Multivariate: many at once',
            body: (
                <>
                    <p>
                        <strong>Multi</strong> = many. Reality is never two columns. A third variable joins by
                        borrowing a visual channel — here, colour encodes the house's age, and a new fact pops
                        out: at the same size, older homes (orange) sit lower. Age matters <em>after accounting
                        for</em> size.
                    </p>
                    <p>
                        Colour, marker size, small-multiple panels — each channel buys you roughly one more
                        dimension before the plot turns to soup.
                    </p>
                </>
            ),
        },
        {
            title: 'The correlation matrix',
            body: (
                <>
                    <p>
                        To scan <em>every</em> pair at once, compute r for all of them and paint the grid:{' '}
                        <Code>df.corr()</Code> plus a heatmap. Blue = moves together, red = moves opposite, pale =
                        unrelated.
                    </p>
                    <p>
                        One glance now yields hypotheses: price rises with size, falls with distance, drifts down
                        with age. This grid is usually the first slide of any serious data review.
                    </p>
                </>
            ),
        },
        {
            title: 'The trap: hidden groups',
            body: (
                <>
                    <p>
                        A final warning before you trust any pooled number. Split these homes by district and
                        within <em>both</em> downtown and the suburbs, bigger means pricier — yet pooled together
                        the trend points <em>down</em>, because downtown homes are small <em>and</em> expensive.
                    </p>
                    <p>
                        That reversal is <Code>Simpson's paradox</Code>. It's why multivariate analysis isn't
                        optional: a correlation you haven't segmented is a conclusion you haven't earned.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                EDA climbs a ladder: <strong>univariate</strong> (shape, spread, outliers of each column),{' '}
                <strong>bivariate</strong> (scatter plots and correlation between pairs),{' '}
                <strong>multivariate</strong> (colour-coded plots and the correlation heatmap — plus a check for
                lurking groups à la Simpson). Only then do you model.
            </p>
            <p>
                Try it live: ask Vaathiyaar in the Playground to run <Code>df.describe()</Code>,{' '}
                <Code>df.corr()</Code> and a pairplot on a real dataset — the full ladder in four lines of{' '}
                <Code>pandas</Code>.
            </p>
        </>
    ),
};
