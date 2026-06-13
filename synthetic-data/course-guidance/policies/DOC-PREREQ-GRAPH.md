# Certification Prerequisite Graph (Synthetic)

> **Document ID:** DOC-PREREQ-GRAPH  
> **Version:** 1.0  
> **Last Updated:** 2026-04-01  
> **Purpose:** Study Plan Generator reference for sequencing

## Prerequisite Dependency Map

```
AZ-900 (Fundamentals)
├── AZ-104 (Administrator) [recommended]
│   ├── AZ-400 (DevOps Expert) [strict: AZ-104 OR AZ-204 required]
│   ├── AZ-305 (Architect Expert) [strict: AZ-104 required]
│   └── AZ-500 (Security) [recommended]
├── AZ-204 (Developer) [recommended]
│   ├── AZ-400 (DevOps Expert) [strict: AZ-104 OR AZ-204 required]
│   ├── AZ-305 (Architect Expert) [recommended alongside AZ-104]
│   └── AI-102 (AI Engineer) [AZ-204 secondary]
├── DP-203 (Data Engineer) [recommended]
└── AI-102 (AI Engineer) [recommended]
```

## Prerequisite Rules

### Strict Prerequisites (Must have before attempting)
| Target Cert | Required Prerequisite | Rule |
|------------|----------------------|------|
| CERT-AZ400 | CERT-AZ104 OR CERT-AZ204 | At least one Associate-level Azure cert |
| CERT-AZ305 | CERT-AZ104 | Administrator knowledge mandatory for architecture |

### Recommended Prerequisites (Should have, not enforced)
| Target Cert | Recommended | Rationale |
|------------|-------------|-----------|
| CERT-AZ104 | CERT-AZ900 | Fundamentals provide Azure vocabulary foundation |
| CERT-AZ204 | CERT-AZ900 | Same as above |
| CERT-AZ500 | CERT-AZ104 | Security builds on administration concepts |
| CERT-DP203 | CERT-AZ900 | Basic Azure understanding for data platform context |
| CERT-AI102 | CERT-AZ900 | Basic Azure understanding for AI services context |
| CERT-AZ305 | CERT-AZ204 | Development knowledge strengthens architecture design |

## Study Plan Generator Rules

When generating a study plan, the planner should:

1. **Check strict prerequisites:** If learner lacks a strict prerequisite, either:
   - Add prerequisite to the plan before the target cert
   - Recommend completing prerequisite first (extend timeline)
   - Alert the learner about the gap

2. **Check recommended prerequisites:** If learner lacks a recommended prerequisite:
   - Include foundational content in the first 2 weeks of the plan
   - Do not block the plan but note increased difficulty
   - Allocate 10-15% more study hours for compensating

3. **Optimal certification sequence by role:**
   - Cloud Engineer: AZ-900 → AZ-204 → AZ-305
   - DevOps Engineer: AZ-900 → AZ-104 → AZ-400
   - Data Engineer: AZ-900 → DP-203
   - Security Engineer: AZ-900 → AZ-104 → AZ-500
   - AI Engineer: AZ-900 → AI-102 (+ AZ-204 secondary)
   - Solutions Architect: AZ-900 → AZ-104 → AZ-204 → AZ-305

4. **Time between certifications:**
   - Minimum gap: 2 weeks (recovery and consolidation)
   - Recommended gap: 4-6 weeks (especially between Associate → Expert)
   - Maximum gap before refresher needed: 6 months

## Prerequisite Knowledge Areas

When a learner attempts a cert without the recommended prerequisite, the following knowledge areas should receive extra attention in the study plan:

### AZ-204 without AZ-900
- Azure resource hierarchy and management
- Subscription and billing concepts
- Basic networking (VNets, NSGs)
- Storage account types and access tiers

### AZ-400 without AZ-104
- Azure resource management (ARM)
- Virtual networking and DNS
- Azure Active Directory basics
- Resource monitoring and alerting

### AZ-500 without AZ-104
- Azure AD and identity management
- Network topology and architecture
- Azure Policy and governance
- Resource group and subscription management

### AZ-305 without AZ-204
- Application hosting options (App Service, Functions, Containers)
- Data storage options (SQL, Cosmos, Blob)
- Authentication patterns (MSAL, Managed Identity)
- Event-driven architecture (Event Grid, Service Bus)
