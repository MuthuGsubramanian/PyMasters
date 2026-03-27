import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal, Shield, Lock, Database, Cpu, AlertCircle } from 'lucide-react';

export default function Security() {
    const navigate = useNavigate();
    useEffect(() => { document.title = 'Security — PyMasters'; }, []);

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-slate-700 font-sans">
            {/* Navigation */}
            <nav className="px-6 py-5 border-b border-black/[0.06] bg-white/60 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-cyan-500/20">
                            <Terminal className="text-white" size={16} />
                        </div>
                        <span className="font-display font-bold text-lg tracking-tight text-slate-900">PYMASTERS</span>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        <ArrowLeft size={16} /> Back to Home
                    </button>
                </div>
            </nav>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-8 py-12">
                {/* Header */}
                <div className="mb-10 pb-8 border-b border-black/[0.06]">
                    <h1 className="text-4xl font-bold text-slate-900 mb-3">Security</h1>
                    <p className="text-sm text-slate-400 font-medium">Last Updated: March 26, 2026</p>
                    <p className="mt-4 text-slate-500">
                        Security is fundamental to PyMasters. This page describes the technical and operational measures we take to protect your data, ensure safe code execution, and maintain platform integrity.
                    </p>
                </div>

                <div className="space-y-10 text-slate-600 leading-relaxed">

                    {/* 1 */}
                    <section>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-2.5 rounded-xl bg-cyan-50 border border-cyan-200 flex-shrink-0">
                                <Shield className="text-cyan-600" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Code Execution Safety</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Sandboxed, isolated, and time-limited execution</p>
                            </div>
                        </div>
                        <p className="mb-4">
                            All Python code submitted on PyMasters — whether in exercises, the Classroom, or the Playground — runs in a <strong className="text-slate-700">restricted, isolated sandbox</strong> that is separate from the server infrastructure. This ensures your code cannot affect other users or our systems.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="font-bold text-slate-700 text-sm mb-1">File System Access</div>
                                <p className="text-sm text-slate-500">Blocked. Code cannot read from or write to the file system.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="font-bold text-slate-700 text-sm mb-1">Network Access</div>
                                <p className="text-sm text-slate-500">Blocked. Code cannot make outbound network calls or access the internet.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="font-bold text-slate-700 text-sm mb-1">Dangerous Imports</div>
                                <p className="text-sm text-slate-500">
                                    Blocked. Modules like{' '}
                                    <code className="bg-slate-100 px-1 rounded text-xs font-mono">os</code>,{' '}
                                    <code className="bg-slate-100 px-1 rounded text-xs font-mono">sys</code>,{' '}
                                    <code className="bg-slate-100 px-1 rounded text-xs font-mono">subprocess</code>, and{' '}
                                    <code className="bg-slate-100 px-1 rounded text-xs font-mono">shutil</code> are restricted.
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="font-bold text-slate-700 text-sm mb-1">Execution Timeouts</div>
                                <p className="text-sm text-slate-500">All code runs with a strict time limit to prevent infinite loops and resource exhaustion.</p>
                            </div>
                        </div>
                        <p className="mt-4 text-sm text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <strong className="text-amber-700">Note:</strong> Attempting to bypass, exploit, or probe the sandbox is a violation of our Terms of Use and may result in immediate account suspension. Please report any concerns to <a href="mailto:security@pymasters.net" className="text-cyan-600 hover:underline">security@pymasters.net</a>.
                        </p>
                    </section>

                    {/* 2 */}
                    <section>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex-shrink-0">
                                <Lock className="text-blue-600" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Authentication &amp; Access</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Secure credentials and session management</p>
                            </div>
                        </div>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>
                                <strong className="text-slate-700">Password hashing:</strong> All passwords are hashed using industry-standard algorithms before storage. Plain-text passwords are never written to disk or transmitted internally.
                            </li>
                            <li>
                                <strong className="text-slate-700">JWT session tokens:</strong> Authentication is managed via JSON Web Tokens (JWT). Tokens are signed, validated server-side, and expire after a set period to limit exposure from stolen tokens.
                            </li>
                            <li>
                                <strong className="text-slate-700">No plain-text credentials:</strong> Credentials are never logged, displayed, or stored without cryptographic protection.
                            </li>
                            <li>
                                <strong className="text-slate-700">Principle of least privilege:</strong> Each component of the system accesses only the data it requires to function.
                            </li>
                        </ul>
                    </section>

                    {/* 3 */}
                    <section>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex-shrink-0">
                                <Database className="text-purple-600" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Data Protection</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Infrastructure-level security for your data</p>
                            </div>
                        </div>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>
                                <strong className="text-slate-700">Cloud infrastructure:</strong> The PyMasters application is hosted on Google Cloud Run, which provides managed, isolated compute environments with built-in security hardening.
                            </li>
                            <li>
                                <strong className="text-slate-700">Restricted database access:</strong> The database is accessible only from the application layer. It is not publicly exposed or accessible via the internet.
                            </li>
                            <li>
                                <strong className="text-slate-700">No public data exposure:</strong> User profile data, learning records, and chat histories are never publicly accessible without explicit authentication.
                            </li>
                            <li>
                                <strong className="text-slate-700">Data in transit:</strong> All communication between your browser and our servers is encrypted via HTTPS/TLS.
                            </li>
                        </ul>
                    </section>

                    {/* 4 */}
                    <section>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-2.5 rounded-xl bg-green-50 border border-green-200 flex-shrink-0">
                                <Cpu className="text-green-600" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">AI Safety</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Responsible AI operation within defined boundaries</p>
                            </div>
                        </div>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>
                                <strong className="text-slate-700">Teaching boundaries:</strong> Vaathiyaar, our AI teacher, is designed and prompted to operate strictly within the domain of Python education. It is not intended to answer questions outside this scope.
                            </li>
                            <li>
                                <strong className="text-slate-700">Structured responses:</strong> AI responses are validated and structured before being presented to the user. Raw model output is not directly exposed.
                            </li>
                            <li>
                                <strong className="text-slate-700">Data isolation:</strong> User data used for AI personalization (mastery scores, learning style) is processed within the PyMasters platform and is not shared with third parties beyond what is described in our Privacy Policy.
                            </li>
                            <li>
                                <strong className="text-slate-700">No autonomous actions:</strong> The AI does not take actions on your account or outside the platform without your explicit interaction.
                            </li>
                        </ul>
                    </section>

                    {/* 5 */}
                    <section>
                        <div className="flex items-start gap-4 mb-4">
                            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 flex-shrink-0">
                                <AlertCircle className="text-red-500" size={22} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Responsible Disclosure</h2>
                                <p className="text-sm text-slate-500 mt-0.5">Help us keep PyMasters secure</p>
                            </div>
                        </div>
                        <p className="mb-4">
                            If you discover a security vulnerability in PyMasters, we encourage you to report it to us responsibly. We take all reports seriously and will work to address confirmed issues promptly.
                        </p>
                        <div className="p-5 rounded-xl bg-white border border-black/[0.06] space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                                <p className="text-sm"><strong className="text-slate-700">Contact:</strong> Send your report to <a href="mailto:security@pymasters.net" className="text-cyan-600 hover:underline font-medium">security@pymasters.net</a> with a clear description of the vulnerability, steps to reproduce, and potential impact.</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                                <p className="text-sm"><strong className="text-slate-700">Response time:</strong> We aim to provide an initial response within <strong>72 hours</strong> of receiving a report.</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0"></div>
                                <p className="text-sm"><strong className="text-slate-700">Good faith:</strong> We ask that you do not exploit the vulnerability beyond what is necessary to demonstrate it, and that you do not disclose it publicly before we have had a chance to address it.</p>
                            </div>
                        </div>
                    </section>

                </div>

                {/* Footer Nav */}
                <div className="mt-16 pt-8 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} PyMasters. All rights reserved.</p>
                    <div className="flex items-center gap-6 text-xs text-slate-400">
                        <button onClick={() => navigate('/terms')} className="hover:text-cyan-600 transition-colors">Terms of Use</button>
                        <button onClick={() => navigate('/privacy')} className="hover:text-cyan-600 transition-colors">Privacy Policy</button>
                        <a href="mailto:security@pymasters.net" className="hover:text-cyan-600 transition-colors">security@pymasters.net</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
