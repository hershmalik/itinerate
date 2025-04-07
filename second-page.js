document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const preferences = urlParams.getAll('preferences');

    // Display preferences in the summary section
    const preferencesList = document.getElementById('preferences-list');
    preferences.forEach(pref => {
        const listItem = document.createElement('li');
        listItem.textContent = pref.charAt(0).toUpperCase() + pref.slice(1);
        preferencesList.appendChild(listItem);
    });

    // Toggle table visibility
    const toggleButtons = document.querySelectorAll('.toggle-button');
    const tables = document.querySelectorAll('.table');

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log(`Button clicked: ${button.textContent}`); // Debugging

            // Remove active class from all buttons and tables
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            tables.forEach(table => table.classList.remove('active'));

            // Add active class to the clicked button and corresponding table
            button.classList.add('active');
            const tableId = button.getAttribute('data-table');
            console.log(`Activating table: ${tableId}`); // Debugging
            document.getElementById(tableId).classList.add('active');
        });
    });

    // Example: Log selected rows when a checkbox is clicked
    document.querySelectorAll('.row-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (event) => {
            const row = event.target.closest('tr');
            if (event.target.checked) {
                console.log('Row selected:', row.innerText);
            } else {
                console.log('Row unselected:', row.innerText);
            }
        });
    });
});
