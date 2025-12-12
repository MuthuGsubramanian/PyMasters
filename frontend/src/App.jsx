import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import { Overview, LearningMap, ModuleViewer, StudioView } from './pages/Dashboard';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Logic */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          {/* Private Logic - Wrapped in Sidebar Layout */}
          <Route path="/dashboard" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Overview />} />
            <Route path="learn" element={<LearningMap />} />
            <Route path="learn/:id" element={<ModuleViewer />} />
            <Route path="studio" element={<StudioView />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
