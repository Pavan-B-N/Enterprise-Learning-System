import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import {
  Clock, Sun, Moon, Sunset, Activity, Save, CheckCircle2, Zap, Info,
} from 'lucide-react';
import { Skeleton, SkeletonLines } from '../components/Skeleton';

interface Prefs {
  meeting_hours: number;
  focus_hours: number;
  collaboration_hours: number;
  preferred_learning_slot: string;
  peak_focus_window: string;
  interruption_density: string;
  total_work_hours: number;
  study_hours_per_week: number;
}

const DEFAULT: Prefs = {
  meeting_hours: 10,
  focus_hours: 10,
  collaboration_hours: 5,
  preferred_learning_slot: 'Morning',
  peak_focus_window: '09:00-11:00',
  interruption_density: 'Medium',
  total_work_hours: 40,
  study_hours_per_week: 5,
};

export default function Preferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.get('/api/users/preferences')
      .then((r) => setPrefs({ ...DEFAULT, ...r.data }))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiClient.put('/api/users/preferences', prefs);
      setPrefs({ ...DEFAULT, ...res.data });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const slotIcon = (slot: string) => {
    switch (slot) {
      case 'Morning': return <Sun size={14} />;
      case 'Afternoon': return <Sunset size={14} />;
      case 'Evening': return <Moon size={14} />;
      default: return <Clock size={14} />;
    }
  };

  if (loading) return (
    <div className="page-enter" aria-busy="true">
      <div className="dash-welcome">
        <h1>Learning Preferences</h1>
        <p>Configure your work patterns so our AI Study Planner Agent can schedule learning sessions around your meetings, focus blocks, and collaboration time — ensuring zero conflict with your work commitments.</p>
      </div>

      {/* Two-column grid — matches real layout (Work Schedule | Learning Preferences) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: '900px' }}>
        {/* Left: Work Schedule (banner + 4 fields + summary) */}
        <div className="card">
          <div className="card-header"><h3><Clock size={16} /> Weekly Work Schedule</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Skeleton width="100%" height={40} radius={8} />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="pref-field">
                <Skeleton width="55%" height={11} />
                <div style={{ height: 6 }} />
                <Skeleton width="100%" height={36} radius={6} />
              </div>
            ))}
            <Skeleton width="60%" height={28} radius={8} />
          </div>
        </div>

        {/* Right: Learning Preferences (target + slot pills + select + density pills) */}
        <div className="card">
          <div className="card-header"><h3><Zap size={16} /> Learning Preferences</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="pref-field">
              <Skeleton width="55%" height={11} />
              <div style={{ height: 6 }} />
              <Skeleton width="100%" height={36} radius={6} />
            </div>
            <div className="pref-field">
              <Skeleton width="45%" height={11} />
              <div style={{ height: 6 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3].map((i) => <Skeleton key={i} width={90} height={32} radius={6} />)}
              </div>
            </div>
            <div className="pref-field">
              <Skeleton width="40%" height={11} />
              <div style={{ height: 6 }} />
              <Skeleton width="100%" height={36} radius={6} />
            </div>
            <div className="pref-field">
              <Skeleton width="45%" height={11} />
              <div style={{ height: 6 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3].map((i) => <Skeleton key={i} width={70} height={32} radius={6} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save row */}
      <div style={{ marginTop: '1.5rem' }}>
        <Skeleton width={170} height={38} radius={8} />
      </div>
    </div>
  );

  const availableStudyHours = Math.max(0, prefs.total_work_hours - prefs.meeting_hours - prefs.collaboration_hours);

  return (
    <div className="page-enter">
      <div className="dash-welcome">
        <h1>Learning Preferences</h1>
        <p>Configure your work patterns so our AI Study Planner Agent can schedule learning sessions around your meetings, focus blocks, and collaboration time — ensuring zero conflict with your work commitments.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: '900px' }}>
        {/* Work Schedule */}
        <div className="card">
          <div className="card-header"><h3><Clock size={16} /> Weekly Work Schedule</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="pref-info-banner">
              <Info size={13} />
              <span>This data is collected from your work profile via <strong>WorkIQ</strong> integration. You can adjust if your schedule has changed.</span>
            </div>
            <div className="pref-field">
              <label className="pref-label">Total Work Hours / Week</label>
              <input type="number" className="pref-input" value={prefs.total_work_hours}
                onChange={(e) => setPrefs({ ...prefs, total_work_hours: parseInt(e.target.value) || 0 })} min={0} max={80} />
            </div>
            <div className="pref-field">
              <label className="pref-label">Meeting Hours / Week</label>
              <input type="number" className="pref-input" value={prefs.meeting_hours}
                onChange={(e) => setPrefs({ ...prefs, meeting_hours: parseInt(e.target.value) || 0 })} min={0} max={40} />
            </div>
            <div className="pref-field">
              <label className="pref-label">Focus Hours / Week</label>
              <input type="number" className="pref-input" value={prefs.focus_hours}
                onChange={(e) => setPrefs({ ...prefs, focus_hours: parseInt(e.target.value) || 0 })} min={0} max={40} />
            </div>
            <div className="pref-field">
              <label className="pref-label">Collaboration Hours / Week</label>
              <input type="number" className="pref-input" value={prefs.collaboration_hours}
                onChange={(e) => setPrefs({ ...prefs, collaboration_hours: parseInt(e.target.value) || 0 })} min={0} max={40} />
            </div>
            <div className="pref-summary">
              <Activity size={13} />
              <span>Available for study: <strong>{availableStudyHours}h</strong> / week</span>
            </div>
          </div>
        </div>

        {/* Learning Preferences */}
        <div className="card">
          <div className="card-header"><h3><Zap size={16} /> Learning Preferences</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="pref-field">
              <label className="pref-label">Study Hours / Week (Target)</label>
              <input type="number" className="pref-input" value={prefs.study_hours_per_week}
                onChange={(e) => setPrefs({ ...prefs, study_hours_per_week: parseInt(e.target.value) || 0 })} min={1} max={30} />
            </div>
            <div className="pref-field">
              <label className="pref-label">Preferred Learning Slot</label>
              <div className="pref-slot-options">
                {['Morning', 'Afternoon', 'Evening'].map((slot) => (
                  <button key={slot}
                    className={`pref-slot-btn ${prefs.preferred_learning_slot === slot ? 'active' : ''}`}
                    onClick={() => setPrefs({ ...prefs, preferred_learning_slot: slot })}>
                    {slotIcon(slot)} {slot}
                  </button>
                ))}
              </div>
            </div>
            <div className="pref-field">
              <label className="pref-label">Peak Focus Window</label>
              <select className="pref-input" value={prefs.peak_focus_window}
                onChange={(e) => setPrefs({ ...prefs, peak_focus_window: e.target.value })}>
                <option value="06:00-08:00">6:00 AM - 8:00 AM</option>
                <option value="07:00-09:00">7:00 AM - 9:00 AM</option>
                <option value="08:00-10:00">8:00 AM - 10:00 AM</option>
                <option value="09:00-11:00">9:00 AM - 11:00 AM</option>
                <option value="10:00-12:00">10:00 AM - 12:00 PM</option>
                <option value="11:00-13:00">11:00 AM - 1:00 PM</option>
                <option value="12:00-14:00">12:00 PM - 2:00 PM</option>
                <option value="13:00-15:00">1:00 PM - 3:00 PM</option>
                <option value="14:00-16:00">2:00 PM - 4:00 PM</option>
                <option value="15:00-17:00">3:00 PM - 5:00 PM</option>
                <option value="16:00-18:00">4:00 PM - 6:00 PM</option>
                <option value="17:00-19:00">5:00 PM - 7:00 PM</option>
              </select>
            </div>
            <div className="pref-field">
              <label className="pref-label">Interruption Density</label>
              <div className="pref-slot-options">
                {['Low', 'Medium', 'High'].map((level) => (
                  <button key={level}
                    className={`pref-slot-btn ${prefs.interruption_density === level ? 'active' : ''}`}
                    onClick={() => setPrefs({ ...prefs, interruption_density: level })}>
                    {level}
                  </button>
                ))}
              </div>
              <div className="pref-hint">
                <strong>Low:</strong> Few Slack/Teams pings, rare context switches — ideal for deep study sessions.
                <strong> Medium:</strong> Occasional interruptions — shorter study blocks recommended.
                <strong> High:</strong> Frequent pings & meetings — agent will schedule micro-learning (15-30 min) instead of long blocks.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : <><Save size={15} /> Save Preferences</>}
        </button>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--success)', fontSize: '0.82rem', fontWeight: 500 }}>
            <CheckCircle2 size={14} /> Preferences saved successfully
          </span>
        )}
      </div>
    </div>
  );
}
