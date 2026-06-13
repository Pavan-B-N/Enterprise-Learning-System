import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  LayoutDashboard, Award, BookOpen,
  Shield, LogOut, User, FileText, Users, Briefcase, BarChart3, Settings,
  MessageSquare, GraduationCap, Activity, ScrollText, Radio,
} from 'lucide-react';
import NotificationBell from './NotificationBell';

const learnerNav = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/chat', label: 'Agent', icon: MessageSquare },
  { path: '/courses', label: 'Courses', icon: BookOpen },
  { path: '/assessments', label: 'Assessments', icon: FileText },
  { path: '/certifications', label: 'My Certifications', icon: Award },
  { path: '/preferences', label: 'Preferences', icon: Settings },
  { path: '/profile', label: 'Profile', icon: User },
];

const adminBaseNav = [
  { path: '/admin', label: 'Overview', icon: BarChart3 },
  { path: '/admin/employees', label: 'Users', icon: Users },
  { path: '/admin/roles', label: 'Job Roles', icon: Briefcase },
  { path: '/admin/courses', label: 'Courses', icon: BookOpen },
  { path: '/admin/observability/raid', label: 'RAID Trace', icon: Activity },
  { path: '/admin/observability/logs', label: 'Logs', icon: ScrollText },
  { path: '/admin/observability/live', label: 'Live Stream', icon: Radio },
  { path: '/profile', label: 'Profile', icon: User },
];

const ROLE_META: Record<string, { label: string; icon: any }> = {
  manager: { label: 'Manager', icon: Briefcase },
  learner: { label: 'My Learning', icon: GraduationCap },
  admin: { label: 'Admin', icon: Shield },
};

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setActiveRole = useAuthStore((s) => s.setActiveRole);
  const location = useLocation();

  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin ? adminBaseNav : learnerNav;

  const initials = user?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?';

  // Multi-role learners (e.g. manager+learner) get a switcher so the manager
  // surface and the learner agents are both reachable from one account.
  const availableRoles = (user?.roles ?? (user?.role ? [user.role] : []))
    .filter((r) => r !== 'admin');
  const canSwitch = availableRoles.length > 1;

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <h1>ELS Platform</h1>
          <p>Enterprise Learning System</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/admin'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {canSwitch && (
            <div className="role-switcher" role="tablist" aria-label="Switch view">
              {availableRoles.map((r) => {
                const meta = ROLE_META[r] ?? { label: r, icon: User };
                const Icon = meta.icon;
                const active = user?.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`role-switcher-pill ${active ? 'active' : ''}`}
                    onClick={() => setActiveRole(r)}
                    title={`View as ${meta.label}`}
                  >
                    <Icon size={13} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="sidebar-user">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="name">{user?.full_name}</div>
              <div className="role">{user?.role}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <div className="app-topbar">
          <NotificationBell />
        </div>
        <div className={`app-content ${location.pathname === '/chat' || location.pathname.startsWith('/chat/') || location.pathname.match(/^\/admin\/courses\/[^/]+/) || location.pathname.match(/^\/courses\/[^/]+/) ? 'no-pad' : ''}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
