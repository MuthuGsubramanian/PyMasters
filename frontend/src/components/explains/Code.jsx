// Shared inline-code chip used by Explains essay prose.
export default function Code({ children }) {
    return (
        <span className="bg-accent-subtle text-accent-primary px-1 py-0.5 rounded text-[13px] font-mono">{children}</span>
    );
}
