// Title and description of a lesson visual, shown above and below it.
// Renders nothing when there is no text, so callers can always include it.
export default function VisualCaption({ title = '', description = '', position }) {
  if (!title && !description) return null;
  const where = position || (title ? 'above' : 'below');
  return (
    <div className={`flex flex-col gap-1 max-w-prose ${where === 'above' ? 'mb-1' : 'mt-1'}`}>
      {title ? <p className="text-sm font-semibold text-text-primary">{title}</p> : null}
      {description ? <p className="text-sm text-text-secondary leading-relaxed">{description}</p> : null}
    </div>
  );
}
