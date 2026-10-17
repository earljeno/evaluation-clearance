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

/* Settings Console & Spreadsheet Update Controller */

const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

const tabPasteBtn = document.getElementById('tabPasteBtn');
const tabLinkBtn = document.getElementById('tabLinkBtn');
const panelPaste = document.getElementById('panelPaste');
const panelLink = document.getElementById('panelLink');

const pasteSpreadsheetInput = document.getElementById('pasteSpreadsheetInput');
const previewPasteBtn = document.getElementById('previewPasteBtn');
const submitPasteBtn = document.getElementById('submitPasteBtn');
const submitPasteBtnText = document.getElementById('submitPasteBtnText');
const clearPasteBtn = document.getElementById('clearPasteBtn');
const pastePreviewArea = document.getElementById('pastePreviewArea');
const previewSummaryText = document.getElementById('previewSummaryText');
const previewTableBody = document.getElementById('previewTableBody');
const hidePreviewBtn = document.getElementById('hidePreviewBtn');
const pasteStatusNotice = document.getElementById('pasteStatusNotice');

const sheetUrlInput = document.getElementById('sheetUrlInput');
const saveAndSyncBtn = document.getElementById('saveAndSyncBtn');
const saveAndSyncBtnText = document.getElementById('saveAndSyncBtnText');
const saveLinkOnlyBtn = document.getElementById('saveLinkOnlyBtn');
const linkStatusNotice = document.getElementById('linkStatusNotice');
const modalStudentCount = document.getElementById('modalStudentCount');

function showNotice(element, type, message) {
    if (!element) return;
    element.className = `status-notice-box status-${type}`;
    element.style.display = 'flex';

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    else if (type === 'error') iconClass = 'fa-circle-xmark';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    else if (type === 'loading') iconClass = 'fa-circle-notch fa-spin';

    element.innerHTML = `<i class="fas ${iconClass}" aria-hidden="true"></i> <span>${escapeHtml(message)}</span>`;
}

function clearNotice(element) {
    if (!element) return;
    element.style.display = 'none';
    element.innerHTML = '';
}

function loadSettingsData() {
    fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'Success' && data.data) {
                if (sheetUrlInput && !sheetUrlInput.value) {
                    sheetUrlInput.value = data.data.spreadsheet_link || '';
                }
                if (modalStudentCount) {
                    modalStudentCount.textContent = data.data.student_count;
                }
            }
        })
        .catch(err => {
            console.error('Failed to load settings:', err);
        });
}

function switchSettingsTab(target) {
    if (target === 'paste') {
        if (tabPasteBtn) {
            tabPasteBtn.classList.add('active');
            tabPasteBtn.setAttribute('aria-selected', 'true');
        }
        if (tabLinkBtn) {
            tabLinkBtn.classList.remove('active');
            tabLinkBtn.setAttribute('aria-selected', 'false');
        }
        if (panelPaste) {
            panelPaste.classList.add('active');
            panelPaste.hidden = false;
        }
        if (panelLink) {
            panelLink.classList.remove('active');
            panelLink.hidden = true;
        }
    } else {
        if (tabLinkBtn) {
            tabLinkBtn.classList.add('active');
            tabLinkBtn.setAttribute('aria-selected', 'true');
        }
        if (tabPasteBtn) {
            tabPasteBtn.classList.remove('active');
            tabPasteBtn.setAttribute('aria-selected', 'false');
        }
        if (panelLink) {
            panelLink.classList.add('active');
            panelLink.hidden = false;
        }
        if (panelPaste) {
            panelPaste.classList.remove('active');
            panelPaste.hidden = true;
        }
    }
}

if (tabPasteBtn) {
    tabPasteBtn.addEventListener('click', () => switchSettingsTab('paste'));
}
if (tabLinkBtn) {
    tabLinkBtn.addEventListener('click', () => switchSettingsTab('link'));
}

if (openSettingsBtn && settingsModal) {
    openSettingsBtn.addEventListener('click', () => {
        settingsModal.hidden = false;
        openSettingsBtn.setAttribute('aria-expanded', 'true');
        loadSettingsData();
        clearNotice(pasteStatusNotice);
        clearNotice(linkStatusNotice);
        if (tabPasteBtn) tabPasteBtn.focus();
    });
}

if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.hidden = true;
        if (openSettingsBtn) {
            openSettingsBtn.setAttribute('aria-expanded', 'false');
            openSettingsBtn.focus();
        }
    });
}

// Close modal when clicking backdrop
if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.hidden = true;
            if (openSettingsBtn) {
                openSettingsBtn.setAttribute('aria-expanded', 'false');
                openSettingsBtn.focus();
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsModal.hidden) {
            settingsModal.hidden = true;
            if (openSettingsBtn) {
                openSettingsBtn.setAttribute('aria-expanded', 'false');
                openSettingsBtn.focus();
            }
        }
    });
}

// Preview pasted spreadsheet data
if (previewPasteBtn && pasteSpreadsheetInput) {
    previewPasteBtn.addEventListener('click', () => {
        const rawText = pasteSpreadsheetInput.value.trim();
        if (!rawText) {
            showNotice(pasteStatusNotice, 'warning', 'Please paste data rows from a spreadsheet first.');
            return;
        }

        showNotice(pasteStatusNotice, 'loading', 'Analyzing spreadsheet data structure...');
        if (pastePreviewArea) pastePreviewArea.style.display = 'none';

        fetch('/api/settings/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawText })
        })
            .then(res => res.json().then(data => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || data.status === 'Error') {
                    showNotice(pasteStatusNotice, 'error', data.message || 'Unable to parse pasted content.');
                    return;
                }

                showNotice(pasteStatusNotice, 'success', `Parsed ${data.count} student records successfully. Click "Update Database" to save.`);

                if (previewSummaryText) {
                    previewSummaryText.textContent = `Found ${data.count} records (ID: ${data.id_column}, Name: ${data.name_column})`;
                }

                if (previewTableBody) {
                    previewTableBody.innerHTML = '';
                    (data.preview || []).forEach((row, idx) => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${idx + 1}</td>
                            <td>${escapeHtml(row.school_id)}</td>
                            <td>${escapeHtml(row.name)}</td>
                        `;
                        previewTableBody.appendChild(tr);
                    });
                }

                if (pastePreviewArea) {
                    pastePreviewArea.style.display = 'flex';
                }
            })
            .catch(err => {
                showNotice(pasteStatusNotice, 'error', `Failed to connect to parser: ${err.message}`);
            });
    });
}

if (hidePreviewBtn && pastePreviewArea) {
    hidePreviewBtn.addEventListener('click', () => {
        pastePreviewArea.style.display = 'none';
    });
}

if (clearPasteBtn && pasteSpreadsheetInput) {
    clearPasteBtn.addEventListener('click', () => {
        pasteSpreadsheetInput.value = '';
        if (pastePreviewArea) pastePreviewArea.style.display = 'none';
        clearNotice(pasteStatusNotice);
        pasteSpreadsheetInput.focus();
    });
}

// Submit pasted spreadsheet data to database
if (submitPasteBtn && pasteSpreadsheetInput) {
    submitPasteBtn.addEventListener('click', () => {
        const rawText = pasteSpreadsheetInput.value.trim();
        if (!rawText) {
            showNotice(pasteStatusNotice, 'warning', 'Please paste spreadsheet rows before updating.');
            return;
        }

        const selectedModeEl = document.querySelector('input[name="importMode"]:checked');
        const mode = selectedModeEl ? selectedModeEl.value : 'replace';

        const originalText = submitPasteBtnText ? submitPasteBtnText.textContent : 'Update Database';
        submitPasteBtn.disabled = true;
        if (submitPasteBtnText) submitPasteBtnText.textContent = 'Updating Database...';
        showNotice(pasteStatusNotice, 'loading', 'Saving records to database...');

        fetch('/api/settings/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawText, mode })
        })
            .then(res => res.json().then(data => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || data.status === 'Error') {
                    showNotice(pasteStatusNotice, 'error', data.message || 'Database update failed.');
                    return;
                }

                showNotice(pasteStatusNotice, 'success', data.message || `Updated database with ${data.count} records.`);
                if (modalStudentCount && data.total_students !== undefined) {
                    modalStudentCount.textContent = data.total_students;
                }

                // If staff member is currently searching, re-run query with new records
                if (searchInput && searchInput.value.trim()) {
                    performSearch(searchInput.value);
                }
            })
            .catch(err => {
                showNotice(pasteStatusNotice, 'error', `Network error during import: ${err.message}`);
            })
            .finally(() => {
                submitPasteBtn.disabled = false;
                if (submitPasteBtnText) submitPasteBtnText.textContent = originalText;
            });
    });
}

// Google Sheet URL update handlers
function submitUrlUpdate(syncNow) {
    if (!sheetUrlInput) return;
    const url = sheetUrlInput.value.trim();
    if (!url) {
        showNotice(linkStatusNotice, 'warning', 'Please enter a valid Google Spreadsheet URL.');
        return;
    }

    const btn = syncNow ? saveAndSyncBtn : saveLinkOnlyBtn;
    const btnText = syncNow ? saveAndSyncBtnText : null;
    const originalText = btnText ? btnText.textContent : '';

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Syncing...';
    showNotice(linkStatusNotice, 'loading', syncNow ? 'Saving URL and downloading spreadsheet records...' : 'Saving URL...');

    fetch('/api/settings/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheet_link: url, sync_now: syncNow })
    })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || data.status === 'Error') {
                showNotice(linkStatusNotice, 'error', data.message || 'Failed to update spreadsheet link.');
                return;
            }

            if (data.status === 'Warning') {
                showNotice(linkStatusNotice, 'warning', data.message);
                return;
            }

            showNotice(linkStatusNotice, 'success', data.message || 'Spreadsheet URL saved and synchronized.');
            if (sheetUrlInput && data.spreadsheet_link) {
                sheetUrlInput.value = data.spreadsheet_link;
            }
            if (modalStudentCount && data.student_count !== undefined) {
                modalStudentCount.textContent = data.student_count;
            }

            if (searchInput && searchInput.value.trim()) {
                performSearch(searchInput.value);
            }
        })
        .catch(err => {
            showNotice(linkStatusNotice, 'error', `Network error while updating link: ${err.message}`);
        })
        .finally(() => {
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = originalText;
        });
}

if (saveAndSyncBtn) {
    saveAndSyncBtn.addEventListener('click', () => submitUrlUpdate(true));
}

if (saveLinkOnlyBtn) {
    saveLinkOnlyBtn.addEventListener('click', () => submitUrlUpdate(false));
}

// Initialize settings on standalone settings page if present
if (document.querySelector('.settings-station-card')) {
    loadSettingsData();
}