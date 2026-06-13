# AZ-140: Configuring and Operating Microsoft Azure Virtual Desktop — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Virtual Desktop Specialty |
| **Exam Code** | AZ-140 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Skills Measured

### 1. Plan and Implement an Azure Virtual Desktop Infrastructure (25–30%)

- Design AVD architecture (host pools, session hosts, workspace topology)
- Design for user identities and profiles (FSLogix, profile containers)
- Design network and storage for AVD
- Plan for session host image management (golden image, Shared Image Gallery)

### 2. Implement and Manage Networking and Storage (15–20%)

- Implement and manage network connectivity (VNet, NSG, Azure Firewall for AVD)
- Manage storage for FSLogix profile containers (Azure Files, Azure NetApp Files)

### 3. Implement Host Pools and Session Hosts (25–30%)

- Configure host pools and session hosts (pooled vs personal)
- Manage session host images (capture, replicate, update)
- Manage auto-scaling and load balancing
- Manage host pool assignments and drain mode

### 4. Manage Access and Security (10–15%)

- Plan and implement RBAC and Conditional Access for AVD
- Manage user sessions (disconnect, log off, send message)
- Configure screen capture protection and watermarking

### 5. Manage User Environments and Apps (15–20%)

- Implement and manage FSLogix
- Implement and manage app delivery (MSIX App Attach, RemoteApp)
- Configure user experience settings

## Study Strategy

1. **Architecture**: Understand the full AVD component model
2. **FSLogix**: Profile container configuration is heavily tested
3. **Networking**: Know connectivity requirements for AVD
4. **Scaling**: Understand depth-first vs breadth-first load balancing

## Exam Tips

- Host pool types: pooled (shared sessions) vs personal (dedicated)
- FSLogix: VHDLocations, profile container vs office container
- MSIX App Attach: know the workflow (stage, register, deregister, destage)
- Scaling plans: peak vs off-peak hours, ramp-up/ramp-down
