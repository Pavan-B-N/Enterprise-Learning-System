# AZ-305: Designing Microsoft Azure Infrastructure Solutions — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Solutions Architect Expert |
| **Exam Code** | AZ-305 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 (includes case studies) |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Prerequisites** | AZ-104 recommended |
| **Renewal** | Annual |

## Target Audience

Azure Solutions Architects design cloud and hybrid solutions that run on Azure, including compute, network, storage, monitoring, and security. They translate business requirements into secure, scalable, reliable solutions.

## Skills Measured

### 1. Design Identity, Governance, and Monitoring Solutions (25–30%)

- Design solutions for authentication (Microsoft Entra ID, B2C, B2B)
- Design authorization solutions (RBAC, ABAC, PIM)
- Design governance solutions (Management Groups, Policy, Blueprints)
- Design monitoring solutions (Azure Monitor, Log Analytics, Application Insights)

### 2. Design Data Storage Solutions (25–30%)

- Design data storage solutions for relational data (Azure SQL, PostgreSQL, MySQL)
- Design data storage for non-relational data (Cosmos DB, Table Storage, Redis)
- Design data integration (Data Factory, Synapse, Event Hubs)
- Design data protection and recovery strategies

### 3. Design Business Continuity Solutions (10–15%)

- Design for high availability (Availability Zones, paired regions)
- Design backup and disaster recovery (Azure Backup, Site Recovery)
- Design for data redundancy and failover

### 4. Design Infrastructure Solutions (25–30%)

- Design compute solutions (VMs, App Service, AKS, Functions — when to use which)
- Design networking solutions (hub-spoke, VPN, ExpressRoute, Private Link)
- Design application architecture (microservices, event-driven, serverless)
- Design migrations (Azure Migrate, Database Migration Service)

## Study Strategy

1. **Think architect**: Focus on trade-offs, not implementation details
2. **Case studies**: Practice analyzing requirements and selecting services
3. **Well-Architected Framework**: Know all 5 pillars deeply
4. **Decision trees**: When to choose Cosmos DB vs SQL, AKS vs App Service, etc.

## Key Resources

- [Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)
- [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/)
- [Cloud Adoption Framework](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/)

## Exam Tips

- Case study sections cannot be revisited — read thoroughly before answering
- Questions test "best" solution given constraints (cost, performance, security)
- Know Azure service limits (max VMs per scale set, storage account limits)
- Hybrid scenarios are common — know Azure Arc, VPN, ExpressRoute
- SLA calculations for multi-tier architectures (multiply individual SLAs)
