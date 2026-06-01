const searchInput = document.getElementById('searchInput');
const resultBox = document.getElementById('resultBox');
const searchingBox = document.getElementById('searchingBox');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const timer = document.getElementById('timer');

let lastActivityTime = Date.now();
let autoRefreshInterval;
let stopAfter24HoursTimeout;
let debounceTimeout;
let currentSearchId = 0;

// Search request execution
function performSearch(query) {
    if (!query.trim()) {
        resultBox.innerHTML = '';
        searchingBox.style.display = 'none';
        // Broadcast empty state to guest screen
        localStorage.setItem('staff_typing_id', '');
        return;
    }

    const searchId = ++currentSearchId;
    searchingBox.style.display = 'block';
    resultBox.innerHTML = '';

    const searchBy = /^\d+$/.test(query) ? 'id' : 'name';

    fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_by: searchBy, query })
    })
        .then(res => res.json())
        .then(data => {
            if (searchId !== currentSearchId) return;
            searchingBox.style.display = 'none';

            if (data.status === 'Cleared') {
                resultBox.innerHTML = `
                <div class="result-name">${data.data.name}</div>
                <div class="result-status">${data.message}</div>
            `;
                // BROADCAST TO GUEST SCREEN: Success
                localStorage.setItem('guest_display_data', JSON.stringify({
                    name: data.data.name,
                    status: data.message,
                    timestamp: Date.now()
                }));

            } else {
                resultBox.innerHTML = `
                <div class="result-name">Not Found</div>
                <div class="result-status">No matching record.</div>
            `;
                // BROADCAST TO GUEST SCREEN: Not Found
                localStorage.setItem('guest_display_data', JSON.stringify({
                    name: "Not Found",
                    status: "Please check with staff",
                    timestamp: Date.now()
                }));
            }
        })
        .catch(error => {
            if (searchId !== currentSearchId) return;
            searchingBox.style.display = 'none';

            alert('Search error. Probably your backend said nope.');
            resultBox.innerHTML = `
            <div class="result-name">Error</div>
            <div class="result-status">${error}</div>
        `;
        });
}

searchBtn.addEventListener('click', () => {
    performSearch(searchInput.value);
    recordActivity();
});

searchInput.addEventListener('input', () => {
    const query = searchInput.value;

    // BROADCAST TO GUEST SCREEN: Live Typing
    localStorage.setItem('staff_typing_id', query);

    resultBox.innerHTML = '';
    searchingBox.style.display = query.trim() ? 'block' : 'none';

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        if (query.trim()) performSearch(query);
    }, 500);

    recordActivity();
});

// Refresh button
refreshBtn.addEventListener('click', () => {
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Refreshing...';
    refreshBtn.disabled = true;

    fetch('/api/refresh', { method: 'POST' })
        .then(res => res.json())
        .then(() => {
            if (searchInput.value.trim()) performSearch(searchInput.value);
            refreshBtn.innerHTML = 'Refresh';
            refreshBtn.disabled = false;
        })
        .catch(error => {
            alert('Manual refresh error.');
            resultBox.innerHTML = `
            <div class="result-name">Error</div>
            <div class="result-status">${error}</div>
        `;
        });

    recordActivity();
});

// Track user activity to keep auto refresh alive
function recordActivity() {
    lastActivityTime = Date.now();
    resetInactivityTimeout();
}

// Auto refresh every 30 minutes while user active
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastActivityTime <= 24 * 60 * 60 * 1000) {
            fetch('/api/refresh', { method: 'POST' })
                .then(res => res.json())
                .catch(error => {
                    alert('Auto refresh error. Backend acting shady.');
                    console.error('Auto refresh error:', error);
                });
        }
    }, 30 * 60 * 1000);
}

// Stop refresh after 24 hours no user interaction
function resetInactivityTimeout() {
    if (stopAfter24HoursTimeout) clearTimeout(stopAfter24HoursTimeout);
    stopAfter24HoursTimeout = setTimeout(() => {
        clearInterval(autoRefreshInterval);
        console.log('Auto refresh stopped after 24h inactivity');
    }, 24 * 60 * 60 * 1000);
}

['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, recordActivity);
});

startAutoRefresh();
resetInactivityTimeout();