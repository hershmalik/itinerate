// This file contains the JavaScript code for the web application.
// It handles interactivity, DOM manipulation, and any client-side logic required for the application.

document.addEventListener('DOMContentLoaded', () => {
    const tripForm = document.getElementById('trip-form');
    const destinationInput = document.getElementById('destination');
    const departureDateInput = document.getElementById('departure-date');
    const arrivalDateInput = document.getElementById('arrival-date');

    // Initialize Flatpickr for date inputs
    flatpickr(departureDateInput, { dateFormat: "m/d/Y" });
    flatpickr(arrivalDateInput, { dateFormat: "m/d/Y" });

    // Initialize Google Places Autocomplete
    let autocomplete;
    function initMap() { 
        if (destinationInput) {
            autocomplete = new google.maps.places.Autocomplete(destinationInput, {
                types: ['(cities)'] 
            });
            autocomplete.setFields(['address_components', 'geometry', 'icon', 'name', 'formatted_address']);
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                console.log('Selected place:', place);
            });
        } else {
            console.error("[app.js] Destination input not found for Autocomplete.");
        }
    }
    window.initMap = initMap;

    if (tripForm) {
        tripForm.addEventListener('submit', function(event) {
            event.preventDefault(); 

            const destination = destinationInput.value.trim();
            const departureDate = departureDateInput.value.trim();
            const arrivalDate = arrivalDateInput.value.trim();
            
            console.log('[app.js] Form submitted. Raw values from input fields:');
            console.log(`[app.js] Destination: '${destination}' (Length: ${destination.length})`);
            console.log(`[app.js] Departure Date: '${departureDate}' (Length: ${departureDate.length})`);
            console.log(`[app.js] Arrival Date: '${arrivalDate}' (Length: ${arrivalDate.length})`);
            
            const selectedPreferences = [];
            document.querySelectorAll('input[name="preferences"]:checked').forEach((checkbox) => {
                selectedPreferences.push(checkbox.value);
            });
            console.log('[app.js] Selected Preferences:', selectedPreferences);

            if (!destination || !departureDate || !arrivalDate) {
                console.error('[app.js] Validation FAILED: One or more required fields are empty.');
                alert("Please fill in all required fields: Destination, Departure Date, and Arrival Date.");
                return;
            }
            console.log('[app.js] Validation PASSED.');

            localStorage.setItem('tripDestination', destination);
            localStorage.setItem('tripDepartureDate', departureDate);
            localStorage.setItem('tripArrivalDate', arrivalDate);
            localStorage.setItem('tripPreferences', JSON.stringify(selectedPreferences));

            console.log('[app.js] Data supposedly saved to localStorage. Verifying by reading back immediately:');
            console.log(`[app.js] Read back tripDestination: '${localStorage.getItem('tripDestination')}'`);
            console.log(`[app.js] Read back tripDepartureDate: '${localStorage.getItem('tripDepartureDate')}'`);
            console.log(`[app.js] Read back tripArrivalDate: '${localStorage.getItem('tripArrivalDate')}'`);
            console.log(`[app.js] Read back tripPreferences: '${localStorage.getItem('tripPreferences')}'`);

            // Ensure the redirect line is active
            console.log('[app.js] REDIRECTING TO second-page.html');
            window.location.href = 'second-page.html'; 
        });
    } else {
        console.error("[app.js] Trip form not found.");
    }
});

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab-id');
        showTab(tabId);
    });
});

function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(button => button.classList.remove('active'));

    document.getElementById(tabId)?.classList.add('active');
    document.querySelector(`.tab-button[data-tab-id="${tabId}"]`)?.classList.add('active');
}
