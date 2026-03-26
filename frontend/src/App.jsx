import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import { Overview, LearningMap, ModuleViewer } from './pages/Dashboard';
import Classroom from './pages/Classroom';
import ErrorBoundary from './components/ErrorBoundary';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<PrivateRoute><Onboarding /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<ErrorBoundary><Overview /></ErrorBoundary>} />
              <Route path="learn" element={<ErrorBoundary><LearningMap /></ErrorBoundary>} />
              <Route path="learn/:id" element={<ErrorBoundary><ModuleViewer /></ErrorBoundary>} />
              <Route path="classroom" element={<ErrorBoundary><Classroom /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
