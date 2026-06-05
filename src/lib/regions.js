// Full Azure region display names, keyed by armRegionName. The Retail Prices API
// `location` field uses terse codes (e.g. "SE Central"), so we map them properly.

export const REGION_NAMES = {
  australiaeast: "Australia East",
  australiasoutheast: "Australia Southeast",
  belgiumcentral: "Belgium Central",
  brazilsouth: "Brazil South",
  canadacentral: "Canada Central",
  canadaeast: "Canada East",
  centralindia: "Central India",
  centralus: "Central US",
  denmarkeast: "Denmark East",
  eastasia: "East Asia",
  eastus: "East US",
  eastus2: "East US 2",
  francecentral: "France Central",
  germanynorth: "Germany North",
  germanywestcentral: "Germany West Central",
  indonesiacentral: "Indonesia Central",
  italynorth: "Italy North",
  japaneast: "Japan East",
  japanwest: "Japan West",
  jioindiawest: "Jio India West",
  koreacentral: "Korea Central",
  mexicocentral: "Mexico Central",
  northcentralus: "North Central US",
  northeurope: "North Europe",
  norwayeast: "Norway East",
  polandcentral: "Poland Central",
  qatarcentral: "Qatar Central",
  southafricanorth: "South Africa North",
  southcentralus: "South Central US",
  southeastasia: "Southeast Asia",
  southindia: "South India",
  spaincentral: "Spain Central",
  swedencentral: "Sweden Central",
  switzerlandnorth: "Switzerland North",
  switzerlandwest: "Switzerland West",
  uaenorth: "UAE North",
  uksouth: "UK South",
  ukwest: "UK West",
  usgovarizona: "US Gov Arizona",
  usgovtexas: "US Gov Texas",
  usgovvirginia: "US Gov Virginia",
  westcentralus: "West Central US",
  westeurope: "West Europe",
  westus: "West US",
  westus2: "West US 2",
  westus3: "West US 3",
  Global: "Global",
  "US Gov": "US Gov",
};

// Pseudo-regions that are not user-selectable geographies. "Global" pricing is
// replicated into every geographic region, so it is always shown regardless.
export const UNIVERSAL_REGIONS = new Set(["Global", "US Gov", ""]);

export function regionName(arm) {
  return REGION_NAMES[arm] || arm || "—";
}
