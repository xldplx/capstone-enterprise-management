import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Dashboard';
import DashboardLayout from './pages/dashboard/DashboardLayout';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  if (!token) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(userRole)) return <Navigate to="/dashboard/overview" replace />;
  return children;
};


function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['Project Manager', 'Planner', 'Cost Engineer', 'Site Engineer', 'Management']}><DashboardLayout /></ProtectedRoute>} />
      <Route path="/dashboard/:tab" element={<ProtectedRoute allowedRoles={['Project Manager', 'Planner', 'Cost Engineer', 'Site Engineer', 'Management']}><DashboardLayout /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


export default App;