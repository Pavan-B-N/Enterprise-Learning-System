import { Navigate } from 'react-router-dom';

// Manager dashboard is now integrated into the main Dashboard component
// which renders ManagerDash when role === 'manager'
export default function ManagerDashboard() {
  return <Navigate to="/dashboard" replace />;
}
