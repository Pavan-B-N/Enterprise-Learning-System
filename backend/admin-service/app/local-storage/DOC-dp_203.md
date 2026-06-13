# DP-203: Data Engineering on Microsoft Azure — Study Guide

## Exam Overview

| Detail | Info |
|--------|------|
| **Certification** | Microsoft Certified: Azure Data Engineer Associate |
| **Exam Code** | DP-203 |
| **Duration** | 120 minutes |
| **Questions** | 40–60 |
| **Passing Score** | 700/1000 |
| **Cost** | $165 USD |
| **Renewal** | Annual |

## Skills Measured

### 1. Design and Implement Data Storage (15–20%)

- Design a data storage structure (data lake zones: raw/enriched/curated)
- Design the serving layer (star schema, aggregations, materialized views)
- Implement physical data storage (Parquet, Delta Lake, partitioning)

### 2. Develop Data Processing (40–45%)

- Ingest and transform data using Azure Data Factory/Synapse pipelines
- Develop batch processing solutions (Spark, Synapse, Databricks)
- Develop stream processing solutions (Stream Analytics, Event Hubs, Spark Streaming)
- Manage data pipelines (monitoring, error handling, dependencies)

### 3. Secure, Monitor, and Optimize Data Storage and Processing (30–40%)

- Implement data security (encryption, masking, row-level security, RBAC)
- Monitor data processing (Azure Monitor, Spark UI, pipeline monitoring)
- Optimize and troubleshoot data processing (partition strategies, caching, skew)

## Study Strategy

1. **Spark is king**: Master PySpark DataFrame operations and optimizations
2. **Data Factory**: Know pipeline activities, data flows, linked services
3. **Delta Lake**: Understand ACID transactions, time travel, MERGE operations
4. **Lake architecture**: Medallion pattern (Bronze → Silver → Gold)

## Key Resources

- [Microsoft Learn: DP-203 Path](https://learn.microsoft.com/en-us/training/paths/data-engineering-azure/)
- [Azure Synapse Documentation](https://learn.microsoft.com/en-us/azure/synapse-analytics/)
- [Delta Lake Documentation](https://docs.delta.io/)

## Exam Tips

- Know partition strategies for different scenarios (date-based, hash, range)
- Spark optimization: broadcast joins, caching, AQE (Adaptive Query Execution)
- Data Factory vs Synapse Pipelines — largely identical, know the differences
- Slowly Changing Dimensions (SCD Type 1, 2, 3) — implementation in Spark
- Security: Column-level, row-level security, dynamic data masking in Synapse
