// js/main.js
// Main application entry point.

import { UK_CENTER, INITIAL_UK_ZOOM, MAX_ZOOM } from './config.js';
import { state } from './state.js';
import { fetchAndProcessData } from './data.js';
import { createFilterUI, createRecenterControl } from './ui.js';
import { updateDynamicPriceScaleAndLegend } from './map-renderer.js';

function initializeMap(center, zoom) {
    // MODIFIED: Add the attributionControl: false option here
    const map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false 
    }).setView(center, zoom);
    
    state.map = map;

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: MAX_ZOOM
    }).addTo(map);

    createFilterUI();
    createRecenterControl();

    map.on('moveend', updateDynamicPriceScaleAndLegend);
    map.on('zoomend', updateDynamicPriceScaleAndLegend);
    
    const fuelButtonContainer = document.getElementById('fuel-type-buttons');
    fuelButtonContainer.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            fuelButtonContainer.querySelectorAll('.fuel-button').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            updateDynamicPriceScaleAndLegend();
        }
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = [position.coords.latitude, position.coords.longitude];
                state.userLatLng = userLatLng;
                map.setView(userLatLng, 12);
                
                const userIcon = L.divIcon({ className: 'user-location-marker', html: '<div class="pulse"></div>', iconSize: [14, 14] });
                L.marker(userLatLng, { icon: userIcon }).addTo(map).bindPopup('You are here');
                
                fetchAndProcessData();
            },
            (error) => {
                console.warn("Geolocation error:", error.message);
                map.setView(UK_CENTER, INITIAL_UK_ZOOM);
                fetchAndProcessData();
            },
            { timeout: 8000, enableHighAccuracy: false }
        );
    } else {
        map.setView(UK_CENTER, INITIAL_UK_ZOOM);
        fetchAndProcessData();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeMap(UK_CENTER, INITIAL_UK_ZOOM);
});