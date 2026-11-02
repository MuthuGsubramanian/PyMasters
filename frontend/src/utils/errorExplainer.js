// Friendly explanations for Python errors (2026-11-02). Pure + client-side: no AI call, no cost.
// explainError(traceback) -> { type, title, what, fix, line } | null

function lastUserLine(tb) {
    // The learner's code runs as main.py (Playground) or <user> (visualizer); use the deepest frame there.
    const re = /File "(?:[^"]*main\.py|<user>)", line (\d+)/g;
    let m, line = null;
    while ((m = re.exec(tb)) !== null) line = Number(m[1]);
    return line;
}

const RULES = [
    ['IndentationError', () => ({
        title: 'The indentation is off',
        what: 'Python uses indentation (spaces at the start of a line) to group code. A line is indented more or less than Python expects.',
        fix: 'Indent the lines inside if/for/while/def by the same amount (4 spaces is standard), and make sure the line after a ":" is indented.',
    })],
    ['TabError', () => ({
        title: 'Tabs and spaces are mixed',
        what: 'Some lines are indented with tabs and others with spaces, so Python cannot tell which block they belong to.',
        fix: 'Use spaces only (4 per level). Re-indent the highlighted lines.',
    })],
    ['SyntaxError', (msg) => {
        if (/expected ':'/.test(msg)) return {
            title: 'A colon is missing',
            what: 'Lines that start a block (if, for, while, def, class, else, elif, try) must end with ":".',
            fix: 'Add ":" at the end of that line.' };
        if (/was never closed|unexpected EOF|'\(' was never closed/.test(msg)) return {
            title: 'A bracket or quote was never closed',
            what: 'An opening (, [, { or quote has no matching closing one.',
            fix: 'Find the opening bracket or quote on that line and close it.' };
        if (/invalid syntax\. Perhaps you forgot a comma/.test(msg)) return {
            title: 'A comma might be missing',
            what: 'Two values are next to each other without a comma between them.',
            fix: 'Separate the items with commas.' };
        if (/'=' .*'=='|cannot assign to/.test(msg)) return {
            title: 'Assignment used where a comparison was meant',
            what: '"=" stores a value; "==" compares two values.',
            fix: 'Inside if/while conditions, use "==" to compare.' };
        return {
            title: "Python can't read this line",
            what: 'The line breaks Python\'s grammar rules, so the program never started.',
            fix: 'Check that line (and the one before it) for a missing colon, bracket, quote or comma.' };
    }],
    ['NameError', (msg) => {
        const name = (msg.match(/name '([^']+)' is not defined/) || [])[1];
        return {
            title: name ? `"${name}" is not defined` : 'A name is not defined',
            what: `Python reached a name${name ? ` (${name})` : ''} it has never seen: it wasn't created yet, or it's spelled differently.`,
            fix: 'Check the spelling and capitalisation, and make sure the variable is assigned (or the module imported) before this line runs.',
        };
    }],
    ['TypeError', (msg) => {
        if (/unsupported operand type|can only concatenate str|must be str, not/.test(msg)) return {
            title: 'These types can\'t be combined',
            what: `You used an operator on values of incompatible types (${msg.replace(/^.*?: /, '')}). For example, "age: " + 5 mixes text and a number.`,
            fix: 'Convert one side first: str(5) to make text, or int("5") / float("5") to make a number. f-strings also work: f"age: {age}".' };
        if (/not callable/.test(msg)) return {
            title: 'Something that is not a function was called',
            what: 'Parentheses after a name call it, but this name holds a value, not a function. A common cause is reusing a name like list or str as a variable.',
            fix: 'Rename the variable that shadows the function, or remove the extra parentheses.' };
        if (/missing \d+ required positional argument|takes \d+ positional argument/.test(msg)) return {
            title: 'Wrong number of arguments',
            what: `The function was called with a different number of values than it accepts (${msg.replace(/^.*?: /, '')}).`,
            fix: 'Compare the call with the def line and pass exactly the parameters it lists.' };
        if (/not subscriptable/.test(msg)) return {
            title: 'Indexing a value that has no items',
            what: 'Square brackets [ ] read items from lists, strings, dicts... but this value (often None or a number) has none.',
            fix: 'Check what the variable actually holds - print(type(x)) helps. A function that forgets to return gives None.' };
        if (/not iterable/.test(msg)) return {
            title: 'Looping over something that is not a collection',
            what: 'for ... in needs a list, string, range, dict... but got a single value.',
            fix: 'To repeat N times use range(N); otherwise loop over the collection itself.' };
        return { title: 'A value has the wrong type', what: msg, fix: 'Check the types of the values on that line (print(type(x))).' };
    }],
    ['IndexError', () => ({
        title: 'Index out of range',
        what: 'You asked for a position that does not exist. Lists start at 0, so a list of 3 items has indexes 0, 1 and 2.',
        fix: 'Use an index below len(items), or loop with for item in items: instead of counting positions.',
    })],
    ['KeyError', (msg) => ({
        title: `Key ${msg.replace(/^KeyError:\s*/, '') || ''} is not in the dictionary`.trim(),
        what: 'You looked up a key the dictionary does not contain (keys are case-sensitive).',
        fix: 'Check the key spelling, test with if key in d:, or use d.get(key, default).',
    })],
    ['ZeroDivisionError', () => ({
        title: 'Division by zero',
        what: 'A number was divided by 0 (with /, // or %), which has no answer.',
        fix: 'Check the divisor first: if count != 0: avg = total / count.',
    })],
    ['AttributeError', (msg) => {
        const m = msg.match(/'(\w+)' object has no attribute '(\w+)'/);
        return {
            title: m ? `A ${m[1]} has no "${m[2]}"` : 'That attribute does not exist',
            what: m ? `You used .${m[2]} on a value of type ${m[1]}, which does not have it.${m[1] === 'NoneType' ? ' The value is None - often a function that did not return anything.' : ''}`
                : 'You used .something on a value that does not have it.',
            fix: 'Check the spelling and the value\'s type (print(type(x))), or look up the right method name.',
        };
    }],
    ['ValueError', (msg) => /invalid literal for int|could not convert string to float/.test(msg) ? {
        title: 'Text could not be turned into a number',
        what: `int()/float() only work on text that looks like a number (${msg.replace(/^.*?: /, '')}).`,
        fix: 'Strip spaces with .strip(), check the input first, or handle bad input with try/except ValueError.',
    } : { title: 'The value is the right type but not allowed', what: msg, fix: 'Check the value passed on that line.' }],
    ['RecursionError', () => ({
        title: 'The function called itself too many times',
        what: 'A recursive function never reached its stopping case, so the calls piled up.',
        fix: 'Add (or fix) a base case that returns without calling the function again, and make sure each call moves towards it.',
    })],
    ['ModuleNotFoundError', (msg) => ({
        title: `Module ${(msg.match(/'([^']+)'/) || [])[1] || ''} is not available`.trim(),
        what: 'Python could not find that module - the name may be misspelled, or it is not installed here.',
        fix: 'Check the spelling; common ones are numpy, pandas, matplotlib. The Playground lists which packages are available.',
    })],
    ['UnboundLocalError', () => ({
        title: 'A variable was used before being set inside the function',
        what: 'Assigning to a name inside a function makes it local for the whole function, so reading it before that line fails.',
        fix: 'Assign it before use inside the function, or pass the value in as a parameter.',
    })],
    ['timed out', () => ({
        title: 'The program ran too long',
        what: 'It did not finish within the time limit - usually a loop whose condition never becomes false.',
        fix: 'Check that the loop variable changes each time round, or add a break. The Visualize button shows exactly what each step does.',
    })],
];

export function explainError(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.trim().split('\n').filter(Boolean);
    const lastErr = [...lines].reverse().find((l) => /^\w*(Error|Exception)\b|timed out/.test(l.trim())) || '';
    const type = (lastErr.match(/^(\w+(?:Error|Exception))/) || [])[1] || (/timed out/.test(text) ? 'timed out' : null);
    if (!type) return null;
    const rule = RULES.find(([key]) => type === key || (key === 'timed out' && type === 'timed out'));
    const base = rule ? rule[1](lastErr) : { title: type, what: lastErr, fix: 'Read the last line of the error and check the highlighted line.' };
    return { type, line: lastUserLine(text), ...base };
}
