import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Terminal } from 'lucide-react';

export default function Terms() {
    const navigate = useNavigate();
    useEffect(() => { document.title = 'Terms of Use — PyMasters'; }, []);

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
                    <h1 className="text-4xl font-bold text-slate-900 mb-3">Terms of Use</h1>
                    <p className="text-sm text-slate-400 font-medium">Last Updated: March 26, 2026</p>
                </div>

                <div className="space-y-10 text-slate-600 leading-relaxed">

                    {/* 1 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">1</span>
                            Acceptance of Terms
                        </h2>
                        <p>
                            By accessing or using PyMasters (<a href="https://www.pymasters.net" className="text-cyan-600 hover:underline">www.pymasters.net</a>), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the platform. These terms constitute a legally binding agreement between you and PyMasters. Your continued use of the platform following any updates to these terms constitutes your acceptance of the revised terms.
                        </p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">2</span>
                            Account Registration
                        </h2>
                        <p className="mb-3">
                            To access the full features of PyMasters, you must create an account. By registering, you agree to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>Provide accurate, current, and complete information during registration.</li>
                            <li>Maintain the security of your password and promptly notify us of any unauthorized use of your account.</li>
                            <li>Maintain only one account per person. Duplicate accounts may be removed without notice.</li>
                            <li>Be at least 13 years of age. PyMasters is not directed at children under 13.</li>
                        </ul>
                        <p className="mt-3">
                            You are solely responsible for all activity that occurs under your account.
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">3</span>
                            AI-Generated Content
                        </h2>
                        <p className="mb-3">
                            PyMasters features an AI teacher called <strong className="text-slate-700">Vaathiyaar</strong>, which generates responses, explanations, code examples, and learning content using artificial intelligence.
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>All responses from Vaathiyaar are AI-generated and are intended for educational purposes only. They do not constitute professional, legal, financial, or career advice.</li>
                            <li>PyMasters does not guarantee the accuracy, completeness, or reliability of any AI-generated content.</li>
                            <li>You should independently verify any information before relying on it for important decisions.</li>
                            <li>PyMasters is not liable for any decisions made based on AI-generated content.</li>
                        </ul>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">4</span>
                            Code Execution
                        </h2>
                        <p className="mb-3">
                            PyMasters allows you to write and execute Python code within the platform. All code execution occurs in a <strong className="text-slate-700">sandboxed, isolated environment</strong> with the following restrictions:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>File system access (read and write) is not permitted.</li>
                            <li>Network calls and internet access are blocked.</li>
                            <li>Imports of system-level modules including <code className="bg-slate-100 px-1 rounded text-sm font-mono text-slate-700">os</code>, <code className="bg-slate-100 px-1 rounded text-sm font-mono text-slate-700">sys</code>, <code className="bg-slate-100 px-1 rounded text-sm font-mono text-slate-700">subprocess</code>, <code className="bg-slate-100 px-1 rounded text-sm font-mono text-slate-700">shutil</code>, and similar modules are restricted.</li>
                            <li>Execution is subject to time limits to prevent infinite loops or resource abuse.</li>
                        </ul>
                        <p className="mt-3">
                            PyMasters is not liable for any errors, data loss, or unexpected behavior resulting from code you execute on the platform. Attempting to bypass sandbox restrictions is a violation of these terms and may result in account termination.
                        </p>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">5</span>
                            XP &amp; Gamification
                        </h2>
                        <p className="mb-3">
                            PyMasters uses an experience points (XP) system and other gamification mechanics to enhance the learning experience.
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>XP, ranks, badges, and other in-platform rewards have no monetary value and cannot be exchanged for money or goods.</li>
                            <li>XP and rewards are non-transferable and cannot be sold, gifted, or assigned to another user.</li>
                            <li>PyMasters reserves the right to modify, reset, or retire the XP system at any time without prior notice.</li>
                        </ul>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">6</span>
                            User Content
                        </h2>
                        <p className="mb-3">
                            You retain ownership of the original code you write on PyMasters. However, by submitting code for evaluation, participating in learning activities, or interacting with Vaathiyaar, you grant PyMasters a non-exclusive, worldwide, royalty-free license to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>Use your anonymized interactions, code submissions, and learning signals to train and improve our AI models.</li>
                            <li>Analyze aggregated, anonymized data for platform improvement and research purposes.</li>
                        </ul>
                        <p className="mt-3">
                            This license does not grant PyMasters the right to publish your code or personal information publicly in an identifiable way. You represent that you have the right to submit any content you provide on the platform.
                        </p>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">7</span>
                            Acceptable Use
                        </h2>
                        <p className="mb-3">You agree not to use PyMasters to:</p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>Abuse, harass, or harm other users.</li>
                            <li>Attempt to bypass, compromise, or exploit the code execution sandbox or any other security measure.</li>
                            <li>Share malicious code, harmful content, or content that violates applicable laws.</li>
                            <li>Reverse-engineer, scrape, or extract data from the platform without authorization.</li>
                            <li>Create accounts for the purpose of automated abuse or spam.</li>
                            <li>Impersonate other users, PyMasters staff, or any third party.</li>
                        </ul>
                        <p className="mt-3">
                            PyMasters reserves the right to remove any content and take action against accounts that violate these policies.
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">8</span>
                            Notifications
                        </h2>
                        <p className="mb-3">
                            By creating an account on PyMasters, you consent to receive communications from us, including:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>In-app notifications about your learning progress, new modules, and platform updates.</li>
                            <li>Email notifications via SendGrid about account activity and new content.</li>
                            <li>WhatsApp notifications via Twilio, if a WhatsApp number is provided in your profile.</li>
                        </ul>
                        <p className="mt-3">
                            You can manage your notification preferences at any time from your profile settings. Opting out of certain transactional messages may limit platform functionality.
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">9</span>
                            Intellectual Property
                        </h2>
                        <p>
                            All platform content — including the PyMasters curriculum, lesson modules, visual animations, branding, interface design, and the Vaathiyaar AI system — is the exclusive intellectual property of PyMasters and is protected by applicable copyright and trademark laws. You may not reproduce, distribute, modify, or create derivative works from any PyMasters content without express written permission.
                        </p>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">10</span>
                            Termination
                        </h2>
                        <p>
                            PyMasters reserves the right to suspend or permanently terminate your account at any time, with or without notice, for conduct that violates these Terms of Use, that is harmful to other users, to PyMasters, or to third parties, or for any other reason at our sole discretion. Upon termination, your right to access the platform ceases immediately. Provisions that by their nature should survive termination will continue to apply.
                        </p>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">11</span>
                            Limitation of Liability
                        </h2>
                        <p className="mb-3">
                            To the fullest extent permitted by applicable law, PyMasters and its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 pl-2">
                            <li>Loss of data, revenue, or profits.</li>
                            <li>Damages resulting from the use or inability to use the platform.</li>
                            <li>Damages resulting from AI-generated content or code execution outcomes.</li>
                        </ul>
                        <p className="mt-3">
                            PyMasters' total liability to you for any claims arising from these terms or your use of the platform shall not exceed the amount you paid to PyMasters in the twelve months preceding the claim, or USD $50, whichever is greater.
                        </p>
                    </section>

                    {/* 12 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">12</span>
                            Changes to Terms
                        </h2>
                        <p>
                            PyMasters reserves the right to update or modify these Terms of Use at any time. When changes are made, we will update the "Last Updated" date at the top of this page and notify users via in-platform messaging. Your continued use of the platform after changes are posted constitutes your acceptance of the revised terms. We encourage you to review these terms periodically.
                        </p>
                    </section>

                    {/* 13 */}
                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold flex items-center justify-center">13</span>
                            Contact
                        </h2>
                        <p>
                            If you have any questions, concerns, or requests relating to these Terms of Use, please contact us at{' '}
                            <a href="mailto:legal@pymasters.net" className="text-cyan-600 hover:underline font-medium">legal@pymasters.net</a>.
                        </p>
                    </section>

                </div>

                {/* Footer Nav */}
                <div className="mt-16 pt-8 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} PyMasters. All rights reserved.</p>
                    <div className="flex items-center gap-6 text-xs text-slate-400">
                        <button onClick={() => navigate('/privacy')} className="hover:text-cyan-600 transition-colors">Privacy Policy</button>
                        <button onClick={() => navigate('/security')} className="hover:text-cyan-600 transition-colors">Security</button>
                        <a href="mailto:legal@pymasters.net" className="hover:text-cyan-600 transition-colors">legal@pymasters.net</a>
                    </div>
                </div>
            </div>
        </div>
    );
}
