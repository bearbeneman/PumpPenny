// js/config.js
// Contains all static configuration for the application.

export const UK_CENTER = [54.5, -2.5];
export const INITIAL_UK_ZOOM = 6;
export const MAX_ZOOM = 18;
export const DISABLE_CLUSTERING_ZOOM = 10;
export const NUM_PRICE_BINS = 5;
export const PRICE_BIN_COLORS = ['#2ECC40', '#7FDBFF', '#FFDC00', '#FFA500', '#FF4136'];

export const FUEL_TYPE_DESCRIPTIONS = {
    "E5": "Premium Unleaded (E5)", "E10": "Unleaded (E10)", "B7": "Diesel (B7)",
    "SDV": "Super Diesel", "UNL": "Unleaded", "DSL": "Diesel", "PUL": "Premium Unleaded",
    "SUL": "Super Unleaded", "PDL": "Premium Diesel",
};

export const STANDARD_PETROL_CODE = "E10";
export const ALT_STANDARD_PETROL_CODES = ["UNL"];
export const STANDARD_DIESEL_CODE = "B7";
export const ALT_STANDARD_DIESEL_CODES = ["DSL"];

export const DATA_SOURCES = [
    { name: "Shell", url: "https://www.shell.co.uk/fuel-prices-data.html" },
    { name: "AppleGreen", url: "https://applegreenstores.com/fuel-prices/data.json" },
    { name: "AsconaGroup", url: "https://fuelprices.asconagroup.co.uk/newfuel.json" },
    { name: "Asda", url: "https://storelocator.asda.com/fuel_prices_data.json" },
    { name: "BP", url: "https://www.bp.com/en_gb/united-kingdom/home/fuelprices/fuel_prices_data.json" },
    { name: "Esso", url: "https://fuelprices.esso.co.uk/latestdata.json" },
    { name: "JET", url: "https://jetlocal.co.uk/fuel_prices_data.json" },
    { name: "Morrisons", url: "https://www.morrisons.com/fuel-prices/fuel.json", locationParser: (loc) => parseLocation(loc) },
    { name: "MotoWay", url: "https://moto-way.com/fuel-price/fuel_prices.json" },
    { name: "MotorFuelGroup", url: "https://fuel.motorfuelgroup.com/fuel_prices_data.json" },
    { name: "Rontec", url: "https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json", locationParser: (loc) => parseLocation(loc) },
    { name: "Sainsbury's", url: "https://api.sainsburys.co.uk/v1/exports/latest/fuel_prices_data.json" },
    { name: "SGN Retail", url: "https://www.sgnretail.uk/files/data/SGN_daily_fuel_prices.json", locationParser: (loc) => parseLocation(loc) },
    { name: "Tesco", url: "https://www.tesco.com/fuel_prices/fuel_prices_data.json" }
];

// Helper for location parsing within config
export const parseLocation = (location) => {
    if (location && typeof location.longitude === 'number' && typeof location.latitude === 'number') {
        return { latitude: location.latitude, longitude: location.longitude };
    }
    if (location && typeof location.longitude === 'string' && typeof location.latitude === 'string') {
        return { latitude: parseFloat(location.latitude), longitude: parseFloat(location.longitude) };
    }
    return null;
};