import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import ErrorBoundary from './components/ErrorBoundary';

// Code-split everything except the landing page + app shell so the initial
// JS payload stays small. Each page (and its heavy deps — CodeMirror, animations,
// xlsx, charts) loads only when its route is visited.
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Overview = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Overview })));
const LearningMap = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.LearningMap })));
const ModuleViewer = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.ModuleViewer })));
const Classroom = lazy(() => import('./pages/Classroom'));
const Playground = lazy(() => import('./pages/Playground'));
const Paths = lazy(() => import('./pages/Paths'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Security = lazy(() => import('./pages/Security'));
const Profile = lazy(() => import('./pages/Profile'));
const Trending = lazy(() => import('./pages/Trending'));
const OrgSetup = lazy(() => import('./pages/OrgSetup'));
const OrgDashboard = lazy(() => import('./pages/OrgDashboard'));
const JoinOrg = lazy(() => import('./pages/JoinOrg'));
const Challenges = lazy(() => import('./pages/Challenges'));
const Reference = lazy(() => import('./pages/Reference'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
              <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
              <Route path="/join/:token" element={<ErrorBoundary><JoinOrg /></ErrorBoundary>} />
              <Route path="/terms" element={<ErrorBoundary><Terms /></ErrorBoundary>} />
              <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
              <Route path="/security" element={<ErrorBoundary><Security /></ErrorBoundary>} />
              <Route path="/onboarding" element={<PrivateRoute><ErrorBoundary><Onboarding /></ErrorBoundary></PrivateRoute>} />
              <Route path="/dashboard" element={<OnboardedRoute><Layout /></OnboardedRoute>}>
                <Route index element={<ErrorBoundary><Overview /></ErrorBoundary>} />
                <Route path="learn" element={<ErrorBoundary><LearningMap /></ErrorBoundary>} />
                <Route path="learn/:id" element={<ErrorBoundary><ModuleViewer /></ErrorBoundary>} />
                <Route path="paths" element={<ErrorBoundary><Paths /></ErrorBoundary>} />
                <Route path="paths/:pathId" element={<ErrorBoundary><Paths /></ErrorBoundary>} />
                <Route path="classroom" element={<ErrorBoundary><Classroom /></ErrorBoundary>} />
                <Route path="playground" element={<ErrorBoundary><Playground /></ErrorBoundary>} />
                <Route path="trending" element={<ErrorBoundary><Trending /></ErrorBoundary>} />
                <Route path="challenges" element={<ErrorBoundary><Challenges /></ErrorBoundary>} />
                <Route path="reference" element={<ErrorBoundary><Reference /></ErrorBoundary>} />
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
