// js/ui.js
// Manages UI components like the filter panel.

import { state } from './state.js';
import { updateDynamicPriceScaleAndLegend } from './map-renderer.js';

// NEW: Exported function to create the recenter button
export function createRecenterControl() {
    const RecenterControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-recenter');
            container.innerHTML = `<a href="#" title="Recenter Map" role="button"></a>`;
            L.DomEvent.on(container, 'click', L.DomEvent.stop)
                      .on(container, 'click', () => {
                          if (state.userLatLng) {
                              // Use flyTo for a smooth animation
                              map.flyTo(state.userLatLng, 13);
                          } else {
                              alert('Your location is not available. Please enable location services and refresh.');
                          }
                      });
            return container;
        }
    });
    // Add the control to the map, grouped with the filter icon
    new RecenterControl({ position: 'topright' }).addTo(state.map);
}

export function createFilterUI() {
    state.filterOverlay = L.DomUtil.create('div', 'hidden', document.body);
    state.filterOverlay.id = 'filter-overlay';
    
    state.filterPanel = L.DomUtil.create('div', 'hidden', document.body);
    state.filterPanel.id = 'filter-panel';
    
    state.filterPanel.innerHTML = `
        <div id="filter-panel-header"><span>Filter by Brand</span></div>
        <div id="filter-panel-content"><div id="filter-brands-list"></div></div>
        <div id="filter-panel-footer"><button id="close-filters-btn">Done</button></div>
    `;

    const FilterControl = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-filter');
            container.innerHTML = `<a href="#" title="Filter by Brand" role="button"></a>`;
            L.DomEvent.on(container, 'click', L.DomEvent.stop).on(container, 'click', toggleFilterPanel);
            return container;
        }
    });
    new FilterControl({ position: 'topright' }).addTo(state.map);
    
    const closeButton = state.filterPanel.querySelector('#close-filters-btn');
    L.DomEvent.on(closeButton, 'click', toggleFilterPanel);
    L.DomEvent.on(state.filterOverlay, 'click', toggleFilterPanel);
}

function toggleFilterPanel() {
    state.filterOverlay.classList.toggle('visible');
    state.filterPanel.classList.toggle('visible');
}

export function handleFilterChange(event) {
    const brand = event.target.value;
    const isChecked = event.target.checked;
    if (state.brandMarkerClusters[brand]) {
        if (isChecked) state.map.addLayer(state.brandMarkerClusters[brand]);
        else state.map.removeLayer(state.brandMarkerClusters[brand]);
    }
    updateDynamicPriceScaleAndLegend();
}