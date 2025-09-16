# Azure Deployment Guide for Yoruba Cinemax

This guide provides step-by-step instructions for deploying the Yoruba Cinemax movie streaming platform to Microsoft Azure.

## Architecture Overview

The application is deployed as:
- **Azure App Service**: Hosts the web application and API
- **Azure Container Instance** or **WebJob**: Runs the Telegram bot independently
- **Azure Cosmos DB** (optional): For scalable data storage
- **Azure Blob Storage** (optional): For media files and posters

## Prerequisites

1. **Azure Account**: Active Azure subscription
2. **Azure CLI**: Install and configure Azure CLI
3. **Node.js 18+**: Required for local development and testing
4. **GitHub Account**: For automated deployments (optional)

## Deployment Options

### Option 1: Azure App Service (Recommended)

#### Step 1: Create Azure App Service

```bash
# Login to Azure
az login

# Create resource group
az group create --name yoruba-cinemax-rg --location "East US"

# Create App Service plan
az appservice plan create --name yoruba-cinemax-plan --resource-group yoruba-cinemax-rg --sku B1 --is-linux

# Create web app
az webapp create --name yoruba-cinemax-app --resource-group yoruba-cinemax-rg --plan yoruba-cinemax-plan --runtime "NODE|18-lts"
```

#### Step 2: Configure Environment Variables

Set the following in Azure App Service → Configuration → Application settings:

**Required Variables:**
```bash
NODE_ENV=production
WEBSITE_NODE_DEFAULT_VERSION=18.x
SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

**Azure OpenAI (Optional):**
```bash
AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
```

**Telegram Bot:**
```bash
TELEGRAM_BOT_TOKEN=your-bot-token
BOT_MODE=polling
ADMIN_CHAT_IDS=admin-chat-id-1,admin-chat-id-2
```

**Storage (Optional - for Azure services):**
```bash
STORAGE_TYPE=json
# For Azure storage (future):
# STORAGE_TYPE=azure
# COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
# COSMOS_KEY=your-cosmos-key
# AZURE_STORAGE_CONNECTION_STRING=your-blob-connection-string
```

#### Step 3: Deploy from GitHub (Automated)

1. Fork this repository to your GitHub account
2. In Azure App Service → Deployment Center:
   - Source: GitHub
   - Repository: your-forked-repo
   - Branch: main
   - Build provider: GitHub Actions

3. Azure will automatically create a GitHub Actions workflow
4. Add the following secrets to your GitHub repository:
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: Download from Azure App Service

#### Step 4: Manual Deployment

```bash
# Build the application locally
npm install
npm run build

# Deploy using Azure CLI
az webapp deploy --resource-group yoruba-cinemax-rg --name yoruba-cinemax-app --src-path ./dist --type zip
```

### Option 2: Deploy Bot Separately

#### Using Azure Container Instance

```bash
# Build Docker image for bot
docker build -f Dockerfile.bot -t yoruba-cinemax-bot .

# Tag for Azure Container Registry
docker tag yoruba-cinemax-bot your-registry.azurecr.io/yoruba-cinemax-bot:latest

# Push to registry
docker push your-registry.azurecr.io/yoruba-cinemax-bot:latest

# Create container instance
az container create --resource-group yoruba-cinemax-rg --name yoruba-cinemax-bot --image your-registry.azurecr.io/yoruba-cinemax-bot:latest --environment-variables TELEGRAM_BOT_TOKEN=your-token NODE_ENV=production
```

#### Using WebJob

1. Build the bot: `npm run build`
2. Zip the `dist/bot-standalone.js` file
3. In Azure App Service → WebJobs → Add:
   - Name: yoruba-cinemax-bot
   - File Upload: your-zip-file
   - Type: Continuous
   - Command: `node bot-standalone.js`

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Environment mode | `production` |
| `PORT` | No | Server port (auto-set by Azure) | `8080` |
| `AZURE_OPENAI_ENDPOINT` | No | Azure OpenAI endpoint | `https://your-resource.openai.azure.com/` |
| `AZURE_OPENAI_API_KEY` | No | Azure OpenAI API key | `your-api-key` |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | No | Model deployment name | `gpt-35-turbo` |
| `TELEGRAM_BOT_TOKEN` | For bot | Telegram bot token | `123456:ABC-DEF...` |
| `BOT_MODE` | No | Bot mode (polling/webhook) | `polling` |
| `ADMIN_CHAT_IDS` | No | Admin user IDs | `123456789,987654321` |
| `STORAGE_TYPE` | No | Storage backend | `json` or `azure` |
| `YOUTUBE_API_KEY` | No | YouTube API key | `your-youtube-key` |

## Storage Migration (Optional)

To migrate from JSON files to Azure services:

### Azure Cosmos DB Setup

```bash
# Create Cosmos DB account
az cosmosdb create --name yoruba-cinemax-cosmos --resource-group yoruba-cinemax-rg --kind GlobalDocumentDB --locations regionName="East US" failoverPriority=0 isZoneRedundant=False

# Create database
az cosmosdb sql database create --account-name yoruba-cinemax-cosmos --resource-group yoruba-cinemax-rg --name YorubaCinemax

# Create containers
az cosmosdb sql container create --account-name yoruba-cinemax-cosmos --resource-group yoruba-cinemax-rg --database-name YorubaCinemax --name movies --partition-key-path "/id"
az cosmosdb sql container create --account-name yoruba-cinemax-cosmos --resource-group yoruba-cinemax-rg --database-name YorubaCinemax --name users --partition-key-path "/id"
```

### Azure Blob Storage Setup

```bash
# Create storage account
az storage account create --name yorubacinemax --resource-group yoruba-cinemax-rg --location "East US" --sku Standard_LRS

# Create container for posters
az storage container create --name posters --account-name yorubacinemax
```

## Monitoring and Health Checks

### Health Endpoint
The application includes a health check endpoint at `/health`:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "yoruba-cinemax",
  "version": "1.0.0",
  "uptime": 3600,
  "azure": {
    "openai": "configured",
    "port": 8080
  }
}
```

### Application Insights (Optional)

```bash
# Create Application Insights
az monitor app-insights component create --app yoruba-cinemax-insights --location "East US" --resource-group yoruba-cinemax-rg
```

Add to environment variables:
```bash
APPINSIGHTS_INSTRUMENTATIONKEY=your-instrumentation-key
```

## Security Considerations

1. **Environment Variables**: Store all secrets in Azure App Service Application Settings
2. **HTTPS**: Enable HTTPS Only in Azure App Service
3. **Custom Domain**: Configure custom domain with SSL certificate
4. **CORS**: Update CORS settings for production domains
5. **Rate Limiting**: Monitor and adjust rate limiting as needed

## Troubleshooting

### Common Issues

**Build Failures:**
- Ensure Node.js version is 18+
- Check that all dependencies are installed
- Verify TypeScript compilation succeeds locally

**Bot Not Starting:**
- Verify `TELEGRAM_BOT_TOKEN` is set correctly
- Check Azure Container Instance or WebJob logs
- Ensure bot has proper permissions

**AI Features Not Working:**
- Verify all Azure OpenAI environment variables are set
- Check API key permissions and quotas
- Monitor Azure OpenAI service limits

### Logs and Debugging

**App Service Logs:**
```bash
# Stream logs
az webapp log tail --name yoruba-cinemax-app --resource-group yoruba-cinemax-rg

# Download logs
az webapp log download --name yoruba-cinemax-app --resource-group yoruba-cinemax-rg
```

**Container Instance Logs:**
```bash
az container logs --name yoruba-cinemax-bot --resource-group yoruba-cinemax-rg
```

## Cost Optimization

- **App Service Plan**: Start with B1 (Basic) tier, scale as needed
- **Cosmos DB**: Use serverless for variable workloads
- **Blob Storage**: Use Cool tier for infrequently accessed files
- **Monitor Usage**: Set up billing alerts and cost analysis

## Scaling Considerations

- **App Service**: Enable auto-scaling based on CPU/memory
- **Bot**: Single instance sufficient for most Telegram bots
- **Database**: Consider Cosmos DB for global distribution
- **CDN**: Add Azure CDN for static assets and media files

## Support

For deployment issues:
1. Check Azure service health status
2. Review application logs in Azure portal
3. Monitor resource utilization
4. Test locally to isolate Azure-specific issues

---

**Note**: This application uses JSON file storage by default. For production deployments with multiple instances, consider migrating to Azure Cosmos DB and Blob Storage using the provided storage abstraction layer.