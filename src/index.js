document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing application...');

    // Ensure Google Maps API is loaded before using it
    window.onload = () => {
        const destinationInput = document.getElementById('destination');
        const autocomplete = new google.maps.places.Autocomplete(destinationInput);

        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            console.log('Selected place:', place);
        });
    };

    // Handle form submission
    const form = document.getElementById('trip-form');
    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const destination = document.getElementById('destination').value;
        const departureDate = document.getElementById('departure-date').value;
        const arrivalDate = document.getElementById('arrival-date').value;
        const preferences = Array.from(
            document.querySelectorAll('input[name="preferences"]:checked')
        ).map(checkbox => checkbox.value);

        // Validation checks
        if (!destination || !departureDate || !arrivalDate) {
            alert('Please fill in all required fields');
            return;
        }

        if (new Date(departureDate) > new Date(arrivalDate)) {
            alert('Departure date cannot be after arrival date');
            return;
        }

        if (preferences.length === 0) {
            alert('Please select at least one preference');
            return;
        }

        localStorage.setItem('tripData', JSON.stringify({
            destination,
            departureDate,
            arrivalDate,
            preferences
        }));

        window.location.href = 'second-page.html';
    });

    // Initialize date pickers
    const dateConfig = {
        dateFormat: "Y-m-d",
        minDate: "today",
        allowInput: true,
        disableMobile: true,
        altInput: true,
        altFormat: "D, M j",
        placeholder: " "
    };

    flatpickr("#departure-date", dateConfig);
    flatpickr("#arrival-date", dateConfig);

    // HTML structure for preferences checkboxes
    const preferencesHTML = `
    <div class="form-group">
        <label>Preferences:</label>
        <div class="checkbox-group two-columns">
            <div>
                <input type="checkbox" id="landmarks" name="preferences" value="landmarks">
                <label for="landmarks">Landmarks</label>
            </div>
            <div>
                <input type="checkbox" id="foodie" name="preferences" value="foodie">
                <label for="foodie">Foodie</label>
            </div>
            <div>
                <input type="checkbox" id="culture" name="preferences" value="culture">
                <label for="culture">Culture</label>
            </div>
            <div>
                <input type="checkbox" id="adventure" name="preferences" value="adventure">
                <label for="adventure">Adventure</label>
            </div>
            <div>
                <input type="checkbox" id="shopping" name="preferences" value="shopping">
                <label for="shopping">Shopping</label>
            </div>
            <div>
                <input type="checkbox" id="relaxation" name="preferences" value="relaxation">
                <label for="relaxation">Relaxation</label>
            </div>
            <div>
                <input type="checkbox" id="nightlife" name="preferences" value="nightlife">
                <label for="nightlife">Nightlife</label>
            </div>
        </div>
    </div>
    `;

    document.getElementById('preferences-container').innerHTML = preferencesHTML;
});