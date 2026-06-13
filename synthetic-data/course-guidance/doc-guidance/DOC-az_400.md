# AZ-400: Designing and Implementing Microsoft DevOps Solutions — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: DevOps Engineer Expert |
| **Exam Code** | AZ-400 |
| **Duration** | 120 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Prerequisites** | AZ-104 or AZ-204 |
| **Renewal** | Annual |

## Target Audience

DevOps Engineers combine people, process, and technologies to continuously deliver valuable products and services that meet end user needs and business objectives.

## Skills Measured

### 1. Configure Processes and Communications (10–15%)

- Configure activity traceability and flow of work
- Configure collaboration and communication (Azure Boards, wikis, dashboards)

### 2. Design and Implement Source Control (15–20%)

- Design and implement branching strategies (GitFlow, trunk-based, release flow)
- Configure repositories (permissions, policies, branch protection)
- Manage and integrate source control (Git, GitHub, Azure Repos)

### 3. Design and Implement Build and Release Pipelines (40–45%)

- Design and implement pipeline automation (YAML pipelines, multi-stage)
- Design and implement package management (Azure Artifacts, NuGet, npm)
- Design and implement deployments (blue-green, canary, ring-based, feature flags)
- Design and implement infrastructure as code (ARM, Bicep, Terraform)
- Maintain pipelines (agents, security, retention, cost)

### 4. Develop a Security and Compliance Plan (10–15%)

- Design and implement authentication/authorization strategies
- Design and implement sensitive information management (Key Vault, secrets)
- Automate security and compliance scanning (SAST, DAST, SCA)

### 5. Implement an Instrumentation Strategy (10–15%)

- Configure monitoring for DevOps (Application Insights, Azure Monitor)
- Analyze metrics from instrumentation
- Configure alerts and notifications

## Study Strategy

1. **Pipeline mastery**: Write complex YAML pipelines from scratch
2. **Branching**: Practice GitFlow and trunk-based development
3. **IaC**: Deploy infrastructure using Terraform AND Bicep
4. **Security**: Integrate security scanning into pipelines

## Key Resources

- [Microsoft Learn: AZ-400 Path](https://learn.microsoft.com/en-us/training/paths/az-400-develop-instrumentation-strategy/)
- [Azure Pipelines YAML Reference](https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Exam Tips

- Pipeline YAML syntax is heavily tested — know stages, jobs, steps, conditions
- Understand deployment strategies and when to use each
- Know the difference between Azure DevOps and GitHub features
- Security scanning tools: WhiteSource/Mend, SonarQube, OWASP ZAP
- Feature flags with Azure App Configuration or LaunchDarkly
