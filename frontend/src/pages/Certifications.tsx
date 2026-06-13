import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import { Award, ExternalLink, Calendar, CheckCircle2, Trophy, Sparkles, Download, Plus, Pencil, Save, X, BookOpen, Link2, Clock, DollarSign, ArrowLeft } from 'lucide-react';
import { SkeletonCertGrid } from '../components/Skeleton';

interface EarnedCert {
  cert_id: string;
  cert_name: string;
  vendor: string;
  level: string;
  score: number;
  issued_at: string;
  skills: { name: string; weight: number }[];
  cert_page: string | null;
  cert_code: string;
  course_id: string;
  user_id: string;
}

export default function Certifications() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [certs, setCerts] = useState<EarnedCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<EarnedCert | null>(null);

  useEffect(() => {
    apiClient.get('/api/users/earned-certifications')
      .then((r) => setCerts(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <div className="dash-welcome">
        <h1>My Certifications</h1>
        <p>Certifications you have earned</p>
      </div>
      <SkeletonCertGrid count={6} />
    </div>
  );

  // Admin view
  if (user?.role === 'admin') {
    return <AdminCertsView />;
  }

  // Detail view for a selected certificate
  if (selectedCert) {
    return (
      <div>
        <button className="btn btn-ghost" onClick={() => setSelectedCert(null)} style={{ marginBottom: '1.5rem' }}>
          <ArrowLeft size={16} /> Back to My Certifications
        </button>

        {/* Certificate Card */}
        <div className="card" style={{ borderTop: '4px solid var(--success)', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div className="card-body" style={{ padding: '2.5rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(79,70,229,0.04) 100%)' }}>
            {/* Certificate Header */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Trophy size={28} style={{ color: 'var(--success)' }} />
              </div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>Certificate of Achievement</div>
              <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Awarded to</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{user?.full_name || 'Learner'}</h2>
              <div style={{ width: '60px', height: '2px', background: 'var(--accent-primary)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{selectedCert.cert_name}</h3>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{selectedCert.cert_code}</span>
                <span className={`cert-level ${selectedCert.level}`}>{selectedCert.level}</span>
              </div>
              {selectedCert.issued_at && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                  <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Earned {new Date(selectedCert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Score */}
            <div style={{ padding: '1rem 2rem', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', display: 'inline-block', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)' }}>{selectedCert.score}%</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Score Achieved</div>
            </div>

            {/* Skills as chips */}
            {selectedCert.skills && selectedCert.skills.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Skills Validated</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                  {selectedCert.skills.map((s, i) => (
                    <span key={i} style={{
                      padding: '0.4rem 0.85rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 500,
                      background: 'rgba(79,70,229,0.08)', color: 'var(--accent-primary)', border: '1px solid rgba(79,70,229,0.15)'
                    }}>
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' }}>
              {selectedCert.cert_page && (
                <a href={selectedCert.cert_page} target="_blank" rel="noopener noreferrer"
                  className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  <ExternalLink size={14} /> View Certificate on {selectedCert.vendor} Platform
                </a>
              )}
              <button className="btn btn-ghost" style={{ border: '1px solid var(--border)' }}>
                <Download size={14} /> Download Certificate
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dash-welcome">
        <h1>My Certifications</h1>
        <p>Certifications you have earned</p>
      </div>

      {certs.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <Award size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No certifications earned yet</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '1rem' }}>Complete courses and pass assessments to earn certifications.</p>
            <button className="btn btn-primary" onClick={() => navigate('/courses')}>Browse Courses</button>
          </div>
        </div>
      ) : (
        <div className="cert-grid">
          {certs.map((cert) => (
            <div key={cert.cert_id} className="cert-card"
              style={{ borderTop: '3px solid var(--success)', cursor: 'pointer' }}
              onClick={() => setSelectedCert(cert)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Trophy size={18} style={{ color: 'var(--success)' }} />
                <span className={`cert-level ${cert.level}`}>{cert.level}</span>
              </div>
              <h4 style={{ fontSize: '0.92rem', marginBottom: '0.25rem' }}>{cert.cert_name}</h4>
              <div className="cert-id">{cert.cert_code}</div>
              <div className="cert-meta" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  <CheckCircle2 size={12} style={{ color: 'var(--success)' }} /> Score: {cert.score}%
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  <Calendar size={12} /> {new Date(cert.issued_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin Certifications View ──────────────────────────────────────────

const AVAILABLE_COURSES = [
  'CERT-AZ900', 'CERT-AZ104', 'CERT-AZ204', 'CERT-AZ400',
  'CERT-AZ305', 'CERT-AZ500', 'CERT-DP203', 'CERT-AI102',
];

interface AdminCert {
  id: string;
  name: string;
  vendor: string;
  level: string;
  description: string;
  attachedCourses: string[];
  passThreshold: number;
  validityMonths: number;
}

function AdminCertsView() {
  const nav = useNavigate();
  const [certificates, setCertificates] = useState<AdminCert[]>([
    { id: 'CERT-AZ900', name: 'Azure Fundamentals', vendor: 'Microsoft', level: 'Fundamentals', description: 'Validates foundational knowledge of cloud concepts and core Azure services.', attachedCourses: ['CERT-AZ900'], passThreshold: 70, validityMonths: 0 },
    { id: 'CERT-AZ104', name: 'Azure Administrator Associate', vendor: 'Microsoft', level: 'Associate', description: 'Validates expertise in implementing, managing, and monitoring Azure environments.', attachedCourses: ['CERT-AZ104'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-AZ204', name: 'Azure Developer Associate', vendor: 'Microsoft', level: 'Associate', description: 'Measures ability to develop Azure compute solutions, storage, security.', attachedCourses: ['CERT-AZ204'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-AZ400', name: 'Azure DevOps Engineer Expert', vendor: 'Microsoft', level: 'Expert', description: 'Validates expertise in combining people, process, and technologies for continuous delivery.', attachedCourses: ['CERT-AZ400', 'CERT-AZ204'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-AZ305', name: 'Azure Solutions Architect Expert', vendor: 'Microsoft', level: 'Expert', description: 'Validates expertise in designing cloud and hybrid solutions on Azure.', attachedCourses: ['CERT-AZ305', 'CERT-AZ104'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-AZ500', name: 'Azure Security Engineer', vendor: 'Microsoft', level: 'Associate', description: 'Validates expertise in implementing security controls and threat protection.', attachedCourses: ['CERT-AZ500'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-DP203', name: 'Azure Data Engineer Associate', vendor: 'Microsoft', level: 'Associate', description: 'Validates expertise in designing and implementing data solutions.', attachedCourses: ['CERT-DP203'], passThreshold: 70, validityMonths: 12 },
    { id: 'CERT-AI102', name: 'Azure AI Engineer Associate', vendor: 'Microsoft', level: 'Associate', description: 'Validates expertise in designing AI solutions using Cognitive Services.', attachedCourses: ['CERT-AI102'], passThreshold: 70, validityMonths: 12 },
  ]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AdminCert>({
    id: '', name: '', vendor: 'Microsoft', level: 'Associate', description: '',
    attachedCourses: [], passThreshold: 70, validityMonths: 12,
  });

  const inputStyle = {
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem',
    fontSize: '0.82rem', background: 'var(--bg-input)', outline: 'none', width: '100%',
  };

  const startEdit = (c: AdminCert) => { setEditingId(c.id); setForm({ ...c, attachedCourses: [...c.attachedCourses] }); setShowAdd(false); };
  const startAdd = () => { setShowAdd(true); setEditingId(null); setForm({ id: '', name: '', vendor: 'Microsoft', level: 'Associate', description: '', attachedCourses: [], passThreshold: 70, validityMonths: 12 }); };

  const saveEdit = () => { setCertificates(prev => prev.map(c => c.id === editingId ? { ...form } : c)); setEditingId(null); };
  const saveNew = () => {
    if (!form.name.trim()) return;
    const id = `CERT-${form.name.replace(/\s+/g, '').substring(0, 5).toUpperCase()}${Date.now() % 1000}`;
    setCertificates(prev => [...prev, { ...form, id }]);
    setShowAdd(false);
  };

  const toggleCourse = (courseId: string) => {
    setForm(prev => ({
      ...prev,
      attachedCourses: prev.attachedCourses.includes(courseId)
        ? prev.attachedCourses.filter(c => c !== courseId)
        : [...prev.attachedCourses, courseId],
    }));
  };

  return (
    <div>
      <div className="dash-welcome">
        <h1>Manage Certifications</h1>
        <p>Create certifications and attach them to courses</p>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon green"><Award size={20} /></div>
          <div className="stat-content"><div className="stat-value">{certificates.length}</div><div className="stat-label">Total Certifications</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><BookOpen size={20} /></div>
          <div className="stat-content"><div className="stat-value">{certificates.filter(c => c.level === 'Fundamentals').length}</div><div className="stat-label">Fundamentals</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Trophy size={20} /></div>
          <div className="stat-content"><div className="stat-value">{certificates.filter(c => c.level === 'Expert').length}</div><div className="stat-label">Expert</div></div>
        </div>
      </div>

      {/* Add Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => nav('/admin/certifications/add')}><Plus size={15} /> New Certification</button>
      </div>

      {/* Add/Edit Form */}
      {(showAdd || editingId) && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '1.5px solid var(--accent-primary)' }}>
          <div className="card-header">
            <h3>{showAdd ? <><Plus size={16} /> New Certification</> : <><Pencil size={16} /> Edit Certification</>}</h3>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Certification Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Azure Fundamentals" />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Vendor</label>
                <input style={inputStyle} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Microsoft" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Level</label>
                <select style={inputStyle} value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                  <option value="Fundamentals">Fundamentals</option>
                  <option value="Associate">Associate</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Pass Threshold (%)</label>
                <input type="number" style={inputStyle} value={form.passThreshold} onChange={e => setForm({ ...form, passThreshold: parseInt(e.target.value) || 70 })} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Validity (months, 0=lifetime)</label>
                <input type="number" style={inputStyle} value={form.validityMonths} onChange={e => setForm({ ...form, validityMonths: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem', display: 'block' }}>Description *</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Certification description..." />
            </div>

            {/* Attach Courses */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.5rem', display: 'block' }}>
                <Link2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Attach to Courses
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {AVAILABLE_COURSES.map(courseId => {
                  const attached = form.attachedCourses.includes(courseId);
                  return (
                    <button key={courseId} onClick={() => toggleCourse(courseId)} style={{
                      padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer',
                      border: `1.5px solid ${attached ? 'var(--accent-primary)' : 'var(--border)'}`,
                      background: attached ? 'var(--accent-subtle)' : 'transparent',
                      color: attached ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}>
                      {attached && <CheckCircle2 size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />}
                      {courseId}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setEditingId(null); }}><X size={14} /> Cancel</button>
              <button className="btn btn-primary" onClick={showAdd ? saveNew : saveEdit}><Save size={14} /> {showAdd ? 'Create Certification' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cert List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {certificates.map((c) => (
          <div key={c.id} className="card">
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.1)', flexShrink: 0 }}>
                  <Award size={18} style={{ color: 'var(--success)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{c.name}</h4>
                    <span className={`cert-level ${c.level}`}>{c.level}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>{c.id} &middot; {c.vendor}</div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.5rem' }}>{c.description}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Pass: {c.passThreshold}%</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Validity: {c.validityMonths === 0 ? 'Lifetime' : `${c.validityMonths} months`}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {c.attachedCourses.map(courseId => (
                      <span key={courseId} className="badge in-progress" style={{ fontSize: '0.65rem' }}>
                        <BookOpen size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} /> {courseId}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }} onClick={() => startEdit(c)}>
                  <Pencil size={13} /> Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
