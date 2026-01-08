// Configuration
const CONFIG = {
    SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPaO7eZrkPjvuzf22ynIj125_o0mEY3SplClk3NTuTIHRxddmignA-nCqvdC4ApNptedM3OSAlKY9c/pub?gid=27369847&single=true&output=csv",
    MEETUP_SHEET_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNOxQuuN40JVvEnEwZ7ERRaUzYwOm751xtw_aB3ZrIIoM_iWquXWPGJNloTNOoKjxoLUBcDGVmSboa/pub?gid=583970895&single=true&output=csv",
    COLUMNS: {
        LISTING: 1,
        USERNAME: 2,
        ORDER: 3,
        FP_PAYMENT: 4,
        SP_PAYMENT: 5,
        NM_PAYMENT: 6,
        STATUS: 7,
        DEADLINE: 8
    },
    MEETUP_COLUMNS: {
        DATE: 0,
        LOCATION: 1,
        TIME: 2,
        TYPE: 3,
        SLOTS: 4
    },
    RETRY_COUNT: 3,
    RETRY_DELAY: 1000,
    TIMEOUT: 10000
};

// Global State
let allData = [];
let meetupData = [];
let isDataLoaded = false;
let isMeetupDataLoaded = false;
let listingsSummaryData = [];
let retryAttempts = { data: 0, meetup: 0 };

// DOM Elements
let usernameInput, messageDiv, resultsContainer, resultsBody, resultsTitle;
let loadingDiv, listingsLoadingDiv, meetupLoadingDiv, summaryBody, lastUpdatedDiv, searchBtn;
let meetupInfoDiv, meetupSlotsDiv, selfcollectSlotsDiv;

// Utility Functions
function showLoading(show) {
    if (loadingDiv) loadingDiv.classList.toggle('active', show);
}

function showListingsLoading(show) {
    if (listingsLoadingDiv) listingsLoadingDiv.classList.toggle('active', show);
}

function showMeetupLoading(show) {
    if (meetupLoadingDiv) meetupLoadingDiv.classList.toggle('active', show);
}

function showMessage(text, type = 'info') {
    if (messageDiv) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
    }
}

// Enhanced Error Handling
function handleError(error, context) {
    console.error(`${context}:`, error);
    
    if (context.includes('meetup')) {
        showMessage(`Meetup data temporarily unavailable. Please try again in a moment.`, 'error');
    } else {
        showMessage(`Data temporarily unavailable. Please try again in a moment.`, 'error');
    }
    
    // Auto-retry after delay
    if (context === 'Data load failed' && retryAttempts.data < CONFIG.RETRY_COUNT) {
        retryAttempts.data++;
        setTimeout(() => {
            showMessage(`Retrying data load (attempt ${retryAttempts.data}/${CONFIG.RETRY_COUNT})...`, 'info');
            loadData();
        }, CONFIG.RETRY_DELAY * retryAttempts.data);
    } else if (context === 'Meetup data load failed' && retryAttempts.meetup < CONFIG.RETRY_COUNT) {
        retryAttempts.meetup++;
        setTimeout(() => {
            showMessage(`Retrying meetup data load (attempt ${retryAttempts.meetup}/${CONFIG.RETRY_COUNT})...`, 'info');
            loadMeetupData();
        }, CONFIG.RETRY_DELAY * retryAttempts.meetup);
    }
}

// Tab Management
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Activate selected tab
    const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    const activeContent = document.getElementById(`${tabName}Tab`);
    if (activeContent) activeContent.classList.add('active');
    
    // Load data if needed
    if (tabName === 'listings' && !isDataLoaded) {
        loadData();
    } else if (tabName === 'listings' && isDataLoaded && listingsSummaryData.length === 0) {
        generateListingsSummary();
    } else if (tabName === 'meetup' && !isMeetupDataLoaded) {
        loadMeetupData();
    }
}

// Data Parsing - Enhanced CSV parser
function parseCSV(text) {
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
            const row = parseCSVLine(currentLine);
            if (row.length > 0) rows.push(row);
            currentLine = '';
        }
    }
    
    // Handle any remaining content
    if (currentLine.trim() !== '') {
        const row = parseCSVLine(currentLine);
        if (row.length > 0) rows.push(row);
    }
    
    return rows;
}

function parseCSVLine(line) {
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

// Enhanced Fetch with multiple fallback options
async function fetchWithFallback(url, context) {
    const proxies = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest='
    ];
    
    const cacheBuster = "&t=" + new Date().getTime();
    const finalUrl = url + cacheBuster;
    
    // Try direct fetch first (works in some environments)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
        
        const directResponse = await fetch(finalUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'text/csv',
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (directResponse.ok) {
            return await directResponse.text();
        }
    } catch (directError) {
        console.log(`Direct fetch failed for ${context}, trying proxies...`);
    }
    
    // Try each proxy
    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
            
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
                    return text;
                }
            }
        } catch (proxyError) {
            console.log(`Proxy ${proxy} failed for ${context}:`, proxyError);
            continue;
        }
    }
    
    throw new Error(`All fetch attempts failed for ${context}`);
}

// Data Fetching with improved error handling
async function fetchData() {
    try {
        return await fetchWithFallback(CONFIG.SHEET_URL, 'orders data');
    } catch (e) {
        throw new Error('Data load failed: ' + e.message);
    }
}

async function fetchMeetupData() {
    try {
        return await fetchWithFallback(CONFIG.MEETUP_SHEET_URL, 'meetup data');
    } catch (e) {
        throw new Error('Meetup data load failed: ' + e.message);
    }
}

// Data Loading with validation
async function loadData() {
    if (isDataLoaded) return true;
    
    showListingsLoading(true);
    
    try {
        const csvText = await fetchData();
        
        // Validate data
        if (!csvText || csvText.trim() === '') {
            throw new Error('Received empty data from server');
        }
        
        const parsedData = parseCSV(csvText);
        
        if (parsedData.length <= 1) {
            throw new Error('Insufficient data in spreadsheet');
        }
        
        allData = parsedData;
        isDataLoaded = true;
        retryAttempts.data = 0; // Reset retry counter on success
        
        showListingsLoading(false);
        updateLastUpdated();
        
        generateListingsSummary();
        return true;
    } catch (error) {
        showListingsLoading(false);
        handleError(error, 'Data load failed');
        return false;
    }
}

async function loadMeetupData() {
    if (isMeetupDataLoaded) return true;
    
    showMeetupLoading(true);
    
    try {
        const csvText = await fetchMeetupData();
        
        // Validate data
        if (!csvText || csvText.trim() === '') {
            throw new Error('Received empty meetup data');
        }
        
        const parsedData = parseCSV(csvText);
        
        if (parsedData.length <= 0) {
            throw new Error('No meetup slots found in spreadsheet');
        }
        
        meetupData = parsedData;
        isMeetupDataLoaded = true;
        retryAttempts.meetup = 0; // Reset retry counter on success
        
        showMeetupLoading(false);
        displayMeetupSlots();
        return true;
    } catch (error) {
        showMeetupLoading(false);
        handleError(error, 'Meetup data load failed');
        return false;
    }
}

function updateLastUpdated() {
    if (lastUpdatedDiv) {
        const now = new Date();
        lastUpdatedDiv.textContent = `Data last synced: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    }
}

// Status and Payment Classification
function checkForCollected(value) {
    const val = String(value || '').toLowerCase().trim();
    return val.includes('collected');
}

function getStatusClass(status) {
    const s = String(status || '').toLowerCase().trim();
    
    if (checkForCollected(s)) return 'status-collected';
    if (s === 'ordered' || s.includes('ordered')) return 'status-ordered';
    if (s === 'at kadd' || s.includes('at kadd')) return 'status-atkadd';
    if (s === 'otw to sg' || s.includes('otw') || s.includes('to sg')) return 'status-otwtosg';
    if (s === 'ready for collection' || s.includes('ready') || s.includes('collection')) return 'status-ready';
    if (s === 'unpaid' || s.includes('unpaid')) return 'status-unpaid';
    if (s === 'paid' || s.includes('paid')) return 'status-paid';
    if (s === 'at cadd' || s.includes('at cadd')) return 'status-atcadd';
    if (s === 'at jadd' || s.includes('at jadd')) return 'status-atjadd';
    
    return 'status-ordered';
}

function getPaymentClass(payment) {
    const p = String(payment || '').toLowerCase().trim();
    
    if (!p || p === '-' || p === '') return 'payment-empty';
    if (checkForCollected(p)) return 'payment-collected';
    if (p.includes('unpaid')) return 'payment-unpaid';
    if (p.includes('paid')) return 'payment-paid';
    
    return 'payment-pending';
}

function formatPaymentCell(paymentValue) {
    const p = String(paymentValue || '').trim();
    return p === '' ? '-' : p;
}

function formatDeadline(deadlineValue) {
    const d = String(deadlineValue || '').trim();
    
    if (d === '' || d === '-' || d.toLowerCase() === 'blank') {
        return '-';
    }
    
    try {
        let date;
        
        // Multiple date format attempts
        if (d.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/)) {
            const parts = d.split(/[\/\-]/);
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            date = new Date(year, month, day);
        } else {
            date = new Date(d);
        }
        
        if (date && !isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        console.log('Date parsing failed for:', d, e);
    }
    
    return d;
}

// Listings Summary
function getAllListingsSummary(orders) {
    const listingStatusMap = {};
    const dataStartRow = Math.max(1, Math.min(4, orders.length - 1)); // Safe start index
    
    for (let i = dataStartRow; i < orders.length; i++) {
        const order = orders[i];
        if (!order || order.length <= CONFIG.COLUMNS.LISTING) continue;
        
        const listing = order[CONFIG.COLUMNS.LISTING] || 'Unknown';
        const status = order[CONFIG.COLUMNS.STATUS] || 'ordered';
        
        if (!listing || listing === '' || listing === 'Unknown') continue;
        if (!listingStatusMap[listing]) listingStatusMap[listing] = {};
        if (!listingStatusMap[listing][status]) listingStatusMap[listing][status] = 0;
        
        listingStatusMap[listing][status]++;
    }
    
    const result = [];
    for (const [listing, statusCounts] of Object.entries(listingStatusMap)) {
        let mostFrequentStatus = '';
        let highestCount = 0;
        
        for (const [status, count] of Object.entries(statusCounts)) {
            if (count > highestCount) {
                highestCount = count;
                mostFrequentStatus = status;
            }
        }
        result.push({ listing, status: mostFrequentStatus });
    }
    
    result.sort((a, b) => a.listing.localeCompare(b.listing));
    return result;
}

function generateListingsSummary() {
    if (allData.length <= 1) {
        summaryBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">No listings data available</td></tr>';
        return;
    }
    
    const orders = allData.slice(1);
    listingsSummaryData = getAllListingsSummary(orders);
    
    if (summaryBody) {
        summaryBody.innerHTML = '';
        
        if (listingsSummaryData.length === 0) {
            summaryBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">No listings found</td></tr>';
            return;
        }
        
        listingsSummaryData.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${item.listing}</strong></td>
                <td><span class="${getStatusClass(item.status)}" title="${item.status}">${item.status}</span></td>
            `;
            summaryBody.appendChild(row);
        });
    }
}

// Meetup Slots Display with Book Slot buttons
function displayMeetupSlots() {
    if (!meetupSlotsDiv || !selfcollectSlotsDiv) return;
    
    if (meetupData.length <= 1) {
        meetupSlotsDiv.innerHTML = '<tr><td colspan="4" style="text-align: center;">No meetup slots available</td></tr>';
        selfcollectSlotsDiv.innerHTML = '<tr><td colspan="4" style="text-align: center;">No self-collect slots available</td></tr>';
        return;
    }
    
    const slots = meetupData.slice(1);
    let meetupRows = '';
    let selfcollectRows = '';
    
    slots.forEach(slot => {
        if (!slot || slot.length < 3) return;
        
        const date = slot[CONFIG.MEETUP_COLUMNS.DATE] || '';
        const location = slot[CONFIG.MEETUP_COLUMNS.LOCATION] || '';
        const time = slot[CONFIG.MEETUP_COLUMNS.TIME] || '';
        const type = (slot[CONFIG.MEETUP_COLUMNS.TYPE] || '').toLowerCase().trim();
        const slotsCount = slot[CONFIG.MEETUP_COLUMNS.SLOTS] || '';
        
        if (!date || !location || !time) return;
        
        // Create booking URL with parameters
        const bookingUrl = `booking.html?date=${encodeURIComponent(date)}&location=${encodeURIComponent(location)}&time=${encodeURIComponent(time)}&type=${encodeURIComponent(type)}${slotsCount ? '&slots=' + encodeURIComponent(slotsCount) : ''}`;
        
        const row = `
            <tr>
                <td>${date}</td>
                <td>${location}</td>
                <td>${time}</td>
                <td><a href="${bookingUrl}" class="book-slot-btn">Book Slot</a></td>
            </tr>
        `;
        
        if (type.includes('meetup')) {
            meetupRows += row;
        } else if (type.includes('self collect') || type.includes('self-collect') || type.includes('self')) {
            selfcollectRows += row;
        }
    });
    
    meetupSlotsDiv.innerHTML = meetupRows || '<tr><td colspan="4" style="text-align: center;">No meetup slots available</td></tr>';
    selfcollectSlotsDiv.innerHTML = selfcollectRows || '<tr><td colspan="4" style="text-align: center;">No self-collect slots available</td></tr>';
}

// Search Functionality with validation
async function searchOrders() {
    const username = usernameInput.value.trim().toLowerCase();
    
    if (!username) {
        showMessage('Please enter a username', 'error');
        return;
    }
    
    if (!username.startsWith('@')) {
        showMessage('Username must start with @', 'error');
        return;
    }
    
    if (!isDataLoaded) {
        showLoading(true);
        showMessage('Loading data...', 'info');
        
        if (!await loadData()) {
            showLoading(false);
            return;
        }
        showLoading(false);
    }
    
    // Validate data exists
    if (allData.length <= 1) {
        showMessage('No data available. Please try reloading.', 'error');
        return;
    }
    
    const filtered = allData.slice(1).filter(row => {
        if (!row || row.length <= CONFIG.COLUMNS.USERNAME) return false;
        const rowUsername = row[CONFIG.COLUMNS.USERNAME];
        return rowUsername && rowUsername.toLowerCase().trim() === username;
    });
    
    displayResults(filtered, username);
}

function displayResults(orders, username) {
    if (!resultsBody || !resultsTitle || !resultsContainer) return;
    
    resultsBody.innerHTML = '';
    
    if (orders.length === 0) {
        resultsContainer.classList.remove('show');
        showMessage(`No orders found for "${username}"`, 'error');
        return;
    }
    
    resultsTitle.textContent = `orders for ${username}`;
    
    orders.forEach(order => {
        if (!order) return;
        
        const row = document.createElement('tr');
        const fp = order[CONFIG.COLUMNS.FP_PAYMENT] || '';
        const sp = order[CONFIG.COLUMNS.SP_PAYMENT] || '';
        const nm = order[CONFIG.COLUMNS.NM_PAYMENT] || '';
        const st = order[CONFIG.COLUMNS.STATUS] || 'Ordered';
        const deadline = order[CONFIG.COLUMNS.DEADLINE] || '';
        
        row.innerHTML = `
            <td>${order[CONFIG.COLUMNS.LISTING] || '-'}</td>
            <td><strong>${order[CONFIG.COLUMNS.USERNAME]}</strong></td>
            <td>${order[CONFIG.COLUMNS.ORDER] || '-'}</td>
            <td><span class="payment-status ${getPaymentClass(fp)}" title="${fp || 'Empty'}">${formatPaymentCell(fp)}</span></td>
            <td><span class="payment-status ${getPaymentClass(sp)}" title="${sp || 'Empty'}">${formatPaymentCell(sp)}</span></td>
            <td><span class="payment-status ${getPaymentClass(nm)}" title="${nm || 'Empty'}">${formatPaymentCell(nm)}</span></td>
            <td><span class="${getStatusClass(st)}" title="${st}">${st}</span></td>
            <td>${formatDeadline(deadline)}</td>
        `;
        resultsBody.appendChild(row);
    });
    
    resultsContainer.classList.add('show');
    showMessage(`Found ${orders.length} order(s)`, 'success');
}

// Manual refresh function
function refreshData() {
    if (isDataLoaded) {
        isDataLoaded = false;
        allData = [];
        listingsSummaryData = [];
        showMessage('Refreshing data...', 'info');
        loadData();
    }
}

function refreshMeetupData() {
    if (isMeetupDataLoaded) {
        isMeetupDataLoaded = false;
        meetupData = [];
        showMessage('Refreshing meetup slots...', 'info');
        loadMeetupData();
    }
}

// Event Listeners with error handling
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            try {
                const tabName = tab.getAttribute('data-tab');
                switchTab(tabName);
            } catch (error) {
                console.error('Tab switch error:', error);
                showMessage('Error switching tabs. Please refresh the page.', 'error');
            }
        });
    });
    
    // Search button
    if (searchBtn) {
        searchBtn.addEventListener('click', searchOrders);
    }
    
    // Enter key in search input
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchOrders();
            }
        });
    }
    
    // Add refresh buttons if needed
    addRefreshButtons();
}

function addRefreshButtons() {
    // Add refresh button to listings tab
    const listingsHeader = document.querySelector('#listingsTab h2');
    if (listingsHeader && !document.getElementById('refreshListingsBtn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refreshListingsBtn';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.style.marginLeft = '15px';
        refreshBtn.style.padding = '5px 10px';
        refreshBtn.style.fontSize = '14px';
        refreshBtn.style.backgroundColor = '#f0f0f0';
        refreshBtn.style.color = '#333';
        refreshBtn.addEventListener('click', refreshData);
        listingsHeader.appendChild(refreshBtn);
    }
    
    // Add refresh button to meetup tab
    const meetupHeader = document.querySelector('#meetupTab .meetup-header h2');
    if (meetupHeader && !document.getElementById('refreshMeetupBtn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refreshMeetupBtn';
        refreshBtn.textContent = 'Refresh';
        refreshBtn.style.marginLeft = '15px';
        refreshBtn.style.padding = '5px 10px';
        refreshBtn.style.fontSize = '14px';
        refreshBtn.style.backgroundColor = '#f0f0f0';
        refreshBtn.style.color = '#333';
        refreshBtn.addEventListener('click', refreshMeetupData);
        meetupHeader.appendChild(refreshBtn);
    }
}

// Initialize Application with safety checks
function initializeApp() {
    try {
        // Cache DOM elements with null checks
        usernameInput = document.getElementById('usernameInput');
        messageDiv = document.getElementById('message');
        resultsContainer = document.getElementById('resultsContainer');
        resultsBody = document.getElementById('resultsBody');
        resultsTitle = document.getElementById('resultsTitle');
        loadingDiv = document.getElementById('loading');
        listingsLoadingDiv = document.getElementById('listingsLoading');
        meetupLoadingDiv = document.getElementById('meetupLoading');
        summaryBody = document.getElementById('summaryBody');
        lastUpdatedDiv = document.getElementById('lastUpdated');
        searchBtn = document.getElementById('searchBtn');
        
        // Meetup tab elements
        meetupInfoDiv = document.getElementById('meetupInfo');
        meetupSlotsDiv = document.getElementById('meetupSlotsBody');
        selfcollectSlotsDiv = document.getElementById('selfcollectSlotsBody');
        
        // Validate required elements
        if (!usernameInput || !messageDiv) {
            throw new Error('Required DOM elements not found');
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Show loading state
        showMessage('Loading application...', 'info');
        
        // Initial data load with delay to ensure DOM is ready
        setTimeout(() => {
            loadData();
        }, 500);
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        if (messageDiv) {
            messageDiv.textContent = 'Application failed to initialize. Please refresh the page.';
            messageDiv.className = 'message error';
        }
    }
}

// Add offline detection
window.addEventListener('online', () => {
    showMessage('Back online. Data will refresh automatically.', 'success');
    setTimeout(() => {
        if (!isDataLoaded) loadData();
        if (!isMeetupDataLoaded) loadMeetupData();
    }, 1000);
});

window.addEventListener('offline', () => {
    showMessage('You are offline. Some features may not work.', 'error');
});

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM already loaded
    initializeApp();
}