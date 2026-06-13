import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { CheckCircle2, Clock, BookOpen, ChevronDown, ChevronRight, Target, Calendar, Play } from 'lucide-react';
import { SkeletonCard } from '../components/Skeleton';

// Weekly study plan structure per certification
const CERT_WEEKLY_PLANS: Record<string, { weeks: { title: string; topics: string[]; hours: number }[] }> = {
  'CERT-AZ900': {
    weeks: [
      { title: 'Cloud Fundamentals & Concepts', topics: ['What is cloud computing', 'IaaS, PaaS, SaaS models', 'Public, Private, Hybrid clouds', 'CapEx vs OpEx'], hours: 5 },
      { title: 'Azure Core Services', topics: ['Azure Regions & Availability Zones', 'Resource Groups & Subscriptions', 'Virtual Machines & App Service', 'Azure Storage (Blob, Queue, Table)'], hours: 6 },
      { title: 'Azure Networking & Security', topics: ['Virtual Networks & Subnets', 'NSGs & Azure Firewall', 'Azure AD & RBAC', 'Multi-factor Authentication'], hours: 5 },
      { title: 'Governance, Pricing & Review', topics: ['Azure Policy & Blueprints', 'Cost Management & Pricing Calculator', 'Support Plans & SLAs', 'Exam preparation & practice'], hours: 4 },
    ],
  },
  'CERT-AZ104': {
    weeks: [
      { title: 'Identity & Governance', topics: ['Azure AD users, groups, tenants', 'RBAC roles & custom roles', 'Azure Policy & Management Groups', 'Subscriptions & resource locks'], hours: 8 },
      { title: 'Storage Solutions', topics: ['Storage accounts & replication', 'Blob storage tiers', 'Azure Files & File Sync', 'Storage security & SAS tokens'], hours: 7 },
      { title: 'Virtual Machines', topics: ['Create & configure VMs', 'VM availability sets & scale sets', 'Azure Disk Encryption', 'ARM templates & Bicep basics'], hours: 8 },
      { title: 'Networking Fundamentals', topics: ['VNets, subnets, peering', 'NSGs & Application Security Groups', 'Azure DNS & Private DNS', 'VPN Gateway & ExpressRoute'], hours: 8 },
      { title: 'Advanced Networking', topics: ['Azure Load Balancer', 'Application Gateway & WAF', 'Network Watcher', 'Azure Front Door & Traffic Manager'], hours: 7 },
      { title: 'App Service & Containers', topics: ['Azure App Service plans & deployment', 'Container Instances & ACR', 'Azure Kubernetes Service basics', 'Deployment slots & scaling'], hours: 7 },
      { title: 'Monitoring & Backup', topics: ['Azure Monitor & Log Analytics', 'Alerts & Action Groups', 'Azure Backup & Recovery Services', 'Azure Site Recovery'], hours: 5 },
    ],
  },
  'CERT-AZ204': {
    weeks: [
      { title: 'App Service & Deployment', topics: ['Create & configure App Service', 'Deployment slots & CI/CD', 'Auto-scaling rules', 'App settings & connection strings'], hours: 7 },
      { title: 'Azure Functions', topics: ['Function triggers & bindings', 'Durable Functions', 'Custom handlers', 'Monitoring with Application Insights'], hours: 7 },
      { title: 'Blob Storage & Cosmos DB', topics: ['Blob SDK operations', 'Lifecycle management', 'Cosmos DB partitioning', 'Consistency levels & queries'], hours: 8 },
      { title: 'Authentication & Security', topics: ['Microsoft Identity Platform', 'MSAL & OAuth 2.0 flows', 'Azure Key Vault', 'Managed Identities'], hours: 7 },
      { title: 'API Management & Caching', topics: ['API Management policies', 'Azure Cache for Redis', 'CDN integration', 'Application Insights'], hours: 6 },
      { title: 'Event & Message Solutions', topics: ['Azure Event Grid', 'Event Hubs', 'Service Bus queues & topics', 'Azure Queue Storage'], hours: 7 },
      { title: 'Containers & Review', topics: ['Docker & ACR', 'Azure Container Apps', 'AKS basics for developers', 'Practice exam preparation'], hours: 8 },
    ],
  },
  'CERT-AZ400': {
    weeks: [
      { title: 'DevOps Fundamentals', topics: ['DevOps culture & practices', 'Azure DevOps services overview', 'Agile planning with Boards', 'Work item tracking'], hours: 6 },
      { title: 'Source Control with Git', topics: ['Git branching strategies', 'Pull request workflows', 'Git hooks & policies', 'Monorepo vs multi-repo'], hours: 7 },
      { title: 'CI Pipelines', topics: ['YAML pipeline syntax', 'Build agents & pools', 'Multi-stage builds', 'Artifacts & package management'], hours: 8 },
      { title: 'CD & Release Management', topics: ['Release pipelines', 'Deployment strategies (blue-green, canary)', 'Environment approvals & gates', 'GitHub Actions integration'], hours: 8 },
      { title: 'Infrastructure as Code', topics: ['ARM templates & Bicep', 'Terraform basics', 'Configuration management', 'Desired State Configuration'], hours: 7 },
      { title: 'Security & Compliance', topics: ['Secret management', 'Pipeline security', 'Dependency scanning', 'License & vulnerability checks'], hours: 6 },
      { title: 'Monitoring & Feedback', topics: ['Application Insights', 'Azure Monitor & alerts', 'Feature flags', 'Site Reliability Engineering'], hours: 6 },
    ],
  },
  'CERT-AZ305': {
    weeks: [
      { title: 'Identity & Governance Design', topics: ['Multi-tenant architecture', 'Conditional Access design', 'Privileged Identity Management', 'Azure Lighthouse'], hours: 8 },
      { title: 'Data Storage Design', topics: ['SQL vs NoSQL decisions', 'Data partitioning strategies', 'Azure Synapse architecture', 'Data Lake design patterns'], hours: 9 },
      { title: 'Compute & App Architecture', topics: ['Microservices patterns', 'Serverless architecture', 'Container orchestration', 'High availability patterns'], hours: 9 },
      { title: 'Networking Design', topics: ['Hub-spoke topology', 'Azure Virtual WAN', 'Private Link & endpoints', 'DNS architecture'], hours: 8 },
      { title: 'Business Continuity', topics: ['RTO & RPO design', 'Disaster recovery strategies', 'Multi-region deployment', 'Azure Site Recovery'], hours: 7 },
      { title: 'Migration & Integration', topics: ['Cloud Adoption Framework', 'Migration strategies (5 Rs)', 'Azure Migrate', 'Integration patterns'], hours: 7 },
      { title: 'Well-Architected Review', topics: ['Cost optimization', 'Operational excellence', 'Performance efficiency', 'Security & reliability pillars'], hours: 7 },
    ],
  },
  'CERT-AZ500': {
    weeks: [
      { title: 'Identity Security', topics: ['Azure AD security', 'Conditional Access policies', 'PIM & access reviews', 'External identities'], hours: 8 },
      { title: 'Platform Protection', topics: ['Network security groups', 'Azure Firewall & DDoS', 'Container security', 'Host security & updates'], hours: 8 },
      { title: 'Data & App Security', topics: ['Azure Key Vault', 'Storage encryption', 'SQL security & auditing', 'App security features'], hours: 8 },
      { title: 'Security Operations', topics: ['Azure Sentinel (Microsoft Sentinel)', 'Security Center / Defender for Cloud', 'Threat detection & response', 'Security automation'], hours: 8 },
      { title: 'Compliance & Review', topics: ['Azure Policy for security', 'Regulatory compliance', 'Security benchmarks', 'Exam preparation & labs'], hours: 6 },
    ],
  },
  'CERT-DP203': {
    weeks: [
      { title: 'Data Storage Fundamentals', topics: ['Azure Data Lake Storage', 'Azure Synapse Analytics', 'Data warehouse concepts', 'Blob storage for data'], hours: 7 },
      { title: 'Data Processing with Spark', topics: ['Apache Spark on Azure', 'DataFrames & transformations', 'Databricks workspace', 'Delta Lake format'], hours: 8 },
      { title: 'Stream Processing', topics: ['Azure Stream Analytics', 'Event Hubs integration', 'Windowing functions', 'Real-time dashboards'], hours: 7 },
      { title: 'Data Integration', topics: ['Azure Data Factory', 'Pipelines & data flows', 'Mapping data flows', 'Triggers & scheduling'], hours: 8 },
      { title: 'Security & Monitoring', topics: ['Data masking & encryption', 'Row-level security', 'Monitor data pipelines', 'Cost optimization'], hours: 7 },
    ],
  },
  'CERT-AI102': {
    weeks: [
      { title: 'Azure AI Overview', topics: ['Azure AI services landscape', 'Responsible AI principles', 'Resource provisioning', 'Authentication & security'], hours: 6 },
      { title: 'Computer Vision', topics: ['Image analysis API', 'Custom Vision training', 'Face detection service', 'OCR & Form Recognizer'], hours: 7 },
      { title: 'Natural Language Processing', topics: ['Text Analytics & sentiment', 'Language Understanding (CLU)', 'Question Answering', 'Translator service'], hours: 8 },
      { title: 'Conversational AI', topics: ['Bot Framework SDK', 'Power Virtual Agents', 'Dialog management', 'Channel integration'], hours: 7 },
      { title: 'Knowledge Mining & OpenAI', topics: ['Azure AI Search', 'Skillsets & indexers', 'Azure OpenAI Service', 'Prompt engineering & RAG'], hours: 8 },
    ],
  },
};

export default function Learn() {
  const navigate = useNavigate();
  const [certs, setCerts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCerts, setExpandedCerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/users/courses'),
      apiClient.get('/api/users/study-plan'),
    ])
      .then(([c, p]) => {
        setCerts(c.data || []);
        setPlan(p.data);
        // Auto-expand in-progress certs
        const inProg = (c.data || []).filter((cert: any) => cert.status === 'in_progress').map((cert: any) => cert.cert_id);
        setExpandedCerts(new Set(inProg));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div>
      <div className="dash-welcome">
        <h1>Learning Roadmap</h1>
        <p>Your study plan and course progress</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} lines={4} showFooter />
        ))}
      </div>
    </div>
  );

  // Filter: only show non-completed certs
  const activeCerts = certs.filter((c) => c.status !== 'completed');

  const toggleExpand = (certId: string) => {
    setExpandedCerts((prev) => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId); else next.add(certId);
      return next;
    });
  };

  return (
    <div>
      <div className="dash-welcome">
        <h1>Learning Roadmap</h1>
        <p>Week-by-week study plan for your active certifications</p>
      </div>

      {activeCerts.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <CheckCircle2 size={36} style={{ color: 'var(--success)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>All caught up!</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>You've completed all your assigned certifications.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {activeCerts.map((cert) => {
            const weeklyPlan = CERT_WEEKLY_PLANS[cert.cert_id];
            const isExpanded = expandedCerts.has(cert.cert_id);
            const milestones = plan?.cert_id === cert.cert_id ? (plan.milestones || []) : [];

            // Determine current week based on milestones
            let currentWeek = 0;
            if (milestones.length > 0) {
              const completedCount = milestones.filter((m: any) => m.status === 'completed').length;
              currentWeek = completedCount;
            }

            return (
              <div key={cert.cert_id} className="card">
                {/* Cert Header */}
                <div
                  className="card-body"
                  style={{ padding: '1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}
                  onClick={() => toggleExpand(cert.cert_id)}
                >
                  <div style={{
                    width: '2.5rem', height: '2.5rem', borderRadius: 'var(--radius-sm)',
                    background: cert.status === 'in_progress' ? 'rgba(59,130,246,0.1)' : 'var(--surface-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {cert.status === 'in_progress' ? <Clock size={18} style={{ color: 'var(--accent-primary)' }} /> : <Target size={18} style={{ color: 'var(--text-tertiary)' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{cert.cert_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
                      <span>{cert.cert_id}</span>
                      <span>{cert.recommended_hours}h total</span>
                      {weeklyPlan && <span>{weeklyPlan.weeks.length} weeks</span>}
                    </div>
                  </div>
                  <span className={`badge ${cert.status === 'in_progress' ? 'in-progress' : 'not-started'}`} style={{ fontSize: '0.7rem' }}>
                    {cert.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                  </span>
                  {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />}
                </div>

                {/* Weekly Breakdown */}
                {isExpanded && weeklyPlan && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {weeklyPlan.weeks.map((week, wi) => {
                        const weekStatus = wi < currentWeek ? 'completed' : wi === currentWeek ? 'current' : 'upcoming';
                        return (
                          <div key={wi} style={{
                            padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
                            border: weekStatus === 'current' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border)',
                            background: weekStatus === 'completed' ? 'rgba(16,185,129,0.03)' : weekStatus === 'current' ? 'rgba(79,70,229,0.03)' : 'transparent',
                            opacity: weekStatus === 'upcoming' ? 0.7 : 1,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{
                                width: '1.5rem', height: '1.5rem', borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: weekStatus === 'completed' ? 'var(--success)' : weekStatus === 'current' ? 'var(--accent-primary)' : 'var(--surface-2)',
                                color: weekStatus === 'upcoming' ? 'var(--text-tertiary)' : '#fff', fontSize: '0.65rem', fontWeight: 600,
                              }}>
                                {weekStatus === 'completed' ? <CheckCircle2 size={12} /> : wi + 1}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Week {wi + 1}: {week.title}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                                  {week.hours}h &middot; {week.topics.length} topics
                                </div>
                              </div>
                              {weekStatus === 'current' && (
                                <span className="badge in-progress" style={{ fontSize: '0.65rem' }}>This Week</span>
                              )}
                            </div>
                            {/* Topics list */}
                            <div style={{ marginLeft: '2.25rem', marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {week.topics.map((topic, ti) => (
                                <span key={ti} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action */}
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => navigate(`/courses/${cert.cert_id}`)}>
                        <Play size={14} /> {cert.status === 'in_progress' ? 'Continue Course' : 'Start Course'}
                      </button>
                    </div>
                  </div>
                )}

                {/* No plan data available */}
                {isExpanded && !weeklyPlan && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '1.25rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Weekly plan not available for this certification yet.</p>
                    <button className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => navigate(`/courses/${cert.cert_id}`)}>
                      View Course
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
