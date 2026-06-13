import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, Clock, Target, Save } from 'lucide-react';

export default function AddCertification() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    cert_id: '', cert_name: '', level: 'associate', pass_threshold: 70,
    recommended_hours: 40, description: '', provider: 'Microsoft',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (!form.cert_name.trim()) return;
    setSaving(true);
    setTimeout(() => { setSaving(false); nav('/admin/certifications'); }, 600);
  };

  const set = (key: string, val: string | number) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/certifications')}>
        <ArrowLeft size={18} /> Back to Certifications
      </button>

      <div className="form-page-wrapper">
        <div className="form-page-intro">
          <h1>Add Certification</h1>
          <p>Configure a new certification track for the learning platform.</p>
        </div>

        <div className="card form-card">
          {/* Basic Info */}
          <div className="form-section">
            <div className="form-section-header">
              <Award size={18} />
              <div>
                <h3>Certification Details</h3>
                <p>Define the certification name, code, and provider</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Certification Name <span className="required">*</span></label>
                <input value={form.cert_name} onChange={e => set('cert_name', e.target.value)} placeholder="e.g. Azure Administrator" />
              </div>
              <div className="form-field">
                <label>Cert ID</label>
                <input value={form.cert_id} onChange={e => set('cert_id', e.target.value)} placeholder="e.g. CERT-AZ104 (auto-generated if empty)" />
              </div>
              <div className="form-field">
                <label>Provider</label>
                <input value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="e.g. Microsoft" />
              </div>
              <div className="form-field">
                <label>Level</label>
                <select value={form.level} onChange={e => set('level', e.target.value)}>
                  <option value="fundamentals">Fundamentals</option>
                  <option value="associate">Associate</option>
                  <option value="expert">Expert</option>
                  <option value="specialty">Specialty</option>
                </select>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="form-section">
            <div className="form-section-header">
              <Target size={18} />
              <div>
                <h3>Requirements</h3>
                <p>Set passing criteria and estimated effort</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Pass Threshold (%)</label>
                <input type="number" min={0} max={100} value={form.pass_threshold} onChange={e => set('pass_threshold', parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-field">
                <label>Recommended Hours</label>
                <input type="number" min={0} value={form.recommended_hours} onChange={e => set('recommended_hours', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="form-section">
            <div className="form-section-header">
              <BookOpen size={18} />
              <div>
                <h3>Description</h3>
                <p>Optional description for this certification</p>
              </div>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Briefly describe what this certification covers..."
                style={{ width: '100%', padding: '0.7rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-sans)', resize: 'vertical' }} />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => nav('/admin/certifications')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.cert_name.trim()}>
              <Save size={15} /> {saving ? 'Saving...' : 'Add Certification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
