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
  robot: '\u{1F916}',
  brain: '\u{1F9E0}',
  rocket: '\u{1F680}',
  magic: '\u{2728}',
  puzzle: '\u{1F9E9}',
  lightbulb: '\u{1F4A1}',
  microscope: '\u{1F52C}',
};

export default function StoryCard({ content = '', illustration = '', duration = 3000, onComplete }) {
  const cardRef = useRef(null);
  const textRef = useRef(null);
  const emojiRef = useRef(null);
  const glowRef = useRef(null);
  const [displayed, setDisplayed] = useState('');

  const stableContent = useMemo(() => content, [JSON.stringify(content)]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const emoji = ILLUSTRATION_MAP[illustration] || '\u{1F4D6}';

  const storyMarkdownComponents = {
    h2: ({children}) => (
        <h2 className="text-lg font-bold text-slate-100 mt-4 mb-2 pb-1 border-b border-purple-500/20">
            {children}
        </h2>
    ),
    h3: ({children}) => (
        <h3 className="text-base font-bold text-purple-300 mt-3 mb-1.5">
            {children}
        </h3>
    ),
    p: ({children}) => (
        <p className="text-sm text-slate-300 mb-2 leading-relaxed">{children}</p>
    ),
    ul: ({children}) => (
        <ul className="list-disc list-inside text-sm text-slate-300 mb-2 space-y-1 pl-2">
            {children}
        </ul>
    ),
    ol: ({children}) => (
        <ol className="list-decimal list-inside text-sm text-slate-300 mb-2 space-y-1 pl-2">
            {children}
        </ol>
    ),
    li: ({children}) => (
        <li className="text-sm text-slate-300 leading-relaxed">{children}</li>
    ),
    table: ({children}) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-white/[0.06]">
            <table className="text-sm w-full">{children}</table>
        </div>
    ),
    thead: ({children}) => <thead className="bg-purple-500/10">{children}</thead>,
    tbody: ({children}) => <tbody className="divide-y divide-white/[0.04]">{children}</tbody>,
    tr: ({children}) => <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>,
    th: ({children}) => (
        <th className="px-3 py-2 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">
            {children}
        </th>
    ),
    td: ({children}) => (
        <td className="px-3 py-2 text-sm text-slate-300">{children}</td>
    ),
    code: ({children, className}) => className
        ? <pre className="bg-[#0d1117] text-slate-300 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-white/[0.06]"><code>{children}</code></pre>
        : <code className="bg-purple-500/15 text-purple-200 px-1.5 py-0.5 rounded text-xs font-mono border border-purple-500/20">{children}</code>,
    strong: ({children}) => <strong className="font-bold text-slate-100">{children}</strong>,
    blockquote: ({children}) => (
        <div className="my-3 p-3 bg-amber-500/10 border-l-4 border-amber-400/50 rounded-r-lg">
            <div className="text-sm text-amber-200">{children}</div>
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

    // Card springs in with cinematic entrance
    tl.fromTo(cardRef.current,
      { opacity: 0, y: 40, scale: 0.92, rotateX: 5 },
      { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.7, ease: 'power3.out' }
    );

    // Glow pulse
    if (glowRef.current) {
      tl.fromTo(glowRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, ease: 'power2.out' },
        0.3
      );
    }

    // Typewriter effect
    const chars = stableContent.split('');
    const charDuration = Math.max((duration / 1000 - 0.6) / Math.max(chars.length, 1), 0.012);

    let current = '';
    tl.to({}, {
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
        // Fade glow
        if (glowRef.current) {
          gsap.to(glowRef.current, { opacity: 0, duration: 1.5, ease: 'power2.out' });
        }
      },
    });

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

    return () => { tl.kill(); };
  }, [stableContent, duration]);

  return (
    <div className="relative">
      {/* Ambient glow behind card */}
      <div
        ref={glowRef}
        className="absolute -inset-4 bg-gradient-to-r from-purple-600/10 via-cyan-500/5 to-purple-600/10 rounded-3xl blur-2xl opacity-0 pointer-events-none"
      />

      <div
        ref={cardRef}
        className="relative rounded-2xl overflow-hidden opacity-0 max-w-2xl border border-purple-500/20 bg-gradient-to-br from-slate-900/80 via-purple-950/20 to-slate-900/80 backdrop-blur-sm shadow-xl shadow-purple-900/10"
      >
        {/* Purple accent line */}
        <div className="h-[2px] bg-gradient-to-r from-purple-500 via-cyan-400 to-purple-500" />

        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-lg shadow-lg shadow-purple-500/20">
              {'\u{1F9D1}\u200D\u{1F3EB}'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                    Vaathiyaar
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                </div>
                <span ref={emojiRef} className="text-3xl">{emoji}</span>
              </div>

              <div ref={textRef} className="text-slate-300 text-sm leading-relaxed min-h-[3rem]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={storyMarkdownComponents}>
                  {displayed}
                </ReactMarkdown>
                {displayed.length < stableContent.length && (
                  <span className="inline-block w-[2px] h-4 bg-purple-400 ml-0.5 align-middle shadow-[0_0_4px_rgba(168,85,247,0.6)]"
                    style={{ animation: 'blink 0.8s steps(2) infinite' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
