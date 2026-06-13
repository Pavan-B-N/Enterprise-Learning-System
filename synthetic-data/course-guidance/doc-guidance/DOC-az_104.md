# AZ-104: Microsoft Azure Administrator — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Administrator Associate |
| **Exam Code** | AZ-104 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual (free on Microsoft Learn) |

## Target Audience

Azure Administrators implement, manage, and monitor an organization's Azure environment, including virtual networks, storage, compute, identity, security, and governance.

## Skills Measured

### 1. Manage Azure Identities and Governance (20–25%)

- Create users and groups in Microsoft Entra ID
- Manage licenses and external identities
- Configure RBAC roles and custom roles
- Manage subscriptions and governance (Azure Policy, resource locks, tags)

### 2. Implement and Manage Storage (15–20%)

- Configure storage accounts (redundancy, access tiers, lifecycle)
- Manage blob storage and Azure Files
- Configure SAS tokens, stored access policies
- Manage storage security (encryption, network access)

### 3. Deploy and Manage Azure Compute Resources (20–25%)

- Automate VM deployment using ARM/Bicep templates
- Configure VMs (sizing, disks, networking, extensions)
- Manage App Service plans and web apps
- Manage container solutions (ACI, AKS basics)

### 4. Implement and Manage Virtual Networking (15–20%)

- Configure VNets, subnets, and VNet peering
- Configure NSGs and Application Security Groups
- Configure Azure DNS and private DNS zones
- Configure VPN Gateway and ExpressRoute

### 5. Monitor and Maintain Azure Resources (10–15%)

- Configure Azure Monitor and Log Analytics
- Create and manage alerts and action groups
- Configure backup and recovery (Azure Backup, ASR)
- Implement Azure VM monitoring

## Study Strategy

1. **Hands-on first**: This exam is practical — use an Azure subscription
2. **Lab exercises**: Create VMs, configure networking, set up storage
3. **ARM templates**: Practice reading and modifying JSON templates
4. **PowerShell/CLI**: Know both for common admin tasks

## Key Resources

- [Microsoft Learn: AZ-104 Learning Path](https://learn.microsoft.com/en-us/training/paths/az-104-administrator-prerequisites/)
- [Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/)
- [Azure CLI Reference](https://learn.microsoft.com/en-us/cli/azure/)

## Exam Tips

- Expect case study questions with multiple requirements
- Know PowerShell and CLI syntax for common operations
- Understand when to use ARM templates vs Bicep
- RBAC inheritance through scope hierarchy is frequently tested
- Storage redundancy options (LRS/ZRS/GRS/GZRS) — know when to use each
