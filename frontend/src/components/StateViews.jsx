import { Loader2, Inbox, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shared loading / empty / error state views, so every page handles these the
 * same way instead of ad-hoc inline text. Styled to the app's design tokens.
 */

export function LoadingState({ label = 'Loading…', className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`} role="status" aria-live="polite">
            <Loader2 className="w-8 h-8 text-accent-primary animate-spin mb-4" aria-hidden="true" />
            <p className="text-text-muted text-sm">{label}</p>
        </div>
    );
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action, className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}>
            <div className="w-14 h-14 rounded-2xl bg-bg-inset border border-border-default flex items-center justify-center mb-4">
                <Icon className="w-7 h-7 text-text-muted" aria-hidden="true" />
            </div>
            <h3 className="text-text-primary font-semibold font-display mb-1">{title}</h3>
            {message && <p className="text-text-muted text-sm max-w-sm">{message}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function ErrorState({ title = 'Something went wrong', message = 'We couldn’t load this. Please try again.', onRetry, className = '' }) {
    return (
        <div className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`} role="alert">
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-text-primary font-semibold font-display mb-1">{title}</h3>
            <p className="text-text-muted text-sm max-w-sm mb-5">{message}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="btn-neo btn-neo-ghost inline-flex items-center gap-2 py-2.5"
                >
                    <RefreshCw size={15} aria-hidden="true" /> Try again
                </button>
            )}
        </div>
    );
}

export default { LoadingState, EmptyState, ErrorState };
