import { Component } from 'react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary]', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 p-4">
                    <div className="text-red-400 font-bold text-lg">Something went wrong</div>
                    <p className="text-text-muted text-sm max-w-md">
                        This section encountered an error.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white text-sm font-bold hover:scale-105 transition-transform"
                    >
                        Try Again
                    </button>
                    {this.state.error && (
                        <pre className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] text-red-400 max-w-lg overflow-auto text-left max-h-32">
                            {(() => {
                                try {
                                    const e = this.state.error;
                                    if (typeof e === 'string') return e;
                                    if (e instanceof Error) return e.message || e.toString();
                                    if (typeof e?.message === 'string') return e.message;
                                    return JSON.stringify(e, null, 2);
                                } catch {
                                    return 'An unexpected error occurred';
                                }
                            })()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
