targetScope = 'resourceGroup'

@description('The globally unique name of the Azure Static Web App.')
@minLength(2)
param staticWebAppName string

@description('The Azure region for the Static Web App.')
param location string = resourceGroup().location

@description('Optional custom domain to associate with the Static Web App.')
param customDomain string = ''

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

resource staticWebAppCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = if (customDomain != '') {
  parent: staticWebApp
  name: customDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output staticWebAppName string = staticWebApp.name
output defaultHostname string = staticWebApp.properties.defaultHostname
