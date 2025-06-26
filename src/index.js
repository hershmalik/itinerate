document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

function initializePage() {
    setupDatePickers();
    setupDestinationAutocomplete();
    setupAdvancedToggle();
    setupFormSubmission();
    populateTrendingDestinations();
}

// Setup date pickers
function setupDatePickers() {
    const departureDate = flatpickr("#departure-date", {
        minDate: "today",
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr) {
            // Update return date minimum to be after departure
            arrivalDate.set('minDate', dateStr);
        }
    });
    
    const arrivalDate = flatpickr("#arrival-date", {
        minDate: "today",
        dateFormat: "Y-m-d"
    });
}

// Setup destination autocomplete
function setupDestinationAutocomplete() {
    const input = document.getElementById('destination');
    if (!input) return;

    if (window.google && window.google.maps && window.google.maps.places) {
        // Use Google Maps Places Autocomplete
        const autocomplete = new google.maps.places.Autocomplete(input, {
            types: ['(cities)'],
            fields: ['address_components', 'geometry', 'name']
        });
        autocomplete.addListener('place_changed', function() {
            const place = autocomplete.getPlace();
            // Optionally, handle place selection here
        });
    } else {
        // Fallback: static suggestions
        const suggestions = [
            'Tokyo, Japan', 'Paris, France', 'New York, USA', 'London, UK',
            'Rome, Italy', 'Barcelona, Spain', 'Amsterdam, Netherlands',
            'Bangkok, Thailand', 'Singapore', 'Dubai, UAE', 'Sydney, Australia'
        ];
        input.addEventListener('input', function() {
            const value = this.value.toLowerCase();
            const suggestionsDiv = document.getElementById('destination-suggestions');
            if (value.length < 2) {
                suggestionsDiv.innerHTML = '';
                return;
            }
            const filtered = suggestions.filter(city => 
                city.toLowerCase().includes(value)
            );
            suggestionsDiv.innerHTML = filtered.map(city => 
                `<div class="suggestion-item" onclick="selectSuggestion('${city}')">${city}</div>`
            ).join('');
        });
    }
}

function selectSuggestion(city) {
    document.getElementById('destination').value = city;
    document.getElementById('destination-suggestions').innerHTML = '';
}

// Setup advanced options toggle
function setupAdvancedToggle() {
    const toggle = document.getElementById('advanced-toggle');
    const options = document.getElementById('advanced-options');
    const icon = toggle.querySelector('.toggle-icon');
    
    toggle.addEventListener('click', function() {
        const isOpen = options.classList.contains('open');
        
        if (isOpen) {
            options.classList.remove('open');
            icon.textContent = '▼';
        } else {
            options.classList.add('open');
            icon.textContent = '▲';
        }
    });
}

// Setup form submission
function setupFormSubmission() {
    const form = document.getElementById('trip-form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const destination = formData.get('destination');
        const departureDate = formData.get('departure-date');
        const arrivalDate = formData.get('arrival-date');
        const tripStyle = formData.get('trip-style');
        const interests = Array.from(formData.getAll('interests'));
        
        if (!destination || !departureDate || !arrivalDate) {
            alert('Please fill in all required fields.');
            return;
        }
        
        // Calculate trip duration
        const departure = new Date(departureDate);
        const arrival = new Date(arrivalDate);
        const tripDuration = Math.ceil((arrival - departure) / (1000 * 60 * 60 * 24));
        
        // Save fields individually for second-page.js compatibility
        localStorage.setItem('tripDestination', destination);
        localStorage.setItem('tripDepartureDate', departureDate);
        localStorage.setItem('tripArrivalDate', arrivalDate);
        localStorage.setItem('tripPreferences', JSON.stringify(interests));
        localStorage.setItem('tripStyle', tripStyle);
        // Optionally, keep the old tripData object for backward compatibility
        const tripData = {
            destination: destination,
            departureDate: departureDate,
            arrivalDate: arrivalDate,
            duration: tripDuration,
            interests: interests,
            tripStyle: tripStyle,
        };
        localStorage.setItem('tripData', JSON.stringify(tripData));
        window.location.href = 'second-page.html';
    });
}

// Populate trending destinations
function populateTrendingDestinations() {
    const trendingData = [
        {
            destination: "Tokyo, Japan",
            image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&h=300&fit=crop",
            description: "Modern metropolis meets ancient traditions",
            highlights: ["Shibuya Crossing", "Cherry Blossoms", "Temple Visits", "Sushi Masters"],
            priceRange: "from $180/day",
            recommendedDuration: "7-10 days",
            tags: ["Culture", "Food", "Technology", "Urban"]
        },
        {
            destination: "Santorini, Greece",
            image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=400&h=300&fit=crop",
            description: "Iconic white buildings and stunning sunsets",
            highlights: ["Sunset Views", "Wine Tasting", "Beach Clubs", "Local Cuisine"],
            priceRange: "from $150/day",
            recommendedDuration: "4-6 days",
            tags: ["Romance", "Beach", "Photography", "Relaxation"]
        },
        {
            destination: "Iceland Ring Road",
            image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop",
            description: "Epic landscapes and natural wonders",
            highlights: ["Northern Lights", "Geysers", "Waterfalls", "Blue Lagoon"],
            priceRange: "from $200/day",
            recommendedDuration: "8-12 days",
            tags: ["Adventure", "Nature", "Photography", "Road Trip"]
        },
        {
            destination: "Bali, Indonesia",
            image: "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=400&h=300&fit=crop",
            description: "Tropical paradise with rich culture",
            highlights: ["Rice Terraces", "Beach Clubs", "Temples", "Spa Retreats"],
            priceRange: "from $80/day",
            recommendedDuration: "7-14 days",
            tags: ["Beach", "Culture", "Wellness", "Budget-Friendly"]
        },
        {
            destination: "Paris, France",
            image: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=800&q=80",
            description: "City of lights and romance",
            highlights: ["Eiffel Tower", "Louvre Museum", "Seine River", "Café Culture"],
            priceRange: "from $160/day",
            recommendedDuration: "5-7 days",
            tags: ["Romance", "Art", "Culture", "Architecture"]
        },
        {
            destination: "New York City, USA",
            image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=300&fit=crop",
            description: "The city that never sleeps",
            highlights: ["Times Square", "Central Park", "Broadway Shows", "Museums"],
            priceRange: "from $220/day",
            recommendedDuration: "4-7 days",
            tags: ["Urban", "Culture", "Entertainment", "Food"]
        }
    ];
    
    createTrendingCards(trendingData);
}

// Remove badges and shrink meta text for trending cards
function createTrendingCards(data) {
    // Only show a few categories on mobile (e.g. 3 cards)
    const isMobile = window.innerWidth <= 600;
    let filteredData = data;
    if (isMobile) {
        filteredData = data.slice(0, 3); // Only show first 3 cards on mobile
    }
    const container = document.getElementById('trending-grid');
    if (!container) return;
    container.innerHTML = filteredData.map(item => `
        <div class="trending-card" onclick="selectDestination('${item.destination}', '${item.recommendedDuration}')">
            <img src="${item.image}" alt="${item.destination}" class="trending-card-image">
            <div class="trending-card-content">
                <h3 class="trending-card-title">${item.destination}</h3>
            </div>
        </div>
    `).join('');
}

function selectDestination(destination, recommendedDuration) {
    // Fill destination field
    const destinationInput = document.getElementById('destination');
    if (destinationInput) {
        destinationInput.value = destination;
        
        // Add visual feedback
        destinationInput.style.transform = 'scale(1.05)';
        destinationInput.style.background = 'rgba(255, 90, 95, 0.1)';
        setTimeout(() => {
            destinationInput.style.transform = 'scale(1)';
            destinationInput.style.background = '';
        }, 300);
    }
    
    // Calculate and set dates based on recommended duration
    const today = new Date();
    const departureDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks from now
    
    // Parse recommended duration to get days
    const durationMatch = recommendedDuration.match(/(\d+)-?(\d+)?/);
    let days = 7; // default
    
    if (durationMatch) {
        const minDays = parseInt(durationMatch[1]);
        const maxDays = durationMatch[2] ? parseInt(durationMatch[2]) : minDays;
        days = Math.round((minDays + maxDays) / 2);
    }
    
    const arrivalDate = new Date(departureDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    // Set the date fields
    const departureInput = document.getElementById('departure-date');
    const arrivalInput = document.getElementById('arrival-date');
    
    if (departureInput) {
        departureInput.value = departureDate.toISOString().split('T')[0];
    }
    
    if (arrivalInput) {
        arrivalInput.value = arrivalDate.toISOString().split('T')[0];
    }
    
    // Scroll to form
    document.querySelector('.hero').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
}

// Google Maps initialization callback function
function initMap() {
    console.log('Google Maps API loaded for destination autocomplete');
    setupDestinationAutocomplete();
}

// Make initMap globally available for Google Maps callback
window.initMap = initMap;