import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { Overview, LearningMap, ModuleViewer } from './pages/Dashboard';
import Classroom from './pages/Classroom';
import Playground from './pages/Playground';
import Paths from './pages/Paths';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Security from './pages/Security';
import Profile from './pages/Profile';
import Trending from './pages/Trending';
import ErrorBoundary from './components/ErrorBoundary';

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
          <Routes>
            <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
            <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
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
              <Route path="profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
