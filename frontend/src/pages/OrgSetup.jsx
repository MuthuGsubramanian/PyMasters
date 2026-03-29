import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createOrg, bulkInviteToOrg } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, Mail, Plus, Trash2,
  ChevronRight, ChevronLeft, CheckCircle2,
  Globe, Sparkles
} from 'lucide-react';

const ORG_TYPES = ['School', 'University', 'Enterprise', 'Other'];
const ROLES = ['admin', 'manager', 'member'];

const stepVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

export default function OrgSetup() {
  const { user, setOrg } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Step 1
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('');
  const [domain, setDomain] = useState('');

  // Step 2
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');

  // Step 3
  const [emailInput, setEmailInput] = useState('');
  const [members, setMembers] = useState([]);
  const [bulkText, setBulkText] = useState('');

  const steps = ['Organization Info', 'Branding', 'Invite Members', 'Confirmation'];

  const canNext = () => {
    if (step === 0) return orgName.trim() && orgType;
    return true;
  };

  const goNext = () => {
    if (!canNext()) return;
    setDirection(1);
    setStep((s) => Math.min(s + 1, 3));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const addEmail = () => {
    const email = emailInput.trim();
    if (!email || members.some((m) => m.email === email)) return;
    setMembers([...members, { email, role: 'member' }]);
    setEmailInput('');
  };

  const removeEmail = (email) => {
    setMembers(members.filter((m) => m.email !== email));
  };

  const changeRole = (email, role) => {
    setMembers(members.map((m) => (m.email === email ? { ...m, role } : m)));
  };

  const parseBulk = () => {
    const emails = bulkText
      .split(/[,\n]+/)
      .map((e) => e.trim())
      .filter((e) => e && !members.some((m) => m.email === e));
    if (emails.length === 0) return;
    setMembers([...members, ...emails.map((email) => ({ email, role: 'member' }))]);
    setBulkText('');
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await createOrg({
        name: orgName.trim(),
        org_type: orgType.toLowerCase(),
        domain: domain.trim() || undefined,
        logo_url: logoUrl.trim() || undefined,
        description: description.trim() || undefined,
        created_by: user.user_id,
      });
      const org = res.data;

      if (members.length > 0) {
        try {
          await bulkInviteToOrg(org.org_id || org.id, {
            emails: members.map((m) => m.email),
            role: 'member',
            invited_by: user.user_id,
          });
        } catch {
          // Invites are non-critical — org is already created
        }
      }

      setOrg(org);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard/org'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30"
          >
            <CheckCircle2 size={40} className="text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Organization Created!</h2>
          <p className="text-slate-500">Redirecting to your dashboard...</p>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, ease: 'linear' }}
            className="h-1 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full mt-6 max-w-[200px] mx-auto"
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Create Organization</h1>
            <p className="text-sm text-slate-500">Set up your team in a few steps</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                  i < step
                    ? 'bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-md shadow-cyan-500/30'
                    : i === step
                    ? 'bg-gradient-to-br from-purple-500 to-cyan-500 text-white shadow-md shadow-purple-500/30'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-slate-900' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-[2px] flex-1 rounded-full transition-colors duration-300 ${i < step ? 'bg-cyan-400' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-black/[0.05] p-6 sm:p-8 shadow-sm min-h-[360px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {/* Step 0: Organization Info */}
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Organization Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g., Acme Academy"
                    className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-slate-800 placeholder:text-slate-300 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Organization Type <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ORG_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => setOrgType(type)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
                          orgType === type
                            ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-300 text-cyan-700 shadow-sm'
                            : 'border-black/[0.06] text-slate-500 hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Globe size={14} className="inline mr-1.5 text-slate-400" />
                    Domain <span className="text-slate-400 text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="e.g., company.com"
                    className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-slate-800 placeholder:text-slate-300 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Branding */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Sparkles size={14} className="inline mr-1.5 text-amber-400" />
                    Logo URL <span className="text-slate-400 text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-slate-800 placeholder:text-slate-300 transition-all"
                  />
                  {logoUrl && (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="w-12 h-12 rounded-xl object-cover border border-black/[0.05]"
                        onError={(e) => (e.target.style.display = 'none')}
                      />
                      <span className="text-xs text-slate-400">Preview</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of your organization..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-slate-800 placeholder:text-slate-300 transition-all resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Invite Members */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    <Mail size={14} className="inline mr-1.5 text-slate-400" />
                    Add Members by Email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                      placeholder="member@example.com"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-slate-800 placeholder:text-slate-300 transition-all"
                    />
                    <button
                      onClick={addEmail}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:shadow-md hover:shadow-cyan-500/25 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={16} /> Add
                    </button>
                  </div>
                </div>

                {members.length > 0 && (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {members.map((m) => (
                      <div key={m.email} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                        <Mail size={14} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 flex-1 truncate">{m.email}</span>
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m.email, e.target.value)}
                          className="text-xs px-2 py-1 rounded-lg border border-black/[0.08] bg-white text-slate-600 focus:outline-none"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeEmail(m.email)}
                          className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Bulk Paste <span className="text-slate-400 text-xs font-normal">(comma or newline separated)</span>
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={"alice@example.com, bob@example.com\ncharlie@example.com"}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-black/[0.08] bg-white/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 text-sm text-slate-800 placeholder:text-slate-300 transition-all resize-none"
                  />
                  {bulkText.trim() && (
                    <button
                      onClick={parseBulk}
                      className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-colors"
                    >
                      Parse & Add Emails
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Sparkles size={28} className="text-amber-400 mx-auto mb-2" />
                  <h3 className="text-lg font-bold text-slate-900">Review & Create</h3>
                  <p className="text-sm text-slate-500">Confirm your organization details</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                    <span className="text-sm text-slate-500">Name</span>
                    <span className="text-sm font-semibold text-slate-800">{orgName}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                    <span className="text-sm text-slate-500">Type</span>
                    <span className="text-sm font-semibold text-slate-800">{orgType}</span>
                  </div>
                  {domain && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                      <span className="text-sm text-slate-500">Domain</span>
                      <span className="text-sm font-semibold text-slate-800">{domain}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                    <span className="text-sm text-slate-500">Members to Invite</span>
                    <span className="text-sm font-semibold text-slate-800">{members.length}</span>
                  </div>
                  {description && (
                    <div className="px-4 py-3 rounded-xl bg-slate-50/80 border border-black/[0.04]">
                      <span className="text-sm text-slate-500 block mb-1">Description</span>
                      <span className="text-sm text-slate-700">{description}</span>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                    {error}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={goBack}
          disabled={step === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            step === 0
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-600 hover:bg-slate-100 border border-black/[0.06]'
          }`}
        >
          <ChevronLeft size={16} /> Back
        </button>

        {step < 3 ? (
          <button
            onClick={goNext}
            disabled={!canNext()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              canNext()
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/25 hover:shadow-lg hover:shadow-cyan-500/30'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-md shadow-purple-500/25 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-60"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Create Organization
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
