// booking.js - Complete Local Storage Booking System

// ==================== CONFIGURATION ====================
const CONFIG = {
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPaO7eZrkPjvuzf22ynIj125_o0mEY3SplClk3NTuTIHRxddmignA-nCqvdC4ApNptedM3OSAlKY9c/pub?gid=27369847&single=true&output=csv",
    COLUMNS: {
        LISTING: 1,
        USERNAME: 2,
        STATUS: 7
    }
};

// ==================== GLOBAL VARIABLES ====================
let selectedSlot = null;
let userListings = [];
let allCheckboxesSelected = false;
let debounceTimer;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Booking.js initializing...');
    
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    selectedSlot = {
        date: urlParams.get('date') || '',
        location: urlParams.get('location') || '',
        time: urlParams.get('time') || '',
        type: urlParams.get('type') || ''
    };
    
    console.log('📅 Selected slot:', selectedSlot);
    
    // Check if we have a valid slot
    if (!selectedSlot.date) {
        console.error('❌ No slot information in URL');
        showMessage('Invalid booking link. Please go back and select a slot.', 'error');
        return;
    }
    
    // Display slot info
    displaySlotInfo();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check existing bookings
    checkExistingBookings();
    
    // Auto-focus username input
    setTimeout(() => {
        const usernameInput = document.getElementById('usernameInput');
        if (usernameInput) {
            usernameInput.focus();
        }
    }, 100);
});

// ==================== UI FUNCTIONS ====================

function displaySlotInfo() {
    const slotDetailsDiv = document.getElementById('slotDetails');
    if (!slotDetailsDiv || !selectedSlot.date) {
        console.error('No slot information or element not found');
        return;
    }
    
    // Format type for display
    let typeDisplay = selectedSlot.type || '';
    if (typeDisplay.toLowerCase().includes('meetup')) {
        typeDisplay = 'Meetup';
    } else if (typeDisplay.toLowerCase().includes('self') || typeDisplay.toLowerCase().includes('collect')) {
        typeDisplay = 'Self Collect';
    }
    
    // Format date if needed
    let dateDisplay = selectedSlot.date;
    if (dateDisplay.includes('-')) {
        // Convert YYYY-MM-DD to DD/MM/YYYY
        const parts = dateDisplay.split('-');
        if (parts.length === 3) {
            dateDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    
    slotDetailsDiv.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Date</div>
            <div class="detail-value">${dateDisplay}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Location</div>
            <div class="detail-value">${selectedSlot.location}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Time</div>
            <div class="detail-value">${selectedSlot.time}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Type</div>
            <div class="detail-value">${typeDisplay}</div>
        </div>
    `;
}

function setupEventListeners() {
    const usernameInput = document.getElementById('usernameInput');
    const confirmBtn = document.getElementById('confirmBtn');
    const selectAllBtn = document.getElementById('selectAll');
    
    // Username input with debounce
    if (usernameInput) {
        usernameInput.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            
            const username = usernameInput.value.trim();
            
            if (username && username.startsWith('@') && username.length > 1) {
                // Show loading immediately
                showLoadingState();
                
                // Debounce search
                debounceTimer = setTimeout(() => {
                    searchUserItems(username.toLowerCase());
                }, 500);
            } else {
                hideListingsSection();
            }
        });
        
        // Enter key support
        usernameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const username = usernameInput.value.trim().toLowerCase();
                if (username.startsWith('@') && username.length > 1) {
                    showLoadingState();
                    searchUserItems(username);
                }
            }
        });
    }
    
    // Select all button
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', toggleSelectAll);
    }
    
    // Confirm booking button
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmBooking);
    }
}

function showLoadingState() {
    const loadingDiv = document.getElementById('loading');
    const listingsSection = document.getElementById('listingsSection');
    const noItemsDiv = document.getElementById('noItems');
    const listingsContainer = document.getElementById('listingsContainer');
    const confirmBtn = document.getElementById('confirmBtn');
    const bookingMessage = document.getElementById('bookingMessage');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (listingsSection) listingsSection.style.display = 'none';
    if (noItemsDiv) noItemsDiv.style.display = 'none';
    if (listingsContainer) listingsContainer.innerHTML = '';
    if (confirmBtn) confirmBtn.disabled = true;
    if (bookingMessage) bookingMessage.style.display = 'none';
}

function hideListingsSection() {
    const listingsSection = document.getElementById('listingsSection');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (listingsSection) listingsSection.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = true;
}

function hideLoadingState() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
}

// ==================== DATA FUNCTIONS ====================

async function searchUserItems(username) {
    console.log(`🔍 Searching items for user: ${username}`);
    
    if (!username || !username.startsWith('@') || username.length < 2) {
        showMessage('Please enter a valid username starting with @', 'error');
        hideLoadingState();
        return;
    }
    
    try {
        // Fetch data using the same method as app.js
        const cacheBuster = "&t=" + new Date().getTime();
        const finalUrl = CONFIG.SHEET_URL + cacheBuster;
        
        // Try multiple proxies like app.js
        const proxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        
        let csvText = null;
        let fetchError = null;
        
        // Try direct fetch first
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const directResponse = await fetch(finalUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/csv',
                    'Cache-Control': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (directResponse.ok) {
                csvText = await directResponse.text();
            }
        } catch (directError) {
            fetchError = directError;
            console.log('Direct fetch failed, trying proxies...');
        }
        
        // Try each proxy if direct fetch failed
        if (!csvText) {
            for (const proxy of proxies) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    
                    const proxyUrl = proxy + encodeURIComponent(finalUrl);
                    const response = await fetch(proxyUrl, {
                        signal: controller.signal,
                        headers: {
                            'Accept': 'text/csv',
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        const text = await response.text();
                        // Check if the response is valid CSV
                        if (text && text.includes(',')) {
                            csvText = text;
                            break;
                        }
                    }
                } catch (proxyError) {
                    console.log(`Proxy ${proxy} failed:`, proxyError);
                    continue;
                }
            }
        }
        
        if (!csvText) {
            throw new Error('Failed to fetch data from all sources');
        }
        
        console.log('Received CSV data length:', csvText.length);
        
        // Parse CSV using the same parser as app.js
        const rows = parseCSVEnhanced(csvText);
        console.log('Total rows:', rows.length);
        
        if (rows.length <= 1) {
            throw new Error('Insufficient data in spreadsheet');
        }
        
        // Filter listings for this user - using the same logic as app.js
        const allUserItems = [];
        const dataStartRow = Math.max(1, Math.min(4, rows.length - 1)); // Safe start index like app.js
        
        for (let i = dataStartRow; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= CONFIG.COLUMNS.USERNAME) continue;
            
            const rowUsername = (row[CONFIG.COLUMNS.USERNAME] || '').toLowerCase().trim();
            if (rowUsername === username.toLowerCase()) {
                allUserItems.push(row);
            }
        }
        
        console.log(`Found ${allUserItems.length} total items for ${username}`);
        
        // STRICT FILTER: Only items with EXACTLY "ready for collection" status
        userListings = allUserItems.filter(row => {
            const status = (row[CONFIG.COLUMNS.STATUS] || '').trim();
            const listing = (row[CONFIG.COLUMNS.LISTING] || '').trim();
            
            if (!listing || listing === '') return false;
            
            // EXACT MATCH: Must be exactly "ready for collection" (case-insensitive)
            const isReadyForCollection = status.toLowerCase() === 'ready for collection';
            
            return isReadyForCollection;
        });
        
        console.log(`Found ${userListings.length} items with "ready for collection" status`);
        
        // Remove duplicates based on listing name
        const uniqueListings = [];
        const seenListings = new Set();
        
        userListings.forEach(item => {
            const listing = item[CONFIG.COLUMNS.LISTING];
            if (listing && !seenListings.has(listing)) {
                seenListings.add(listing);
                uniqueListings.push(item);
            }
        });
        
        userListings = uniqueListings;
        
        // Update UI
        setTimeout(() => {
            displayListings();
        }, 0);
        
    } catch (error) {
        console.error('Error searching items:', error);
        showMessage('Failed to load items. Please check username and try again.', 'error');
        displayNoItems();
    }
}

// Enhanced CSV parser matching app.js
function parseCSVEnhanced(text) {
    const rows = [];
    if (!text || text.trim() === '') return rows;
    
    const lines = text.split(/\r?\n/);
    let currentLine = '';
    let inQuotes = false;
    
    // Handle multi-line quoted values
    for (let line of lines) {
        if (line.trim() === '' && !inQuotes) continue;
        
        // Count quotes in line
        const quoteCount = (line.match(/"/g) || []).length;
        
        if (inQuotes) {
            currentLine += '\n' + line;
            if (quoteCount % 2 !== 0) { // Odd number of quotes means we're closing a quoted section
                inQuotes = false;
            }
        } else {
            currentLine = line;
            if (quoteCount % 2 !== 0) { // Odd number of quotes means we're opening a quoted section
                inQuotes = true;
                continue;
            }
        }
        
        if (!inQuotes && currentLine.trim() !== '') {
            const row = parseCSVLineEnhanced(currentLine);
            if (row.length > 0) rows.push(row);
            currentLine = '';
        }
    }
    
    // Handle any remaining content
    if (currentLine.trim() !== '') {
        const row = parseCSVLineEnhanced(currentLine);
        if (row.length > 0) rows.push(row);
    }
    
    return rows;
}

function parseCSVLineEnhanced(line) {
    const row = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                currentField += '"';
                i++;
            } else {
                // Start or end of quoted field
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    
    // Add the last field
    row.push(currentField.trim());
    
    return row;
}

function displayListings() {
    const loadingDiv = document.getElementById('loading');
    const listingsSection = document.getElementById('listingsSection');
    const listingsContainer = document.getElementById('listingsContainer');
    const noItemsDiv = document.getElementById('noItems');
    const selectAllBtn = document.getElementById('selectAll');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    
    if (!userListings || userListings.length === 0) {
        displayNoItems();
        return;
    }
    
    if (listingsSection) listingsSection.style.display = 'block';
    if (noItemsDiv) noItemsDiv.style.display = 'none';
    
    if (listingsContainer) {
        listingsContainer.style.display = 'block';
        listingsContainer.innerHTML = '';
        
        userListings.forEach((item, index) => {
            const listing = item[CONFIG.COLUMNS.LISTING];
            const status = item[CONFIG.COLUMNS.STATUS] || '';
            const listingId = `listing_${Date.now()}_${index}`;
            
            const listingItem = document.createElement('div');
            listingItem.className = 'listing-item';
            listingItem.innerHTML = `
                <input type="checkbox" id="${listingId}" class="listing-checkbox" value="${listing}">
                <label for="${listingId}" class="listing-name">
                    <span class="listing-text">${listing}</span>
                </label>
            `;
            
            const checkbox = listingItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', updateConfirmButton);
            
            listingsContainer.appendChild(listingItem);
        });
    }
    
    if (selectAllBtn) {
        selectAllBtn.style.display = 'block';
        selectAllBtn.textContent = 'select all items you\'re collecting';
    }
    
    allCheckboxesSelected = false;
    updateConfirmButton();
}

function displayNoItems() {
    const loadingDiv = document.getElementById('loading');
    const listingsSection = document.getElementById('listingsSection');
    const noItemsDiv = document.getElementById('noItems');
    const listingsContainer = document.getElementById('listingsContainer');
    const selectAllBtn = document.getElementById('selectAll');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    
    if (listingsSection) listingsSection.style.display = 'block';
    if (noItemsDiv) noItemsDiv.style.display = 'block';
    if (listingsContainer) {
        listingsContainer.style.display = 'none';
        listingsContainer.innerHTML = '';
    }
    if (selectAllBtn) selectAllBtn.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = true;
}

function toggleSelectAll() {
    const listingsContainer = document.getElementById('listingsContainer');
    const selectAllBtn = document.getElementById('selectAll');
    const checkboxes = listingsContainer ? listingsContainer.querySelectorAll('input[type="checkbox"]') : [];
    
    if (checkboxes.length === 0) return;
    
    allCheckboxesSelected = !allCheckboxesSelected;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = allCheckboxesSelected;
    });
    
    if (selectAllBtn) {
        selectAllBtn.textContent = allCheckboxesSelected ? 
            'deselect all items' : 
            'select all items you\'re collecting';
    }
    
    updateConfirmButton();
}

function updateConfirmButton() {
    const listingsContainer = document.getElementById('listingsContainer');
    const confirmBtn = document.getElementById('confirmBtn');
    
    if (!confirmBtn) return;
    
    const checkboxes = listingsContainer ? listingsContainer.querySelectorAll('input[type="checkbox"]:checked') : [];
    confirmBtn.disabled = checkboxes.length === 0;
}

// ==================== BOOKING FUNCTIONS ====================

async function confirmBooking() {
    const usernameInput = document.getElementById('usernameInput');
    const listingsContainer = document.getElementById('listingsContainer');
    const confirmBtn = document.getElementById('confirmBtn');
    
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    if (!username || !username.startsWith('@')) {
        showMessage('Please enter a valid username starting with @', 'error');
        return;
    }
    
    // Get selected listings
    const checkboxes = listingsContainer ? listingsContainer.querySelectorAll('input[type="checkbox"]:checked') : [];
    if (checkboxes.length === 0) {
        showMessage('Please select at least one item to collect', 'error');
        return;
    }
    
    const selectedListings = Array.from(checkboxes).map(cb => cb.value);
    
    // Prepare booking data
    const bookingData = {
        username: username,
        listings: selectedListings.join(', '),
        date: selectedSlot.date,
        time: selectedSlot.time,
        location: selectedSlot.location,
        type: selectedSlot.type
    };
    
    console.log('Final booking data:', bookingData);
    
    // Disable confirm button
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'SAVING...';
    }
    
    // Save to localStorage
    const success = saveBookingToLocalStorage(bookingData);
    
    if (success) {
        // Show success confirmation
        showBookingConfirmation(bookingData, selectedListings);
    } else {
        showMessage('Failed to save booking. Please try again.', 'error');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'CONFIRM BOOKING';
        }
    }
}

function saveBookingToLocalStorage(bookingData) {
    try {
        console.log('Saving booking to localStorage:', bookingData);
        
        // Get existing bookings or create empty array
        const bookings = JSON.parse(localStorage.getItem('all_bookings') || '[]');
        
        console.log('Existing bookings before save:', bookings.length);
        
        // Create booking with metadata
        const bookingWithMeta = {
            id: 'BK' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase(),
            timestamp: new Date().toISOString(),
            status: 'confirmed',
            ...bookingData
        };
        
        console.log('➕ New booking to add:', bookingWithMeta);
        
        // Add to array
        bookings.push(bookingWithMeta);
        
        // Save back to localStorage
        localStorage.setItem('all_bookings', JSON.stringify(bookings));
        
        // Also save to sessionStorage for current user
        sessionStorage.setItem('last_booking', JSON.stringify(bookingWithMeta));
        
        // Verify save
        const stored = JSON.parse(localStorage.getItem('all_bookings') || '[]');
        console.log('Booking saved to localStorage. ID:', bookingWithMeta.id);
        console.log('Total bookings after save:', stored.length);
        
        // Export backup to JSON file (optional)
        exportBackupToFile(bookings);
        
        return true;
        
    } catch (error) {
        console.error('❌ Error saving to localStorage:', error);
        return false;
    }
}

function exportBackupToFile(bookings) {
    try {
        const dataStr = JSON.stringify(bookings, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Create download link (doesn't actually download unless clicked)
        const url = URL.createObjectURL(dataBlob);
        localStorage.setItem('bookings_backup_url', url);
        
        console.log('📁 Backup created');
    } catch (error) {
        console.error('Backup error:', error);
    }
}

// ==================== UI MESSAGE FUNCTIONS ====================

function showMessage(text, type = 'info') {
    const bookingMessage = document.getElementById('bookingMessage');
    if (!bookingMessage) return;
    
    bookingMessage.textContent = text;
    bookingMessage.className = `message ${type}`;
    bookingMessage.style.display = 'block';
    
    // Auto-hide info messages after 5 seconds
    if (type === 'info') {
        setTimeout(() => {
            bookingMessage.style.display = 'none';
        }, 5000);
    }
}

function showBookingConfirmation(bookingData, selectedListings) {
    // Hide the form elements
    const bookingForm = document.getElementById('bookingForm');
    const buttonGroup = document.querySelector('.button-group');
    const bookingMessage = document.getElementById('bookingMessage');
    
    if (bookingForm) bookingForm.style.display = 'none';
    if (buttonGroup) buttonGroup.style.display = 'none';
    if (bookingMessage) bookingMessage.style.display = 'none';
    
    // Create confirmation HTML
    const confirmationHTML = `
        <div class="confirmation-container" style="
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            text-align: center;
        ">
            <div style="font-size: 48px; color: #27ae60; margin-bottom: 20px;">✓</div>
            <h2 style="color: #2c3e50; margin-bottom: 10px;">BOOKING CONFIRMED!</h2>
            <p style="color: #7f8c8d; margin-bottom: 30px;">Your collection slot has been reserved.</p>
            
            <div style="
                background: #f8f9fa;
                border-radius: 8px;
                padding: 25px;
                margin: 25px 0;
                text-align: left;
            ">
                <h3 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    Booking Details
                </h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div>
                        <div style="font-weight: 600; color: #7f8c8d; font-size: 0.9rem;">USERNAME</div>
                        <div style="font-size: 1.1rem; color: #2c3e50;">${bookingData.username}</div>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #7f8c8d; font-size: 0.9rem;">DATE & TIME</div>
                        <div style="font-size: 1.1rem; color: #2c3e50;">${formatDate(bookingData.date)} ${bookingData.time}</div>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #7f8c8d; font-size: 0.9rem;">LOCATION</div>
                        <div style="font-size: 1.1rem; color: #2c3e50;">${bookingData.location}</div>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #7f8c8d; font-size: 0.9rem;">TYPE</div>
                        <div style="font-size: 1.1rem; color: #2c3e50;">${bookingData.type}</div>
                    </div>
                </div>
                
                <div>
                    <div style="font-weight: 600; color: #7f8c8d; font-size: 0.9rem; margin-bottom: 10px;">ITEMS TO COLLECT</div>
                    <div style="
                        background: white;
                        border-radius: 6px;
                        padding: 15px;
                        border: 1px solid #e0e0e0;
                    ">
                        <ul style="margin: 0; padding-left: 20px;">
                            ${selectedListings.map(item => `<li style="margin-bottom: 5px; color: #2c3e50;">${item}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
            
            <div style="
                background: #e8f5e9;
                border: 1px solid #c8e6c9;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                text-align: left;
            ">
                <div style="font-weight: 600; color: #2e7d32; margin-bottom: 5px;">📝 Booking Reference:</div>
                <div style="font-family: monospace; color: #2c3e50; font-size: 0.9rem;">
                    ${bookingData.username.substring(1)}_${bookingData.date.replace(/\//g, '')}_${Math.random().toString(36).substr(2, 6).toUpperCase()}
                </div>
            </div>
            
            <div style="color: #7f8c8d; font-size: 0.9rem; margin: 20px 0; line-height: 1.5;">
                <p>collection slot has been confirmed</p>
                <p>do take a screenshot of this page for your records in case of any discrepancies</p>
                <p>please arrive on time for your collection slot.</p>
                <p>do bring your own carrier.</p>            
            </div>
            
            <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px; flex-wrap: wrap;">
                <button onclick="window.location.href='index.html'" style="
                    padding: 12px 30px;
                    background: #3498db;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 16px;
                ">
                    <i class="fas fa-home"></i> Return to Dashboard
                </button>
            </div>
        </div>
    `;
    
    // Insert confirmation into the page
    const container = document.querySelector('.booking-container');
    const confirmationDiv = document.createElement('div');
    confirmationDiv.innerHTML = confirmationHTML;
    container.appendChild(confirmationDiv);
}

// ==================== UTILITY FUNCTIONS ====================

function formatDate(dateStr) {
    if (!dateStr) return '';
    
    // Try to parse various date formats
    const formats = [
        /(\d{4})-(\d{1,2})-(\d{1,2})/,  // YYYY-MM-DD
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
        /(\d{1,2})-(\d{1,2})-(\d{4})/   // DD-MM-YYYY or MM-DD-YYYY
    ];
    
    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            let day, month, year;
            
            if (format === formats[0]) {
                // YYYY-MM-DD
                year = match[1];
                month = match[2].padStart(2, '0');
                day = match[3].padStart(2, '0');
            } else if (format === formats[1]) {
                // DD/MM/YYYY
                day = match[1].padStart(2, '0');
                month = match[2].padStart(2, '0');
                year = match[3];
            } else {
                // Try to guess format
                const first = parseInt(match[1], 10);
                const second = parseInt(match[2], 10);
                
                if (first > 12) {
                    // Probably DD-MM-YYYY
                    day = match[1].padStart(2, '0');
                    month = match[2].padStart(2, '0');
                    year = match[3];
                } else {
                    // Probably MM-DD-YYYY
                    month = match[1].padStart(2, '0');
                    day = match[2].padStart(2, '0');
                    year = match[3];
                }
            }
            
            return `${day}/${month}/${year}`;
        }
    }
    
    return dateStr;
}

// Check existing bookings on load
function checkExistingBookings() {
    const bookings = JSON.parse(localStorage.getItem('all_bookings') || '[]');
    console.log(`📊 System check: Found ${bookings.length} existing bookings in localStorage`);
    
    if (bookings.length > 0) {
        console.log('📋 Recent bookings:');
        bookings.slice(-5).forEach((b, i) => {
            console.log(`  ${i + 1}. ${b.username} - ${b.date} ${b.time}`);
        });
    }
}

// Debug function to check storage
function checkStorage() {
    const bookings = JSON.parse(localStorage.getItem('all_bookings') || '[]');
    const lastBooking = JSON.parse(sessionStorage.getItem('last_booking') || 'null');
    
    const message = `
📊 **STORAGE DEBUG INFO**

LocalStorage (all_bookings):
- Total bookings: ${bookings.length}
- Last booking: ${lastBooking ? `${lastBooking.username} - ${lastBooking.date}` : 'None'}

SessionStorage (last_booking):
- ${lastBooking ? `User: ${lastBooking.username}, Date: ${lastBooking.date}` : 'No recent booking'}

**Recent Bookings:**
${bookings.slice(-3).map(b => `• ${b.username} - ${b.date} ${b.time}`).join('\n') || 'No bookings'}

**To verify in Admin Panel:**
1. Open admin-view.html
2. Click Refresh button
3. Should show ${bookings.length} bookings
    `;
    
    alert(message);
    console.log('📋 Storage details:', {
        localStorage: bookings,
        sessionStorage: lastBooking
    });
}

// Test function to check localStorage
function testLocalStorage() {
    const bookings = JSON.parse(localStorage.getItem('all_bookings') || '[]');
    console.log('📊 Test - Bookings in localStorage:', bookings.length);
    bookings.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.username} - ${b.date} ${b.time} (ID: ${b.id})`);
    });
    
    const lastBooking = JSON.parse(sessionStorage.getItem('last_booking') || 'null');
    console.log('📝 Last booking (sessionStorage):', lastBooking);
    
    return bookings.length;
}

// Clear all local bookings (for testing)
function clearLocalBookings() {
    if (confirm('Clear ALL local bookings? This cannot be undone!')) {
        localStorage.removeItem('all_bookings');
        localStorage.removeItem('bookings_pending');
        localStorage.removeItem('bookings_success');
        console.log('🗑️ All local bookings cleared');
        alert('All bookings cleared from localStorage');
    }
}

// Export all bookings to JSON file
function exportAllBookings() {
    const bookings = JSON.parse(localStorage.getItem('all_bookings') || '[]');
    if (bookings.length === 0) {
        alert('No bookings to export');
        return;
    }
    
    const dataStr = JSON.stringify(bookings, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookings_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`Exported ${bookings.length} bookings to JSON file`);
}