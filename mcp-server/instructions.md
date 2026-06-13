# MCP Server — Build & Deploy to Azure Container Instance

## Prerequisites

- Docker installed locally
- Azure CLI (`az`) logged in
- An Azure Container Registry (ACR) created

## 1. Build the Container Image

```bash
cd mcp-server
docker build -t els-mcp-server:latest .
```

## 2. Tag for ACR

```bash
docker tag els-mcp-server:latest <your-acr>.azurecr.io/els-mcp-server:latest
```

## 3. Push to ACR

```bash
az acr login --name <your-acr>
docker push <your-acr>.azurecr.io/els-mcp-server:latest
```

## 4. Deploy to Azure Container Instance

```bash
az container create \
  --resource-group <your-rg> \
  --name els-mcp-server \
  --image <your-acr>.azurecr.io/els-mcp-server:latest \
  --ports 8010 \
  --dns-name-label els-mcp-server \
  --environment-variables \
    MONGODB_URI="mongodb+srv://<username>:<password>@<host>/<db>?retryWrites=true&w=majority" \
    MONGODB_DB="enterprise_learning" \
  --registry-login-server <your-acr>.azurecr.io \
  --registry-username <acr-username> \
  --registry-password <acr-password>
```

## 5. Verify

```bash
az container show --resource-group <your-rg> --name els-mcp-server --query "ipAddress.fqdn" -o tsv
```

MCP endpoint: `http://<fqdn>:8010/mcp`

## 6. Connect from Azure AI Foundry

In your Foundry agent configuration, add the MCP server URL:

```
http://<fqdn>:8010/mcp
```
