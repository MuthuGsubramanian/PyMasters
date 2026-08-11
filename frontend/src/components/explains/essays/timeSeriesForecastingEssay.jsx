import Code from '../Code';
import TimeSeriesForecastingVisual from '../TimeSeriesForecastingVisual';

// Explains essay: Time-Series Forecasting (see pages/Explains.jsx for the registry).
export default {
    slug: 'time-series-forecasting',
    title: 'Time-Series Forecasting',
    tagline: "Why your best guess for tomorrow starts with yesterday, not a fancy model",
    minutes: 7,
    subtitle:
        'A time series has one thing going for it that most datasets don’t: order. Thirty-six months of numbers, a real trend, a real repeating seasonal wobble, and three forecasters — from the almost-embarrassingly simple to the properly decomposed — competing on the same twelve held-out months. Scroll to see who wins, and why the "smarter" one doesn’t always.',
    Visual: TimeSeriesForecastingVisual,
    steps: [
        {
            title: 'A series is not a bag of points',
            body: (
                <>
                    <p>
                        Every dataset in these essays so far could be shuffled without losing anything — a
                        house's price doesn't care which row comes before it. A time series is different: this
                        month's value depends on last month's, and the calendar itself carries information.
                        Shuffle it and the signal disappears.
                    </p>
                    <p>
                        Here are 36 months of a synthetic series — real trend, a real repeating seasonal
                        pattern, real noise, generated once by this page's own arithmetic. Twenty-four months
                        (circle markers) are for learning; the last twelve (square markers) are held back exactly
                        like a <Code>train/test split</Code>, except now the split has to respect time — you
                        can't train on the future and test on the past.
                    </p>
                </>
            ),
        },
        {
            title: "The baseline nobody should lose to by accident: naive",
            body: (
                <>
                    <p>
                        The simplest possible forecast has a name: <Code>naive persistence</Code> — predict
                        that next month equals this month, full stop. No trend, no seasonality, no model at all,
                        just "tomorrow looks like today." The diamond markers show its guess for each of the
                        twelve held-out months, with dashed stems showing how far off each one landed.
                    </p>
                    <p>
                        Averaged over all twelve months, naive is off by <Code>15.13</Code> units. Its worst miss
                        comes right at the start: December's value was a seasonal peak near <Code>182</Code>, so
                        naive guesses January will be similar — but January is seasonally quiet and the real
                        value lands near <Code>135</Code>, a miss of almost <Code>48</Code>. Naive can't see a turn
                        coming; it only ever repeats what just happened.
                    </p>
                </>
            ),
        },
        {
            title: 'The growth underneath',
            body: (
                <>
                    <p>
                        Beneath the monthly swings sits something steadier: this series was built with a genuine
                        upward drift, and a straight line fit to the de-seasonalized data recovers it — a
                        slope of about <Code>2.67</Code> units per month.
                    </p>
                    <p>
                        That's close to, but not exactly, the true generating rate of <Code>2.5</Code> per month
                        baked into this page's data — noise makes even an honest fit slightly wrong. The gap
                        is small and unavoidable; the line still captures the one thing naive persistence
                        completely ignores: the series is going somewhere, not just wobbling in place.
                    </p>
                </>
            ),
        },
        {
            title: 'The wobble has a shape too',
            body: (
                <>
                    <p>
                        The other structure naive ignores is seasonality: some months run reliably above average,
                        some reliably below, and the pattern repeats every twelve months. Averaging each month's
                        ratio to the trend line across both training years gives an estimated{' '}
                        <Code>seasonal index</Code> — bars above the mid-line run high, bars below run low.
                    </p>
                    <p>
                        December comes in near <Code>1.13</Code> — thirteen percent above an average month
                        — while February sits near <Code>0.82</Code>, eighteen percent below. That's not
                        noise; it's the same pattern every single year in this data, which is exactly why it's
                        worth modelling separately from the trend.
                    </p>
                </>
            ),
        },
        {
            title: 'Smoothing trades noise for lag',
            body: (
                <>
                    <p>
                        A <Code>moving average</Code> is the cheapest way to quiet a noisy series: replace each
                        point with the mean of the last <Code>w</Code> months. Drag the window and watch the line
                        settle — by the time <Code>w</Code> reaches 12, a full seasonal cycle is being
                        averaged into every point, and the seasonal wobble almost disappears.
                    </p>
                    <p>
                        That smoothness has a cost: a wide window also lags behind real turning points, since it's
                        still dragging five or six old months along with every new one. Smoothing is a tool for
                        seeing the trend clearly — on its own, it is not a forecast.
                    </p>
                </>
            ),
        },
        {
            title: "The 'more seasonal' baseline — and its own blind spot",
            body: (
                <>
                    <p>
                        <Code>Seasonal naive</Code> sounds like an upgrade: instead of copying last month, copy
                        the same month from a year ago, so this month's seasonal index is at least respected.
                        Diamond markers again show its forecasts against the held-out months.
                    </p>
                    <p>
                        Here's the honest surprise: seasonal naive's average error is <Code>30.45</Code> units
                        — <em>worse</em> than plain naive's <Code>15.13</Code>. Reaching back twelve months
                        means missing an entire year of trend growth (roughly <Code>12 × 2.5 ≈ 30</Code>{' '}
                        units, almost exactly the gap you see) — and in a series that trends this strongly,
                        that miss outweighs getting the season right. Neither simple baseline knows about both
                        trend <em>and</em> season at once.
                    </p>
                </>
            ),
        },
        {
            title: 'Combine both, and the gap collapses',
            body: (
                <>
                    <p>
                        The bar chart lines up all three methods on the same twelve held-out months: naive,
                        seasonal naive, and a <Code>trend + season</Code> forecast that multiplies the fitted
                        trend line by the estimated seasonal index for each month.
                    </p>
                    <p>
                        The combined method's error comes in at well under a fifth of naive's, and roughly a
                        tenth of seasonal naive's — because it's the only one of the three tracking both
                        signals in the data at once instead of picking just one.
                    </p>
                </>
            ),
        },
        {
            title: 'Classical decomposition, and where it leads',
            body: (
                <>
                    <p>
                        What just produced that winning forecast is a two-pass version of classical{' '}
                        <Code>decomposition</Code>: fit a rough trend, use it to estimate a seasonal index, then
                        refit the trend on the de-seasonalized data and multiply the two back together to
                        forecast. It's simple enough to build from the same least-squares formulas as the{' '}
                        <Code>Linear Regression</Code> essay — and it already beats both naive baselines by a
                        wide margin.
                    </p>
                    <p>
                        Production forecasting tools — <Code>ARIMA</Code>, Facebook's <Code>Prophet</Code>,
                        gradient-boosted forecasters — mostly extend this same idea: model trend and
                        seasonality (and sometimes holidays, cycles, or external regressors) explicitly rather
                        than hoping one number captures everything. The lesson underneath all of them is the one
                        this page just demonstrated: a forecast is only as good as the structure it's allowed to
                        see.
                    </p>
                </>
            ),
        },
    ],
    takeaway: (
        <>
            <p>
                Time-series forecasting = <strong>find what's just persistence (naive), what's trend, and what's
                seasonal — model them separately, then recombine</strong>. Always benchmark against naive and
                seasonal-naive first: a more sophisticated model that can't beat them on your data isn't earning
                its complexity.
            </p>
            <p>
                The <Code>Train / Test Split</Code> essay covers why the held-out months can never be touched
                during fitting, and <Code>Linear Regression</Code> covers the least-squares fit this essay reused
                for the trend line. Ask Vaathiyaar in the Playground to run a real <Code>ARIMA</Code> or{' '}
                <Code>Prophet</Code> forecast on a dataset of your choice next.
            </p>
        </>
    ),
};
