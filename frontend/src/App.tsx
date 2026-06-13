import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Certifications from './pages/Certifications';
import Courses from './pages/Courses';
import Assessments from './pages/Assessments';
import TakeExam from './pages/TakeExam';
import AssessmentReview from './pages/AssessmentReview';
import Preferences from './pages/Preferences';
import Chat from './pages/Chat';

import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import AddEmployee from './pages/admin/AddEmployee';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import AddCertification from './pages/admin/AddCertification';
import AddCourse from './pages/admin/AddCourse';
import CourseDetail from './pages/admin/CourseDetail';
import AddRole from './pages/admin/AddRole';
import RoleDetail from './pages/admin/RoleDetail';
import RaidViewer from './pages/admin/RaidViewer';
import LogsExplorer from './pages/admin/LogsExplorer';
import LiveLogStream from './pages/admin/LiveLogStream';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DefaultRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

function AdminGuardedDashboard() {
  const user = useAuthStore((s) => s.user);
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loginRedirect = user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/login" element={token ? <Navigate to={loginRedirect} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DefaultRedirect />} />
        <Route path="dashboard" element={<AdminGuardedDashboard />} />
        <Route path="certifications" element={<Certifications />} />
        <Route path="courses" element={<Courses />} />
        <Route path="courses/:certId" element={<Courses />} />
        <Route path="assessments" element={<Navigate to="/assessments/schedule" replace />} />
        <Route path="assessments/schedule" element={<Assessments />} />
        <Route path="assessments/history" element={<Assessments />} />
        <Route path="assessments/history/:scheduleId" element={<AssessmentReview />} />
        <Route path="assessments/:scheduleId" element={<TakeExam />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:convId" element={<Chat />} />

        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="admin/employees" element={<AdminPanel />} />
        <Route path="admin/employees/add" element={<AddEmployee />} />
        <Route path="admin/employees/:userId" element={<EmployeeDetail />} />
        <Route path="admin/certifications" element={<AdminPanel />} />
        <Route path="admin/certifications/add" element={<AddCertification />} />
        <Route path="admin/roles" element={<AdminPanel />} />
        <Route path="admin/roles/add" element={<AddRole />} />
        <Route path="admin/courses" element={<AdminPanel />} />
        <Route path="admin/courses/add" element={<AddCourse />} />
        <Route path="admin/courses/:courseId" element={<CourseDetail />} />
        <Route path="admin/courses/:courseId/guidance" element={<CourseDetail />} />
        <Route path="admin/courses/:courseId/:moduleId/:topicId" element={<CourseDetail />} />
        <Route path="admin/roles/:roleId" element={<RoleDetail />} />
        <Route path="admin/observability/raid" element={<RaidViewer />} />
        <Route path="admin/observability/logs" element={<LogsExplorer />} />
        <Route path="admin/observability/live" element={<LiveLogStream />} />
      </Route>
      <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </>
  );
}
