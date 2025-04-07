// This file contains the JavaScript code for the web application.
// It handles interactivity, DOM manipulation, and any client-side logic required for the application.

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('trip-form');
    if (!form) {
        console.error('Form element not found!');
        return;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const destination = document.getElementById('destination')?.value || '';
        const departureDate = document.getElementById('departure-date')?.value || '';
        const arrivalDate = document.getElementById('arrival-date')?.value || '';
        const preferences = Array.from(
            form.querySelectorAll('input[name="preferences"]:checked')
        ).map((checkbox) => checkbox.value);

        if (!destination) {
            alert('Please enter a destination.');
            return;
        }
        if (new Date(departureDate) > new Date(arrivalDate)) {
            alert('Departure date cannot be after arrival date.');
            return;
        }
        if (preferences.length === 0) {
            alert('Please select at least one preference.');
            return;
        }

        // Redirect to second-page.html after successful validation
        window.location.href = 'second-page.html';
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
});
