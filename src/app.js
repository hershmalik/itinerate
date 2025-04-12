// This file contains the JavaScript code for the web application.
// It handles interactivity, DOM manipulation, and any client-side logic required for the application.

document.addEventListener("DOMContentLoaded", function() {
    console.log("Initializing application...");
    
    // Initialize date pickers with flatpickr
    const departureDateInput = document.getElementById("departure-date");
    const arrivalDateInput = document.getElementById("arrival-date");
    
    if (departureDateInput) {
        flatpickr(departureDateInput, {
            dateFormat: "m/d/Y",
            minDate: "today",
        });
    }
    
    if (arrivalDateInput) {
        flatpickr(arrivalDateInput, {
            dateFormat: "m/d/Y",
            minDate: "today",
        });
    }
    
    console.log("Flatpickr initialized successfully");
    
    // Prevent form submission on Enter key in the destination field
    const destinationInput = document.getElementById("destination");
    if (destinationInput) {
        destinationInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                validateAndSubmit();
                return false;
            }
        });
    }
    
    // Handle form submission
    const tripForm = document.getElementById("trip-form");
    if (tripForm) {
        tripForm.addEventListener("submit", function(e) {
            e.preventDefault();
            validateAndSubmit();
        });
    }
    
    // Validation and submission function
    function validateAndSubmit() {
        const destination = document.getElementById("destination").value;
        const departureDate = document.getElementById("departure-date").value;
        const arrivalDate = document.getElementById("arrival-date").value;
        const selectedPreferences = Array.from(
            document.querySelectorAll('input[name="preferences"]:checked')
        ).map(input => input.value);
        
        // Get error message container
        let errorMessage = document.getElementById("form-error-message");
        if (!errorMessage) {
            // Create error message element if it doesn't exist
            errorMessage = document.createElement("div");
            errorMessage.id = "form-error-message";
            errorMessage.className = "error-message";
            tripForm.insertBefore(errorMessage, tripForm.firstChild);
        }
        
        // Perform validation
        if (!destination) {
            errorMessage.textContent = "Please enter a destination";
            errorMessage.style.display = "block";
            return;
        }
        
        if (!departureDate) {
            errorMessage.textContent = "Please select a departure date";
            errorMessage.style.display = "block";
            return;
        }
        
        if (!arrivalDate) {
            errorMessage.textContent = "Please select an arrival date";
            errorMessage.style.display = "block";
            return;
        }
        
        if (new Date(departureDate) > new Date(arrivalDate)) {
            errorMessage.textContent = "Departure date cannot be after arrival date";
            errorMessage.style.display = "block";
            return;
        }
        
        if (selectedPreferences.length === 0) {
            errorMessage.textContent = "Please select at least one preference";
            errorMessage.style.display = "block";
            return;
        }
        
        // Hide any previous error message
        errorMessage.style.display = "none";
        
        console.log("Form validated successfully with values:", {
            destination,
            departureDate,
            arrivalDate,
            selectedPreferences
        });
        
        // Save to localStorage
        localStorage.setItem("tripDetails", JSON.stringify({
            destination,
            departureDate,
            arrivalDate,
            preferences: selectedPreferences
        }));
        
        localStorage.setItem("selectedPreferences", JSON.stringify(selectedPreferences));
        
        // Navigate to the second page
        window.location.href = "second-page.html";
    }
});

// Define initMap globally so it can be called by the Google Maps API
function initMap() {
    console.log("Google Maps API loaded");
    const destinationInput = document.getElementById("destination");
    if (destinationInput) {
        const autocomplete = new google.maps.places.Autocomplete(destinationInput);
        autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            console.log("Selected place:", place);
        });
    }
}

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
