// Global variable to store selected place
let selectedDestination = '';

// Define initMap in the global scope so Google Maps API can find it
function initMap() {
    const container = document.getElementById('destination-autocomplete');

    if (container) {
        // Create a regular input element with proper ID
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'destination-input'; // Add this ID to match the label
        input.placeholder = 'Enter a city, country, or region';
        input.style.width = '100%';
        input.style.padding = '12px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '4px';
        input.style.fontSize = '16px';
        container.appendChild(input);

        // Initialize Google Places Autocomplete
        const autocomplete = new google.maps.places.Autocomplete(input, {
            types: ['(cities)']
        });

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            selectedDestination = place.formatted_address || place.name || input.value;
            console.log('Selected place:', selectedDestination);
        });

        // Update selected destination when user types directly
        input.addEventListener('input', () => {
            selectedDestination = input.value;
        });
    }
}

// Make sure Google Maps can find this function
window.initMap = initMap;

// Handle shared itinerary URLs
function handleSharedItinerary() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('shared') === 'true') {
        try {
            // Extract shared data from URL
            const destination = urlParams.get('destination');
            const departureDate = urlParams.get('departureDate');
            const arrivalDate = urlParams.get('arrivalDate');
            const preferences = urlParams.get('preferences');
            const itinerary = urlParams.get('itinerary');
            
            if (destination && departureDate && arrivalDate && itinerary) {
                // Store the shared data in localStorage
                localStorage.setItem('tripDestination', destination);
                localStorage.setItem('tripDepartureDate', departureDate);
                localStorage.setItem('tripArrivalDate', arrivalDate);
                localStorage.setItem('tripPreferences', preferences || '[]');
                localStorage.setItem('sharedItinerary', itinerary);
                
                // Show a nice loading message and redirect
                showSharedItineraryMessage(destination);
                
                // Redirect to the second page after a brief delay
                setTimeout(() => {
                    window.location.href = '/second-page';
                }, 2000);
            }
        } catch (error) {
            console.error('Error handling shared itinerary:', error);
        }
    }
}

// Show a welcoming message for shared itineraries
function showSharedItineraryMessage(destination) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        ">
            <div style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #FF4C4C 0%, #FF7676 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 36px;
            ">✈️</div>
            <h3 style="margin-bottom: 15px; color: #333; font-size: 24px;">Welcome to a Shared Itinerary!</h3>
            <p style="margin-bottom: 25px; color: #666; line-height: 1.6; font-size: 16px;">
                Someone has shared their amazing <strong>${destination}</strong> travel plan with you. 
                Loading their itinerary now...
            </p>
            <div style="
                width: 40px;
                height: 40px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid #FF4C4C;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            "></div>
            <p style="color: #888; font-size: 14px;">
                Powered by AItinerate
            </p>
        </div>
    `;
    
    // Add spinning animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(modal);
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for shared itinerary data in URL parameters first
    handleSharedItinerary();

    const tripForm = document.getElementById('trip-form');
    const departureDateInput = document.getElementById('departure-date');
    const arrivalDateInput = document.getElementById('arrival-date');

    if (departureDateInput && arrivalDateInput) {
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
    } else {
        console.error('Date input fields not found for Flatpickr initialization.');
    }

    // FORM SUBMISSION HANDLER - MOVED OUTSIDE OF initMap
    if (tripForm && departureDateInput && arrivalDateInput) {
        tripForm.addEventListener('submit', function (event) {
            event.preventDefault();

            const departureDate = departureDateInput.value.trim();
            const arrivalDate = arrivalDateInput.value.trim();
            
            // Get destination from autocomplete input or direct input
            const destinationInput = document.querySelector('#destination-autocomplete input');
            const destination = selectedDestination || (destinationInput ? destinationInput.value : '') || '';

            console.log('Form submitted with destination:', destination);

            if (!destination) {
                alert('Please enter a destination.');
                return;
            }

            if (!departureDate || !arrivalDate) {
                alert('Please enter both departure and arrival dates.');
                return;
            }

            // Validate date order
            if (new Date(departureDate) > new Date(arrivalDate)) {
                alert('Departure date cannot be after arrival date');
                return;
            }

            // Preferences
            const selectedPreferences = [];
            document.querySelectorAll('input[name="preferences"]:checked').forEach((checkbox) => {
                selectedPreferences.push(checkbox.value);
            });

            // Advanced preferences
            const advancedPreferences = [];
            document.querySelectorAll('input[name="advanced-prefs"]:checked').forEach((checkbox) => {
                advancedPreferences.push(checkbox.value);
            });

            // Get trip style
            const tripStyleElement = document.querySelector('input[name="trip-style"]:checked');
            const tripStyle = tripStyleElement ? tripStyleElement.value : 'balanced';

            console.log('Storing data in localStorage...');
            console.log('Destination:', destination);
            console.log('Departure:', departureDate);
            console.log('Arrival:', arrivalDate);
            console.log('Preferences:', selectedPreferences);
            console.log('Trip Style:', tripStyle); // Add this log

            // Store in localStorage
            localStorage.setItem('tripDestination', destination);
            localStorage.setItem('tripDepartureDate', departureDate);
            localStorage.setItem('tripArrivalDate', arrivalDate);
            localStorage.setItem('tripPreferences', JSON.stringify(selectedPreferences));
            localStorage.setItem('advancedPreferences', JSON.stringify(advancedPreferences));
            localStorage.setItem('tripStyle', tripStyle); // Add this line

            // Redirect to the next page
            console.log('Redirecting to second-page...');
            window.location.href = '/second-page';  // Remove .html extension
        });
    } else {
        console.error('Form or date inputs not found for submission handler.');
    }

    // Handle advanced options toggle
    const advancedOptionsToggle = document.getElementById('toggle-advanced-options');
    const advancedOptionsContainer = document.getElementById('advanced-options-container');
    const expandIcon = document.querySelector('.expand-icon');

    if (advancedOptionsToggle && advancedOptionsContainer && expandIcon) {
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
        { id: 'theme_parks', label: 'Theme Parks' }
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
            label.appendChild(document.createTextNode(' ' + option.label));
            preferencesList.appendChild(label);
        });
    }

    // Handle slider inputs
    const sliders = document.querySelectorAll('.preference-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', function () {
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
});