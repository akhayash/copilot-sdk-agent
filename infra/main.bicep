@description('Base name for all resources')
param appName string = 'copilot-sdk-agent'

@description('Location for all resources')
param location string = resourceGroup().location

// --- Image generation (Azure Foundry gpt-image-2) ---
// Phase 7.2: image-then-pptx mode is opt-in. Leave azureImageEndpoint empty to disable.
@description('Azure Foundry endpoint for gpt-image-2 (e.g. https://<account>.cognitiveservices.azure.com). Empty disables image-then-pptx.')
param azureImageEndpoint string = ''

@description('Azure Foundry image deployment name')
param azureImageDeployment string = 'gpt-image-2'

@description('Azure Foundry image API version')
param azureImageApiVersion string = '2025-04-01-preview'

@description('Image client auth mode: "entra" (managed identity, default) or "key" (uses AZURE_IMAGE_API_KEY secret).')
@allowed([
  'entra'
  'key'
])
param imageAuthMode string = 'entra'

@description('Vision model deployment used for bbox extraction via Copilot SDK attachments (DR-11).')
param bboxVisionModel string = 'gpt-4o'

@description('Concurrency cap for bbox vision calls per request (DR-13).')
param bboxVisionConcurrency string = '3'

@description('Concurrency cap for LibreOffice headless conversion per instance (DD-16). Safe default for 2 GiB memory.')
param libreOfficeConcurrency string = '1'

@description('Container image reference (registry/path:tag). On first deploy use a placeholder; GitHub Actions overrides via `az containerapp update --image`.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// --- Foundry role assignment (optional) ---
@description('Name of the Foundry Cognitive Services account (in this resource group) to grant Cognitive Services User to the Container App managed identity. Empty skips the role assignment. For cross-RG Foundry resources, manage the role assignment outside this template.')
param foundryAccountName string = ''

// --- Azure Container Registry ---
var acrName = replace('acr${appName}', '-', '')

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// --- Log Analytics Workspace ---
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${appName}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// --- Container Apps Environment ---
resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-${appName}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// --- Container App ---
// Phase 7.2: owns Container App spec so env vars, scale, and resources are IaC-managed.
// GitHub Actions still rolls the `image` via `az containerapp update --image` (containerImage param above
// holds the placeholder used only when this stack provisions from scratch).
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${appName}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.name
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: containerImage
          resources: {
            // 1.0 vCPU / 2.0 GiB: LibreOffice 200-400 MB + 1-2 concurrent vision/bbox => 1.2-1.6 GiB peak.
            cpu: json('1.0')
            memory: '2.0Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'HOSTNAME'
              value: '0.0.0.0'
            }
            // Image-then-pptx mode (Phase 3+4)
            {
              name: 'AZURE_IMAGE_ENDPOINT'
              value: azureImageEndpoint
            }
            {
              name: 'AZURE_IMAGE_DEPLOYMENT'
              value: azureImageDeployment
            }
            {
              name: 'AZURE_IMAGE_API_VERSION'
              value: azureImageApiVersion
            }
            {
              name: 'IMAGE_AUTH_MODE'
              value: imageAuthMode
            }
            {
              name: 'BBOX_VISION_MODEL'
              value: bboxVisionModel
            }
            {
              name: 'BBOX_VISION_CONCURRENCY'
              value: bboxVisionConcurrency
            }
            {
              name: 'LIBREOFFICE_CONCURRENCY'
              value: libreOfficeConcurrency
            }
          ]
        }
      ]
      scale: {
        // DD-04: force minReplicas=1 to avoid soffice cold-start cost (5-10s first conversion).
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// --- Role assignment: Cognitive Services User on Foundry account ---
// Granted to the Container App system-assigned managed identity when both
// foundryAccountName and azureImageEndpoint are provided.
var cognitiveServicesUserRoleDefinitionId = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = if (!empty(foundryAccountName)) {
  name: foundryAccountName
}

resource foundryRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(foundryAccountName) && !empty(azureImageEndpoint)) {
  name: guid(foundryAccount.id, containerApp.id, cognitiveServicesUserRoleDefinitionId)
  scope: foundryAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleDefinitionId)
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// --- Outputs ---
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output environmentName string = containerEnv.name
output containerAppName string = containerApp.name
output containerAppPrincipalId string = containerApp.identity.principalId
