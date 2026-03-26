import { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const ILLUSTRATION_MAP = {
  postman_street: '\u{1F3D8}\uFE0F',
  warehouse_boxes: '\u{1F4E6}',
  traffic_signal: '\u{1F6A6}',
  train_compartments: '\u{1F682}',
  counting_fingers: '\u{1F590}\uFE0F',
};

export default function StoryCard({ content = '', illustration = '', duration = 3000, onComplete }) {
  const cardRef = useRef(null);
  const textRef = useRef(null);
  const emojiRef = useRef(null);
  const [displayed, setDisplayed] = useState('');

  // Stabilize props to prevent re-render loops
  const stableContent = useMemo(() => content, [JSON.stringify(content)]);

  // Ref for onComplete to avoid it being a useEffect dependency
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const emoji = ILLUSTRATION_MAP[illustration] || '\u{1F4D6}';

  // Markdown components for structured story rendering
  const storyMarkdownComponents = {
    h2: ({children}) => (
        <h2 className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-purple-200">
            {children}
        </h2>
    ),
    h3: ({children}) => (
        <h3 className="text-base font-bold text-purple-700 mt-3 mb-1.5">
            {children}
        </h3>
    ),
    p: ({children}) => (
        <p className="text-sm text-slate-700 mb-2 leading-relaxed">{children}</p>
    ),
    ul: ({children}) => (
        <ul className="list-disc list-inside text-sm text-slate-700 mb-2 space-y-1 pl-2">
            {children}
        </ul>
    ),
    ol: ({children}) => (
        <ol className="list-decimal list-inside text-sm text-slate-700 mb-2 space-y-1 pl-2">
            {children}
        </ol>
    ),
    li: ({children}) => (
        <li className="text-sm text-slate-700 leading-relaxed">{children}</li>
    ),
    table: ({children}) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-slate-200">
            <table className="text-sm w-full">{children}</table>
        </div>
    ),
    thead: ({children}) => <thead className="bg-purple-50">{children}</thead>,
    tbody: ({children}) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
    tr: ({children}) => <tr className="hover:bg-slate-50 transition-colors">{children}</tr>,
    th: ({children}) => (
        <th className="px-3 py-2 text-left text-xs font-bold text-purple-700 uppercase tracking-wider">
            {children}
        </th>
    ),
    td: ({children}) => (
        <td className="px-3 py-2 text-sm text-slate-700">{children}</td>
    ),
    code: ({inline, children}) => inline
        ? <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
        : <pre className="bg-slate-800 text-slate-200 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2"><code>{children}</code></pre>,
    strong: ({children}) => <strong className="font-bold text-slate-900">{children}</strong>,
    blockquote: ({children}) => (
        <div className="my-3 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
            <div className="text-sm text-amber-800">{children}</div>
        </div>
    ),
  };

  useEffect(() => {
    if (!cardRef.current) return;

    const tl = gsap.timeline({
      onComplete: () => {
        onCompleteRef.current?.();
      },
    });

    // Card springs in with glow
    tl.fromTo(
      cardRef.current,
      { opacity: 0, y: 40, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }
    );

    // Start glow effect
    tl.to(
      cardRef.current,
      {
        boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), 0 0 60px rgba(168, 85, 247, 0.1)',
        duration: 0.5,
        ease: 'power2.out',
      },
      0.3
    );

    // Smoother typewriter
    const chars = stableContent.split('');
    const charDuration = Math.max((duration / 1000 - 0.6) / Math.max(chars.length, 1), 0.015);

    let current = '';
    tl.to(
      {},
      {
        duration: chars.length * charDuration,
        ease: 'none',
        onUpdate: function () {
          const progress = this.progress();
          const charIndex = Math.floor(progress * chars.length);
          current = chars.slice(0, charIndex).join('');
          setDisplayed(current);
        },
        onComplete: () => {
          setDisplayed(stableContent);
          // Fade out glow when story complete
          gsap.to(cardRef.current, {
            boxShadow: '0 0 0px rgba(168, 85, 247, 0)',
            duration: 1,
            ease: 'power2.out',
          });
        },
      }
    );

    // Hold so users can see the result before completing
    tl.to({}, { duration: 2 });

    // Bounce the emoji
    if (emojiRef.current) {
      gsap.to(emojiRef.current, {
        y: -6,
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }

    return () => {
      tl.kill();
    };
  }, [stableContent, duration]);

  return (
    <div
      ref={cardRef}
      className="panel rounded-2xl p-6 border-l-4 border-purple-400 opacity-0 max-w-2xl transition-shadow"
    >
      <div className="flex items-start gap-4">
        {/* Vaathiyaar avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-purple-300/30">
          {'\u{1F9D1}\u200D\u{1F3EB}'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-500 uppercase tracking-widest">
              Vaathiyaar
            </span>
            <span ref={emojiRef} className="text-4xl">{emoji}</span>
          </div>

          <div ref={textRef} className="text-slate-700 text-sm leading-relaxed min-h-[3rem]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={storyMarkdownComponents}>
              {displayed}
            </ReactMarkdown>
            <span className="inline-block w-0.5 h-4 bg-purple-500 ml-0.5 animate-pulse align-middle" />
          </div>
        </div>
      </div>
    </div>
  );
}
