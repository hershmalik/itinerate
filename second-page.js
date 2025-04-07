document.addEventListener('DOMContentLoaded', () => {
    const toggleButtons = document.querySelectorAll('.toggle-button');
    const tables = document.querySelectorAll('.table');

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove the active class from all buttons and tables
            toggleButtons.forEach(btn => btn.classList.remove('active'));
            tables.forEach(table => table.classList.remove('active'));

            // Add the active class to the clicked button and the corresponding table
            button.classList.add('active');
            const tableId = button.getAttribute('data-table');
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