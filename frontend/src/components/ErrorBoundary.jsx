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
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                    <div className="text-red-400 font-bold text-lg">Something went wrong</div>
                    <p className="text-slate-400 text-sm max-w-md">
                        This section encountered an error. Try refreshing the page.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                        Try Again
                    </button>
                    {import.meta.env.DEV && this.state.error && (
                        <pre className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 max-w-lg overflow-auto text-left">
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
