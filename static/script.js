/* ==========================================================================
   NDMU SURVEY CLEARANCE SYSTEM - CLIENT CONTROLLER
   Handles live search, debouncing, multi-screen sync, keyboard shortcuts
   ========================================================================== */

const searchInput = document.getElementById('searchInput');
const clearInputBtn = document.getElementById('clearInputBtn');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshBtnText = document.getElementById('refreshBtnText');
const timer = document.getElementById('timer');
const syncNotice = document.getElementById('syncNotice');

const statusStage = document.getElementById('statusStage');
const idleBox = document.getElementById('idleBox');
const searchingBox = document.getElementById('searchingBox');
const resultBox = document.getElementById('resultBox');

let lastActivityTime = Date.now();
let autoRefreshInterval;
let stopAfter24HoursTimeout;
let debounceTimeout;
let currentSearchId = 0;

// Escape HTML for safe rendering
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Update Clear button visibility
function updateClearButton() {
    if (clearInputBtn) {
        clearInputBtn.hidden = !searchInput.value.trim();
    }
}

// Reset view to Idle state
function showIdleState() {
    if (searchingBox) searchingBox.style.display = 'none';
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
    if (idleBox) idleBox.style.display = 'flex';
}

// Execute student clearance search
function performSearch(query) {
    const trimmed = query.trim();

    if (!trimmed) {
        showIdleState();
        localStorage.setItem('staff_typing_id', '');
        return;
    }

    const searchId = ++currentSearchId;

    if (idleBox) idleBox.style.display = 'none';
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }
    if (searchingBox) searchingBox.style.display = 'flex';

    const searchBy = /^\d+$/.test(trimmed) ? 'id' : 'name';

    fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_by: searchBy, query: trimmed })
    })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (searchId !== currentSearchId) return;

            if (searchingBox) searchingBox.style.display = 'none';
            if (idleBox) idleBox.style.display = 'none';
            if (resultBox) resultBox.style.display = 'block';

            const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (data.status === 'Cleared' && data.data) {
                const safeName = escapeHtml(data.data.name);
                const safeId = escapeHtml(data.data.id);

                resultBox.innerHTML = `
                    <div class="result-card status-cleared">
                        <div class="result-card-header">
                            <span class="status-badge">
                                <i class="fas fa-circle-check" aria-hidden="true"></i> Cleared
                            </span>
                            <span class="timestamp-text">Verified at ${formattedTime}</span>
                        </div>
                        <div class="student-meta-block">
                            <h3 class="student-name">${safeName}</h3>
                            <div class="student-id-row">
                                <span>School ID:</span>
                                <span class="student-id-code">${safeId}</span>
                            </div>
                        </div>
                        <p class="result-detail-text">Evaluation survey requirement completed and verified.</p>
                    </div>
                `;

                // Broadcast to dual-screen guest viewer
                localStorage.setItem('guest_display_data', JSON.stringify({
                    name: data.data.name,
                    status: data.message || 'Cleared!',
                    timestamp: Date.now()
                }));
            } else if (data.status === 'Error') {
                resultBox.innerHTML = `
                    <div class="result-card status-error">
                        <div class="result-card-header">
                            <span class="status-badge">
                                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Service Notice
                            </span>
                            <span class="timestamp-text">Notice at ${formattedTime}</span>
                        </div>
                        <div class="student-meta-block">
                            <h3 class="student-name">Database Unavailable</h3>
                        </div>
                        <p class="result-detail-text">Could not query clearance records. Please ensure database connection is reachable.</p>
                    </div>
                `;
            } else {
                resultBox.innerHTML = `
                    <div class="result-card status-notfound">
                        <div class="result-card-header">
                            <span class="status-badge">
                                <i class="fas fa-circle-exclamation" aria-hidden="true"></i> No Record Found
                            </span>
                            <span class="timestamp-text">Checked at ${formattedTime}</span>
                        </div>
                        <div class="student-meta-block">
                            <h3 class="student-name">Pending Evaluation</h3>
                            <div class="student-id-row">
                                <span>Searched:</span>
                                <span class="student-id-code">${escapeHtml(trimmed)}</span>
                            </div>
                        </div>
                        <p class="result-detail-text">No evaluation record was found. Please re-check the ID or advise student to complete the survey.</p>
                    </div>
                `;

                // Broadcast to dual-screen guest viewer
                localStorage.setItem('guest_display_data', JSON.stringify({
                    name: 'Not Found',
                    status: 'Please check with staff',
                    timestamp: Date.now()
                }));
            }
        })
        .catch(error => {
            if (searchId !== currentSearchId) return;

            if (searchingBox) searchingBox.style.display = 'none';
            if (idleBox) idleBox.style.display = 'none';
            if (resultBox) {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `
                    <div class="result-card status-error">
                        <div class="result-card-header">
                            <span class="status-badge">
                                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Connection Error
                            </span>
                        </div>
                        <p class="result-detail-text">Unable to reach the clearance server (${escapeHtml(error.message)}). Please verify your network connection.</p>
                    </div>
                `;
            }
        });
}

// Search Button Event
if (searchBtn) {
    searchBtn.addEventListener('click', () => {
        performSearch(searchInput.value);
        recordActivity();
    });
}

// Clear Search Button Event
if (clearInputBtn) {
    clearInputBtn.addEventListener('click', () => {
        searchInput.value = '';
        updateClearButton();
        showIdleState();
        localStorage.setItem('staff_typing_id', '');
        searchInput.focus();
        recordActivity();
    });
}

// Live typing & debounced auto-search
if (searchInput) {
    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        updateClearButton();

        // Broadcast to guest viewer
        localStorage.setItem('staff_typing_id', query);

        if (!query.trim()) {
            showIdleState();
            clearTimeout(debounceTimeout);
            return;
        }

        if (idleBox) idleBox.style.display = 'none';
        if (resultBox) resultBox.style.display = 'none';
        if (searchingBox) searchingBox.style.display = 'flex';

        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            if (searchInput.value.trim()) {
                performSearch(searchInput.value);
            }
        }, 400);

        recordActivity();
    });

    // Keyboard Shortcuts
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimeout);
            if (searchInput.value.trim()) {
                performSearch(searchInput.value);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            searchInput.value = '';
            updateClearButton();
            showIdleState();
            localStorage.setItem('staff_typing_id', '');
        }
    });
}

// Global Escape Key to clear search from anywhere
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.activeElement !== searchInput) {
        if (searchInput && searchInput.value) {
            searchInput.value = '';
            updateClearButton();
            showIdleState();
            localStorage.setItem('staff_typing_id', '');
            searchInput.focus();
        }
    }
});

// Manual Google Sheet Refresh
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        const originalText = refreshBtnText ? refreshBtnText.textContent : 'Sync Sheet Data';
        refreshBtn.disabled = true;
        if (refreshBtnText) refreshBtnText.textContent = 'Syncing...';
        if (syncNotice) syncNotice.textContent = '';

        fetch('/api/refresh', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'Success') {
                    if (syncNotice) {
                        syncNotice.textContent = 'Data synchronized';
                        syncNotice.style.color = 'var(--status-cleared-text)';
                        setTimeout(() => { if (syncNotice) syncNotice.textContent = ''; }, 3500);
                    }
                    if (searchInput.value.trim()) {
                        performSearch(searchInput.value);
                    }
                } else {
                    if (syncNotice) {
                        syncNotice.textContent = data.message || 'Sync cooldown active';
                        syncNotice.style.color = 'var(--color-brand-accent)';
                        setTimeout(() => { if (syncNotice) syncNotice.textContent = ''; }, 3500);
                    }
                }
            })
            .catch(error => {
                if (syncNotice) {
                    syncNotice.textContent = 'Sync failed';
                    syncNotice.style.color = 'var(--status-error-text)';
                }
                console.error('Manual refresh error:', error);
            })
            .finally(() => {
                refreshBtn.disabled = false;
                if (refreshBtnText) refreshBtnText.textContent = originalText;
            });

        recordActivity();
    });
}

// User activity tracking
function recordActivity() {
    lastActivityTime = Date.now();
    resetInactivityTimeout();
}

// Auto-refresh every 30 minutes while user is active
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastActivityTime <= 24 * 60 * 60 * 1000) {
            fetch('/api/refresh', { method: 'POST' })
                .then(res => res.json())
                .catch(error => {
                    console.error('Background auto-refresh error:', error);
                });
        }
    }, 30 * 60 * 1000);
}

// Stop refresh after 24 hours of inactivity
function resetInactivityTimeout() {
    if (stopAfter24HoursTimeout) clearTimeout(stopAfter24HoursTimeout);
    stopAfter24HoursTimeout = setTimeout(() => {
        clearInterval(autoRefreshInterval);
        console.log('Auto refresh stopped after 24h inactivity');
    }, 24 * 60 * 60 * 1000);
}

// Activity listeners
['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, recordActivity, { passive: true });
});

// Initialization
startAutoRefresh();
resetInactivityTimeout();
updateClearButton();
showIdleState();