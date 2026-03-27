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
                    <p className="text-slate-500 text-sm max-w-md">
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
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
