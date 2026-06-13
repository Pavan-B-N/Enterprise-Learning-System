# PL-400: Microsoft Power Platform Developer — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Power Platform Developer Associate |
| **Exam Code** | PL-400 |
| **Duration** | 100 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Skills Measured

### 1. Create a Technical Design (10–15%)

- Validate requirements and design a technical architecture
- Design solution components (entities, relationships, business logic)
- Design integrations with external systems

### 2. Configure Microsoft Dataverse (10–15%)

- Configure tables (standard, activity, virtual)
- Configure columns and relationships
- Configure security roles and business units

### 3. Create and Configure Power Apps (20–25%)

- Create and configure model-driven apps
- Create and configure canvas apps
- Create and configure Power Pages

### 4. Configure Business Process Automation with Power Automate (20–25%)

- Create and configure cloud flows (automated, instant, scheduled)
- Create custom connectors
- Create and configure desktop flows (RPA)

### 5. Extend the Platform (25–30%)

- Create Power Apps Component Framework (PCF) controls
- Create plug-ins and custom workflow activities
- Implement client scripting (JavaScript, TypeScript for model-driven apps)
- Create and manage solutions (ALM, solution layers)

## Study Strategy

1. **PCF controls**: Build at least one custom control from scratch
2. **Plug-ins**: Understand the execution pipeline and registration
3. **Solutions**: Master solution layers, managed vs unmanaged
4. **Custom connectors**: OpenAPI spec, authentication types

## Exam Tips

- PCF: know the manifest, control lifecycle (init, updateView, getOutputs, destroy)
- Plug-in pipeline: pre-validation → pre-operation → main → post-operation
- Solution layers: managed baseline → managed patches → unmanaged customizations
- Custom connectors: OAuth 2.0 configuration for external APIs
