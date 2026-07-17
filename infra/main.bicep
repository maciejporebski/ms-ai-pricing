targetScope = 'resourceGroup'

@description('The globally unique name of the Azure Static Web App.')
@minLength(2)
param staticWebAppName string

@description('The Azure region for the Static Web App.')
param location string = resourceGroup().location

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
