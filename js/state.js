// js/state.js
export const state = {
    map: null,
    allStationsData: [],
    priceLegend: null,
    cheapestFlagLegend: null, 
    currentPriceScale: [],
    
    // NEW: Add a property to store the user's location
    userLatLng: null,

    visibleCheapestPetrolStation: null,
    visibleCheapestDieselStation: null,
    visibleCheapestPetrolPrice: Infinity,
    visibleCheapestDieselPrice: Infinity,
    
    visibleHighestPetrolPrice: 0,
    visibleHighestDieselPrice: 0,

    brandMarkerClusters: {},
    allBrandNames: new Set(),
    filterOverlay: null,
    filterPanel: null,
};