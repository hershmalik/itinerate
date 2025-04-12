console.log("Initializing second page...");

// Display preferences from localStorage
function displayPreferences() {
    const preferencesList = document.getElementById("preferences-list");
    if (preferencesList) {
        const preferences = JSON.parse(localStorage.getItem("selectedPreferences") || "[]");
        if (preferences.length === 0) {
            preferencesList.innerHTML = "<li>No preferences selected</li>";
        } else {
            preferencesList.innerHTML = preferences
                .map(pref => `<li>${pref}</li>`)
                .join("");
        }
    }
}

// Fetch itinerary data from server
async function generateItinerary() {
    try {
        // Get trip details from localStorage
        const tripDetailsJson = localStorage.getItem('tripDetails');
        const tripDetails = tripDetailsJson ? JSON.parse(tripDetailsJson) : null;
        
        // Get destination and preferences
        const destination = tripDetails?.destination || "Unknown destination";
        const preferences = tripDetails?.preferences || [];

        console.log("Generating itinerary for:", destination, preferences);

        // Show loading indicator
        const loadingIndicator = document.getElementById("loading-indicator");
        if (loadingIndicator) loadingIndicator.style.display = "block";
        
        // Get the itinerary table body
        const itineraryTableBody = document.querySelector("#itinerary-table tbody");
        if (!itineraryTableBody) {
            console.error("Itinerary table body not found");
            return;
        }
        
        // Clear existing rows
        itineraryTableBody.innerHTML = "";
        
        // Make API request
        const response = await fetch(`/generate-itinerary?destination=${encodeURIComponent(destination)}&preferences=${encodeURIComponent(JSON.stringify(preferences))}`);
        
        // Hide loading indicator
        if (loadingIndicator) loadingIndicator.style.display = "none";

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("API Response:", data);
        
        // Update destination in the UI
        const destinationElements = document.querySelectorAll("[id^='selected-destination']");
        destinationElements.forEach(el => {
            if (el) el.textContent = destination;
        });
        
        // Populate the table with the itinerary data
        if (data.itinerary && Array.isArray(data.itinerary)) {
            // Group by days
            let currentDay = null;
            
            data.itinerary.forEach(item => {
                // Check if this is a new day
                if (currentDay !== item.day) {
                    currentDay = item.day;
                    
                    // Add a day header row
                    const headerRow = document.createElement("tr");
                    headerRow.className = "day-header";
                    headerRow.innerHTML = `<td colspan="3">${item.day}</td>`;
                    itineraryTableBody.appendChild(headerRow);
                }
                
                // Determine day class for styling - SAFER VERSION
                let dayNum = 1; // Default to day 1
                if (typeof item.day === 'string') {
                    const match = item.day.match(/\d+/);
                    if (match && match[0]) {
                        dayNum = parseInt(match[0]);
                    }
                } else if (item.day && typeof item.day === 'number') {
                    dayNum = item.day;
                }
                const dayClass = `day-${dayNum}`;
                
                // Create a row for each itinerary item
                const row = document.createElement("tr");
                row.className = dayClass;
                row.innerHTML = `
                    <td>${item.time || ""}</td>
                    <td>${item.activity || ""}</td>
                    <td>${item.location || ""}</td>
                `;
                itineraryTableBody.appendChild(row);
            });
        }
        
        console.log("Table populated successfully");
        
    } catch (error) {
        console.error("Error generating itinerary:", error);
        const errorMessage = document.getElementById("error-message");
        if (errorMessage) {
            errorMessage.textContent = `Failed to generate itinerary: ${error.message}`;
            errorMessage.style.display = "block";
        }
    }
}

function getTripDetailsFromStorage() {
    try {
        const tripDetailsJson = localStorage.getItem('tripDetails');
        return tripDetailsJson ? JSON.parse(tripDetailsJson) : null;
    } catch (e) {
        console.error("Error parsing trip details from localStorage:", e);
        return null;
    }
}

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
    try {
        displayPreferences();
        const tripDetails = getTripDetailsFromStorage();
        if (tripDetails) {
            const destinationElements = document.querySelectorAll("[id^='selected-destination']");
            destinationElements.forEach(element => {
                if (element) element.textContent = tripDetails.destination || "your destination";
            });
        }
        generateItinerary();
    } catch (error) {
        console.error("Error initializing page:", error);
    }
});

