# DP-300: Administering Microsoft Azure SQL Solutions — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Database Administrator Associate |
| **Exam Code** | DP-300 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Skills Measured

### 1. Plan and Implement Data Platform Resources (20–25%)

- Deploy Azure SQL Database, SQL Managed Instance, and SQL Server on VMs
- Configure deployment options (purchasing models, service tiers, elastic pools)
- Implement database and server-level firewall rules and VNet connectivity

### 2. Implement a Secure Environment (15–20%)

- Configure authentication (Azure AD/Entra, SQL auth, contained users)
- Configure authorization (database roles, schemas, permissions)
- Implement data protection (TDE, Always Encrypted, dynamic data masking)
- Implement compliance controls (auditing, Advanced Threat Protection)

### 3. Monitor, Configure, and Optimize Database Resources (30–35%)

- Monitor database performance (DMVs, Query Store, Intelligent Insights)
- Configure resources for optimal performance (indexing, statistics, query hints)
- Implement intelligent performance features (Automatic Tuning, Query Store)
- Troubleshoot performance issues (blocking, deadlocks, wait stats)

### 4. Configure and Manage Automation of Tasks (15–20%)

- Create and manage automation tasks (elastic jobs, SQL Agent)
- Implement database maintenance (index rebuild, consistency checks)
- Automate deployment (Azure DevOps, CI/CD for databases)

### 5. Plan and Configure High Availability and Disaster Recovery (20–25%)

- Plan for high availability (active geo-replication, auto-failover groups)
- Configure backup strategies (PITR, LTR, geo-redundant backup)
- Implement DR solutions (Azure SQL geo-restore, failover)

## Study Strategy

1. **Query Performance**: DMVs, Query Store, execution plans are critical
2. **HA/DR**: Understand all options and their RPO/RTO guarantees
3. **Security layers**: Authentication → Authorization → Encryption → Auditing
4. **Comparison**: SQL Database vs SQL MI vs SQL Server on VM — when to use each

## Exam Tips

- Service tiers: DTU-based (Basic/Standard/Premium) vs vCore (GP/BC/Hyperscale)
- Query Store: know how to identify regressed queries and force plans
- Elastic pools: shared resources across databases — sizing considerations
- Geo-replication vs failover groups — failover groups provide automatic failover
- Always Encrypted: client-side encryption — know its limitations
