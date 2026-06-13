# AZ-700: Designing and Implementing Microsoft Azure Networking Solutions — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Network Engineer Associate |
| **Exam Code** | AZ-700 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Skills Measured

### 1. Design, Implement, and Manage Hybrid Networking (20–25%)

- Design and implement VPN connectivity (S2S, P2S, VPN Gateway SKUs)
- Design and implement Azure ExpressRoute (circuits, peering, Global Reach)
- Design and implement Virtual WAN

### 2. Design and Implement Core Networking Infrastructure (20–25%)

- Design and implement VNets (address spaces, subnets, delegation)
- Design and implement routing (UDR, BGP, NVA, Route Server)
- Design and implement VNet peering (regional, global, transitive routing)

### 3. Design and Implement Routing (25–30%)

- Design and implement Azure Load Balancer (Standard, internal/external)
- Design and implement Azure Application Gateway (WAF, URL routing, SSL)
- Design and implement Azure Front Door (global load balancing, CDN, WAF)
- Design and implement Azure Traffic Manager (DNS-based routing methods)

### 4. Secure and Monitor Networks (15–20%)

- Design and implement Azure Firewall (rules, DNAT, threat intelligence)
- Design and implement NSGs and Azure DDoS Protection
- Design and implement network monitoring (Network Watcher, Connection Monitor)

## Study Strategy

1. **Draw diagrams**: Networking is visual — sketch topologies
2. **Hub-spoke**: Master this architecture pattern for enterprise networking
3. **Routing**: Understand UDR, system routes, and BGP propagation
4. **Compare services**: Load Balancer vs App Gateway vs Front Door vs Traffic Manager

## Exam Tips

- Know which SKU of VPN Gateway supports which scenarios
- ExpressRoute: private peering vs Microsoft peering
- Hub-spoke with Azure Firewall is the most tested architecture
- Application Gateway v2 is zone-redundant; v1 is not
- Network Watcher tools: IP flow verify, next hop, connection troubleshoot
