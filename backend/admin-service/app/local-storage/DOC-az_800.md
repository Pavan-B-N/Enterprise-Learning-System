# AZ-800: Administering Windows Server Hybrid Core Infrastructure — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Windows Server Hybrid Administrator Associate |
| **Exam Code** | AZ-800 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Prerequisites** | Paired with AZ-801 |
| **Renewal** | Annual |

## Skills Measured

### 1. Deploy and Manage Active Directory Domain Services (30–35%)

- Deploy and manage AD DS domain controllers
- Configure and manage multi-site AD DS and AD DS replication
- Create and manage AD DS security groups and organizational units
- Implement and manage Group Policy

### 2. Manage Windows Servers and Workloads in a Hybrid Environment (10–15%)

- Manage Windows Servers using Windows Admin Center and remote management
- Manage Windows Servers using Azure Arc and Azure services
- Manage VMs on-premises (Hyper-V) and in Azure

### 3. Manage Virtual Machines and Containers (10–15%)

- Manage Hyper-V virtual machines (create, configure, checkpoints, replication)
- Manage Windows containers (Docker, Windows Server containers, Hyper-V isolation)
- Manage Azure VMs running Windows Server

### 4. Implement and Manage an On-premises and Hybrid Networking Infrastructure (15–20%)

- Implement on-premises DNS (zones, records, conditional forwarding)
- Manage IP addressing (DHCP, IPAM)
- Implement on-premises and hybrid name resolution

### 5. Manage Storage and File Services (15–20%)

- Configure Windows Server storage (Storage Spaces, Storage Replica)
- Configure and manage Windows file server (DFS, FSRM, BranchCache)
- Configure Azure File Sync and Azure files integration

## Study Strategy

1. **Hybrid focus**: Every topic has an Azure integration angle
2. **AD DS**: Still core — know domain controllers, GPO, replication
3. **PowerShell**: Many tasks tested via PowerShell commands
4. **Azure Arc**: Extending Azure management to on-premises servers

## Exam Tips

- Group Policy inheritance: site → domain → OU (last applied wins)
- Azure AD Connect sync types: password hash sync, pass-through auth, federation
- Storage Spaces Direct for HCI vs Storage Spaces for standalone
- DFS Namespaces vs DFS Replication — different features
- Azure File Sync: cloud tiering, sync groups, server endpoints
