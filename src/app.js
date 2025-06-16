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

    // Prevent Enter key on date fields from submitting the form prematurely
    [departureDateInput, arrivalDateInput].forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
    });

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

    // Handle advanced options toggle
    const advancedOptionsToggle = document.getElementById('toggle-advanced-options');
    const advancedOptionsContainer = document.getElementById('advanced-options-container');
    const expandIcon = document.querySelector('.expand-icon');

    if (advancedOptionsToggle && advancedOptionsContainer) {
        advancedOptionsToggle.addEventListener('click', () => {
            advancedOptionsContainer.classList.toggle('expanded');
            expandIcon.classList.toggle('expanded');
        });
    }

    // Populate preference options
    const preferenceOptions = [
        { id: 'culture', label: 'Culture' },
        { id: 'landmarks', label: 'Landmarks' },
        { id: 'food', label: 'Foodie' },
        { id: 'historical', label: 'Historical' },
        { id: 'art', label: 'Art' },
        { id: 'nature', label: 'Nature' },
        { id: 'nightlife', label: 'Nightlife' },
        { id: 'theme_parks', label: 'Theme Parks' } // <-- Add this
    ];

    const preferencesList = document.querySelector('.preferences-list');
    if (preferencesList) {
        preferenceOptions.forEach(option => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'preferences';
            input.value = option.id;
            label.appendChild(input);
            label.appendChild(document.createTextNode(option.label));
            preferencesList.appendChild(label);
        });
    }

    // Handle slider inputs
    const sliders = document.querySelectorAll('.preference-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', function() {
            const value = parseInt(this.value);
            const minValue = this.dataset.min;
            const maxValue = this.dataset.max;
            
            // Remove any previous selections for this pair
            if (minValue) {
                const minCheckbox = document.querySelector(`input[name="advanced-prefs"][value="${minValue}"]`);
                if (minCheckbox) minCheckbox.checked = false;
            }
            
            if (maxValue) {
                const maxCheckbox = document.querySelector(`input[name="advanced-prefs"][value="${maxValue}"]`);
                if (maxCheckbox) maxCheckbox.checked = false;
            }
            
            // Set the appropriate checkbox based on the slider value
            if (value === 1 && minValue) {
                const minCheckbox = document.querySelector(`input[name="advanced-prefs"][value="${minValue}"]`);
                if (minCheckbox) minCheckbox.checked = true;
            } else if (value === 5 && maxValue) {
                const maxCheckbox = document.querySelector(`input[name="advanced-prefs"][value="${maxValue}"]`);
                if (maxCheckbox) maxCheckbox.checked = true;
            }
        });
    });

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
            
            // Get advanced preferences
            const advancedPreferences = [];
            document.querySelectorAll('input[name="advanced-prefs"]:checked').forEach((checkbox) => {
                advancedPreferences.push(checkbox.value);
            });
            console.log('[app.js] Advanced Preferences:', advancedPreferences);
            
            // Store in localStorage
            localStorage.setItem('tripDestination', destination);
            localStorage.setItem('tripDepartureDate', departureDate);
            localStorage.setItem('tripArrivalDate', arrivalDate);
            localStorage.setItem('tripPreferences', JSON.stringify(selectedPreferences));
            localStorage.setItem('advancedPreferences', JSON.stringify(advancedPreferences));
            
            // Redirect to the next page
            window.location.href = 'second-page.html';
        });
    }
});
