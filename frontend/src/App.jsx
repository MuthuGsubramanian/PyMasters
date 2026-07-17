import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { trackVisit, trackPing } from './api';
import { ProfileProvider } from './context/ProfileContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import ErrorBoundary from './components/ErrorBoundary';

// Code-split everything except the landing page + app shell so the initial
// JS payload stays small. Each page (and its heavy deps — CodeMirror, animations,
// xlsx, charts) loads only when its route is visited.
//
// lazyRetry: every deploy renames the hashed chunk files, so a tab opened
// BEFORE a deploy 404s when it lazily imports a page AFTER the deploy
// ("Failed to fetch dynamically imported module: .../SuperAdmin-<hash>.js" —
// MSG hit this navigating Classroom → Super Admin, 2026-07-02). With deploys
// landing many times a day via the automation loops, any long-lived tab goes
// stale quickly. Recovery: reload ONCE so the fresh index.html points at the
// new chunk names; a per-chunk sessionStorage guard prevents reload loops if
// a chunk is genuinely broken (then the error surfaces to the ErrorBoundary
// as before). On a successful load the guard is cleared again.
function lazyRetry(factory, name) {
  return lazy(() =>
    factory().then(
      (module) => {
        try { sessionStorage.removeItem(`pm_chunk_reload:${name}`); } catch { /* private mode */ }
        return module;
      },
      (error) => {
        let alreadyReloaded = false;
        try {
          alreadyReloaded = sessionStorage.getItem(`pm_chunk_reload:${name}`) === '1';
          if (!alreadyReloaded) sessionStorage.setItem(`pm_chunk_reload:${name}`, '1');
        } catch { /* private mode: fall through to a single throw */ alreadyReloaded = true; }
        if (!alreadyReloaded) {
          window.location.reload();
          return new Promise(() => {}); // page is reloading — never settle
        }
        throw error;
      }
    )
  );
}

const Login = lazyRetry(() => import('./pages/Login'), 'Login');
const Onboarding = lazyRetry(() => import('./pages/Onboarding'), 'Onboarding');
const Overview = lazyRetry(() => import('./pages/Dashboard').then((m) => ({ default: m.Overview })), 'Overview');
const Classroom = lazyRetry(() => import('./pages/Classroom'), 'Classroom');
const Playground = lazyRetry(() => import('./pages/Playground'), 'Playground');
const Paths = lazyRetry(() => import('./pages/Paths'), 'Paths');
const Terms = lazyRetry(() => import('./pages/Terms'), 'Terms');
const Privacy = lazyRetry(() => import('./pages/Privacy'), 'Privacy');
const Security = lazyRetry(() => import('./pages/Security'), 'Security');
const Profile = lazyRetry(() => import('./pages/Profile'), 'Profile');
const Trending = lazyRetry(() => import('./pages/Trending'), 'Trending');
const OrgSetup = lazyRetry(() => import('./pages/OrgSetup'), 'OrgSetup');
const OrgDashboard = lazyRetry(() => import('./pages/OrgDashboard'), 'OrgDashboard');
const JoinOrg = lazyRetry(() => import('./pages/JoinOrg'), 'JoinOrg');
const Challenges = lazyRetry(() => import('./pages/Challenges'), 'Challenges');
const Reference = lazyRetry(() => import('./pages/Reference'), 'Reference');
const Explains = lazyRetry(() => import('./pages/Explains'), 'Explains');
const SuperAdmin = lazyRetry(() => import('./pages/SuperAdmin'), 'SuperAdmin');
const ForgotPassword = lazyRetry(() => import('./pages/ForgotPassword'), 'ForgotPassword');
const ResetPassword = lazyRetry(() => import('./pages/ResetPassword'), 'ResetPassword');
const Community = lazyRetry(() => import('./pages/Community'), 'Community');
const OrgCompete = lazyRetry(() => import('./pages/OrgCompete'), 'OrgCompete');
const KnowledgeMap = lazyRetry(() => import('./pages/KnowledgeMap'), 'KnowledgeMap');
const Pricing = lazyRetry(() => import('./pages/Pricing'), 'Pricing');
const Upgrade = lazyRetry(() => import('./pages/Upgrade'), 'Upgrade');

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function OnboardedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (!user.onboarding_completed) return <Navigate to="/onboarding" />;
  return children;
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] text-white p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold font-display bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent mb-4">404</div>
        <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
        <p className="text-slate-400 mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-sm hover:scale-105 transition-transform">
          Go Home
        </a>
      </div>
    </div>
  );
}

// Telemetry beacon (Super Admin analytics): one visit row per real page load
// (anonymous or signed-in), then a presence heartbeat every 3 minutes so the
// console can show "online now". Fire-and-forget; failures are swallowed in
// the api helpers and can never affect the app.
function TelemetryBeacon() {
  const { user } = useAuth();
  useEffect(() => {
    trackVisit(user?.id, window.location.pathname);
    // One visit per SPA load is intentional — route changes are not "visits".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    trackPing(user.id);
    const t = setInterval(() => trackPing(user.id), 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [user?.id]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TelemetryBeacon />
        <ProfileProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
              <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
              {/* Guessed/legacy signup URLs must never 404 — funnel them into the
                  Login page pre-flipped to signup mode (additive; /login unchanged). */}
              <Route path="/signup" element={<Navigate to="/login?mode=signup" replace />} />
              <Route path="/register" element={<Navigate to="/login?mode=signup" replace />} />
              <Route path="/join/:token" element={<ErrorBoundary><JoinOrg /></ErrorBoundary>} />
            <Route path="/forgot-password" element={<ErrorBoundary><ForgotPassword /></ErrorBoundary>} />
            <Route path="/reset-password/:token" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
              <Route path="/pricing" element={<ErrorBoundary><Pricing /></ErrorBoundary>} />
              <Route path="/terms" element={<ErrorBoundary><Terms /></ErrorBoundary>} />
              <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
              <Route path="/security" element={<ErrorBoundary><Security /></ErrorBoundary>} />
              <Route path="/onboarding" element={<PrivateRoute><ErrorBoundary><Onboarding /></ErrorBoundary></PrivateRoute>} />
              {/* Legacy/shared-link alias: the Playground lives inside the dashboard shell */}
              <Route path="/playground" element={<Navigate to="/dashboard/playground" replace />} />
              <Route path="/dashboard" element={<OnboardedRoute><Layout /></OnboardedRoute>}>
                <Route index element={<ErrorBoundary><Overview /></ErrorBoundary>} />
                {/* Legacy learn map consolidated into the Classroom catalogue */}
                <Route path="learn" element={<Navigate to="/dashboard/classroom" replace />} />
                <Route path="learn/:id" element={<Navigate to="/dashboard/classroom" replace />} />
                <Route path="paths" element={<ErrorBoundary><Paths /></ErrorBoundary>} />
                <Route path="paths/:pathId" element={<ErrorBoundary><Paths /></ErrorBoundary>} />
                {/* "Evolution" is the nav label for the Paths experience; alias the slug so a directly-typed /dashboard/evolution URL resolves instead of 404ing */}
                <Route path="evolution" element={<Navigate to="/dashboard/paths" replace />} />
                <Route path="evolution/:pathId" element={<Navigate to="/dashboard/paths" replace />} />
                <Route path="knowledge" element={<ErrorBoundary><KnowledgeMap /></ErrorBoundary>} />
                <Route path="upgrade" element={<ErrorBoundary><Upgrade /></ErrorBoundary>} />
                <Route path="classroom" element={<ErrorBoundary><Classroom /></ErrorBoundary>} />
                <Route path="playground" element={<ErrorBoundary><Playground /></ErrorBoundary>} />
                <Route path="trending" element={<ErrorBoundary><Trending /></ErrorBoundary>} />
                <Route path="challenges" element={<ErrorBoundary><Challenges /></ErrorBoundary>} />
                <Route path="community" element={<ErrorBoundary><Community /></ErrorBoundary>} />
                <Route path="org-compete" element={<ErrorBoundary><OrgCompete /></ErrorBoundary>} />
                <Route path="reference" element={<ErrorBoundary><Reference /></ErrorBoundary>} />
                <Route path="explains" element={<ErrorBoundary><Explains /></ErrorBoundary>} />
                <Route path="explains/:slug" element={<ErrorBoundary><Explains /></ErrorBoundary>} />
                <Route path="profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
                <Route path="org/setup" element={<ErrorBoundary><OrgSetup /></ErrorBoundary>} />
                <Route path="org" element={<ErrorBoundary><OrgDashboard /></ErrorBoundary>} />
                <Route path="admin" element={<ErrorBoundary><SuperAdmin /></ErrorBoundary>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
