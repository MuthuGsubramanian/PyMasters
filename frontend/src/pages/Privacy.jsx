import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';

export default function Privacy() {
    const navigate = useNavigate();
    useEffect(() => { document.title = 'Privacy Policy — PyMasters'; }, []);

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
                    <h1 className="text-4xl font-bold text-slate-900 mb-3">Privacy Policy</h1>
                    <p className="text-sm text-slate-400 font-medium">Last Updated: March 26, 2026</p>
                    <p className="mt-4 text-slate-500">
                        PyMasters is committed to protecting your privacy. This policy explains what data we collect, how we use it, and the choices you have. By using PyMasters, you agree to the practices described here.
                    </p>
                </div>

                <div className="space-y-10 text-slate-600 leading-relaxed">

                    {/* 1 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">1</span>
                            Information We Collect
                        </h2>
                        <p className="mb-4">We collect the following categories of data when you use PyMasters:</p>

                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Account Information</h3>
                                <p className="text-sm">Username, full name, email address, and optionally your WhatsApp number. This is collected during registration and profile setup.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Profile Data</h3>
                                <p className="text-sm">Your stated motivation for learning, prior programming experience, learning style preferences, personal goals, and preferred coding language. Collected during onboarding to personalize your experience.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Learning Data</h3>
                                <p className="text-sm">Mastery scores per topic, learning signals (confidence, speed, accuracy), practice attempt history, time spent on modules, and XP earned. Used to adapt your learning path.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Code Submissions</h3>
                                <p className="text-sm">Code you write and submit for evaluation in exercises or the Playground. Stored for grading, feedback generation, and anonymized AI training.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Chat Messages</h3>
                                <p className="text-sm">Conversations you have with Vaathiyaar, our AI teacher. Messages are processed by the AI and stored to maintain context and improve the model.</p>
                            </div>
                            <div className="p-4 rounded-xl bg-white border border-black/[0.06]">
                                <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">Usage Data</h3>
                                <p className="text-sm">Pages visited, features used, session duration, and interaction patterns. Collected automatically to understand how the platform is used and to improve it.</p>
                            </div>
                        </div>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">2</span>
                            How We Use Your Data
                        </h2>
                        <p className="mb-3">We use your data for the following purposes:</p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>Personalize your learning experience and adapt lesson difficulty to your skill level.</li>
                            <li>Enable Vaathiyaar to tailor its teaching style to your learning preferences and progress.</li>
                            <li>Generate custom learning modules and exercises relevant to your current mastery level.</li>
                            <li>Send notifications about new content, learning reminders, and platform updates.</li>
                            <li>Improve our AI models using anonymized and aggregated interaction data.</li>
                            <li>Perform platform analytics to understand usage patterns and fix issues.</li>
                            <li>Ensure the security and integrity of the platform.</li>
                        </ul>
                        <p className="mt-3">
                            We do not sell your personal data to third parties.
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">3</span>
                            Third-Party Services
                        </h2>
                        <p className="mb-4">
                            PyMasters uses trusted third-party services to operate the platform. Data shared with these providers is limited to what is necessary for the service:
                        </p>
                        <div className="space-y-3">
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2 flex-shrink-0"></div>
                                <div>
                                    <span className="font-bold text-slate-700">Ollama Cloud API</span>
                                    <p className="text-sm mt-1">Powers the Vaathiyaar AI. Your chat messages and code submissions are sent to Ollama Cloud for processing. Data is used solely to generate responses and is subject to Ollama's data handling policies.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></div>
                                <div>
                                    <span className="font-bold text-slate-700">Twilio</span>
                                    <p className="text-sm mt-1">Used to send WhatsApp notifications. Your WhatsApp number is shared with Twilio only when you have enabled WhatsApp notifications in your profile.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                                <div>
                                    <span className="font-bold text-slate-700">SendGrid</span>
                                    <p className="text-sm mt-1">Used to deliver email notifications. Your email address and notification content are processed through SendGrid's infrastructure.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 p-4 rounded-xl bg-white border border-black/[0.06]">
                                <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></div>
                                <div>
                                    <span className="font-bold text-slate-700">Google Cloud Run</span>
                                    <p className="text-sm mt-1">PyMasters is hosted on Google Cloud Run infrastructure. All application data and processing occur within Google's secure cloud environment.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">4</span>
                            Data Storage &amp; Security
                        </h2>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>User data is stored in a SQLite database hosted on secure Google Cloud infrastructure.</li>
                            <li>Passwords are hashed using industry-standard algorithms. Plain-text passwords are never stored.</li>
                            <li>Sessions are managed using JWT (JSON Web Tokens), which expire and are validated server-side.</li>
                            <li>Database access is restricted to the application layer and is not publicly exposed.</li>
                        </ul>
                        <p className="mt-3">
                            While we implement strong security measures, no system is completely immune to breaches. In the event of a data breach that affects your personal data, we will notify you in accordance with applicable law.
                        </p>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">5</span>
                            Your Rights
                        </h2>
                        <p className="mb-3">You have the following rights with respect to your personal data:</p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li><strong className="text-slate-700">Access:</strong> You can view your profile data, learning history, and account information directly within the platform.</li>
                            <li><strong className="text-slate-700">Deletion:</strong> You can request permanent deletion of your account and associated data by contacting <a href="mailto:legal@pymasters.net" className="text-cyan-600 hover:underline">legal@pymasters.net</a>.</li>
                            <li><strong className="text-slate-700">Notification opt-out:</strong> You can manage or disable email and WhatsApp notifications from your profile preferences at any time.</li>
                            <li><strong className="text-slate-700">Training data opt-out:</strong> If you do not wish your anonymized interactions to be used for AI training, you may request this exclusion by contacting us.</li>
                        </ul>
                        <p className="mt-3">
                            We will respond to all data rights requests within 30 days.
                        </p>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">6</span>
                            Cookies
                        </h2>
                        <p>
                            PyMasters uses a minimal number of cookies, strictly for authentication purposes (session tokens). We do not use advertising cookies, third-party tracking cookies, or behavioral analytics cookies. You may disable cookies in your browser settings, but doing so will prevent you from logging into the platform.
                        </p>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">7</span>
                            Children's Privacy
                        </h2>
                        <p>
                            PyMasters is not designed for or directed at children under the age of 13. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has created an account, please contact us at <a href="mailto:legal@pymasters.net" className="text-cyan-600 hover:underline">legal@pymasters.net</a> and we will promptly delete the account and associated data.
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">8</span>
                            Changes to This Policy
                        </h2>
                        <p>
                            We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. When we make material changes, we will update the "Last Updated" date at the top of this page and notify you via in-platform messaging. We encourage you to review this policy periodically. Continued use of PyMasters after changes are posted constitutes your acceptance of the updated policy.
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-center">9</span>
                            Contact
                        </h2>
                        <p>
                            For privacy-related questions, data requests, or concerns, please contact our team at{' '}
                            <a href="mailto:legal@pymasters.net" className="text-cyan-600 hover:underline font-medium">legal@pymasters.net</a>.
                            We are committed to addressing your questions promptly and transparently.
                        </p>
                    </section>

                </div>

                {/* Footer Nav */}
                <div className="mt-16 pt-8 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} PyMasters. All rights reserved.</p>
                    <div className="flex items-center gap-6 text-xs text-slate-400">
                        <button onClick={() => navigate('/terms')} className="hover:text-cyan-600 transition-colors">Terms of Use</button>
                        <button onClick={() => navigate('/security')} className="hover:text-cyan-600 transition-colors">Security</button>
                        <a href="mailto:legal@pymasters.net" className="hover:text-cyan-600 transition-colors">legal@pymasters.net</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
