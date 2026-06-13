import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import {
  User, Mail, Shield, Briefcase, Hash, ChevronRight, Building2,
} from 'lucide-react';
import { Skeleton, SkeletonCircle, SkeletonLines } from '../components/Skeleton';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/api/users/profile')
      .then((r) => setProfile(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="profile-page page-enter" aria-busy="true">
      {/* Profile hero — matches .profile-hero (avatar + name + email + badges) */}
      <div className="profile-hero">
        <SkeletonCircle size={72} />
        <div className="profile-hero-info" style={{ flex: 1 }}>
          <Skeleton width={220} height={26} />
          <div style={{ height: 8 }} />
          <Skeleton width={260} height={13} />
          <div style={{ height: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width={70} height={22} radius={999} />
            <Skeleton width={60} height={22} radius={999} />
          </div>
        </div>
      </div>

      {/* Two-column: Account | Reporting Manager */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card">
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <User size={15} style={{ color: 'var(--accent-primary)' }} />
              <Skeleton width={80} height={12} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width={50} height={9} />
                  <div style={{ height: 6 }} />
                  <Skeleton width={`${75 - i * 8}%`} height={13} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Building2 size={15} style={{ color: 'var(--accent-primary)' }} />
              <Skeleton width={140} height={12} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <SkeletonCircle size={42} />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height={13} />
                <div style={{ height: 6 }} />
                <Skeleton width="75%" height={11} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job role full-width */}
      <div className="card">
        <div className="card-body" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <Skeleton width={34} height={34} radius={8} />
            <Skeleton width="30%" height={15} />
          </div>
          <SkeletonLines count={2} widths={['92%', '78%']} height={11} />
        </div>
      </div>
    </div>
  );
  if (!profile) return <div className="empty-state"><p>Unable to load profile</p></div>;

  const initials = profile.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const isAdmin = profile.role === 'admin';
  const jobRole = profile.job_role;

  return (
    <div className="profile-page page-enter">
      {/* Profile Hero */}
      <div className="profile-hero">
        <div className="profile-avatar-lg">{initials}</div>
        <div className="profile-hero-info">
          <h1 className="profile-hero-name">{profile.full_name}</h1>
          <p className="profile-hero-email">{profile.email}</p>
          <div className="profile-hero-badges">
            <span className={`profile-role-badge hero ${profile.role}`}>{profile.role}</span>
            <span className={`profile-status-badge ${profile.is_active ? 'active' : 'inactive'}`}>
              {profile.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Two-column grid: Info + Manager */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Left: Quick Info */}
        <div className="card">
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <User size={15} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Account</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Email</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{profile.email}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Role</div>
                <span className={`profile-role-badge ${profile.role}`}>{profile.role}</span>
              </div>
              {jobRole?.level && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>Level</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {jobRole.level.level_id} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span> {jobRole.level.level_name}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Reporting Manager */}
        <div className="card">
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Building2 size={15} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Reporting Manager</span>
            </div>
            {!isAdmin && profile.manager ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'var(--accent-subtle)', color: 'var(--accent-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.82rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {profile.manager.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{profile.manager.full_name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{profile.manager.email}</div>
                </div>
              </div>
            ) : (
              <div className="profile-empty-hint">{isAdmin ? 'N/A for admin' : 'No manager assigned'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Job Role — full width */}
      {jobRole && (
        <div className="card">
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-md)',
                background: 'var(--accent-subtle)', color: 'var(--accent-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Briefcase size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{jobRole.role_name}</div>
              </div>
            </div>
            {jobRole.description && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                {jobRole.description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
