# AZ-204: Developing Solutions for Microsoft Azure — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Developer Associate |
| **Exam Code** | AZ-204 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Target Audience

Azure Developers design, build, test, and maintain cloud applications and services on Microsoft Azure. They participate in all phases of cloud development from requirements to deployment and monitoring.

## Skills Measured

### 1. Develop Azure Compute Solutions (25–30%)

- Implement containerized solutions (ACR, ACI, Azure Container Apps)
- Implement Azure App Service web apps (create, configure, deploy, scale)
- Implement Azure Functions (triggers, bindings, Durable Functions)

### 2. Develop for Azure Storage (15–20%)

- Develop solutions using Azure Cosmos DB (CRUD, configure consistency, change feed)
- Develop solutions using Azure Blob Storage (lifecycle, metadata, SDK)

### 3. Implement Azure Security (20–25%)

- Implement user authentication and authorization (Microsoft Identity Platform, MSAL)
- Implement secure cloud solutions (Key Vault, Managed Identity, App Configuration)

### 4. Monitor, Troubleshoot, and Optimize (15–20%)

- Implement caching (Azure Cache for Redis, CDN)
- Troubleshoot using Application Insights
- Implement API Management policies

### 5. Connect to and Consume Azure Services (15–20%)

- Implement API Management
- Develop event-based solutions (Event Grid, Event Hubs)
- Develop message-based solutions (Service Bus, Queue Storage)

## Study Strategy

1. **Code-heavy**: Write actual code using Azure SDKs (.NET, Python, or Node.js)
2. **Know the SDKs**: BlobServiceClient, CosmosClient, SecretClient patterns
3. **Triggers & Bindings**: Know all Azure Functions trigger types
4. **Auth flows**: Understand OAuth 2.0, MSAL, and Managed Identity

## Key Resources

- [Microsoft Learn: AZ-204 Path](https://learn.microsoft.com/en-us/training/paths/create-azure-app-service-web-apps/)
- [Azure SDK for .NET](https://learn.microsoft.com/en-us/dotnet/azure/)
- [Azure Functions documentation](https://learn.microsoft.com/en-us/azure/azure-functions/)

## Exam Tips

- Code snippets are common — know SDK method signatures
- Cosmos DB consistency levels are frequently tested
- Know the difference between Event Grid, Event Hubs, and Service Bus
- Managed Identity is preferred over connection strings — know when to use it
- Durable Functions orchestration patterns (fan-out/fan-in, chaining, human interaction)
