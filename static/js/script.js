// DOM Elements
const ipInput = document.getElementById('ip');
const portInput = document.getElementById('port');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionMessage = document.getElementById('connectionMessage');
const collectionSelect = document.getElementById('collectionSelect');
const loadDataBtn = document.getElementById('loadDataBtn');
const dataCount = document.getElementById('dataCount');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const dataContainer = document.getElementById('dataContainer');
const emptyState = document.getElementById('emptyState');
const showEmbeddingsCheckbox = document.getElementById('showEmbeddings');
const paginationContainer = document.getElementById('paginationContainer');
const paginationUl = document.querySelector('.pagination');
const prevPageItem = document.getElementById('prevPageItem');
const prevPageLink = document.getElementById('prevPageLink');
const nextPageItem = document.getElementById('nextPageItem');
const nextPageLink = document.getElementById('nextPageLink');
const pageInfo = document.getElementById('pageInfo');
const pageJumpInput = document.getElementById('pageJumpInput');
const pageJumpBtn = document.getElementById('pageJumpBtn');

// Current state
let currentCollection = null;
let currentPage = 1;
let totalPages = 1;
let totalDocuments = 0;
let limit = 10;

// Event Listeners
connectBtn.addEventListener('click', handleConnect);
loadDataBtn.addEventListener('click', handleLoadData);
collectionSelect.addEventListener('change', handleCollectionChange);
showEmbeddingsCheckbox.addEventListener('change', toggleEmbeddings);
prevPageLink.addEventListener('click', handlePrevPage);
nextPageLink.addEventListener('click', handleNextPage);
pageJumpBtn.addEventListener('click', handlePageJump);
pageJumpInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handlePageJump();
    }
});

/**
 * Handle connect button click
 */
async function handleConnect() {
    const ip = ipInput.value.trim();
    const port = portInput.value.trim();
    
    // Validate inputs
    if (!ip) {
        showConnectionMessage('Please enter an IP address', 'error');
        return;
    }
    
    if (!port || isNaN(port)) {
        showConnectionMessage('Please enter a valid port', 'error');
        return;
    }
    
    // Show connecting status
    connectionStatus.className = 'status-indicator connecting';
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    showConnectionMessage('Connecting to ChromaDB...', 'info');
    
    try {
        // Send connect request
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ip, port })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Update UI on success
            connectionStatus.className = 'status-indicator connected';
            showConnectionMessage(result.message, 'success');
            
            // Update collections dropdown
            updateCollections(result.collections);
            
            // Enable collection selection
            collectionSelect.disabled = false;
            
        } else {
            // Show error message
            connectionStatus.className = 'status-indicator';
            showConnectionMessage(result.message, 'error');
        }
    } catch (error) {
        // Handle network errors
        connectionStatus.className = 'status-indicator';
        showConnectionMessage(`Connection failed: ${error.message}`, 'error');
    } finally {
        // Reset button state
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
    }
}

/**
 * Update collections dropdown
 * @param {Array} collections - List of collection names
 */
function updateCollections(collections) {
    // Clear existing options except the first one
    const firstOption = collectionSelect.firstElementChild;
    collectionSelect.innerHTML = '';
    collectionSelect.appendChild(firstOption);
    
    // Add new options
    collections.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection;
        option.textContent = collection;
        collectionSelect.appendChild(option);
    });
    
    // Reset current collection
    currentCollection = null;
    loadDataBtn.disabled = true;
}

/**
 * Handle collection selection change
 */
function handleCollectionChange() {
    const selectedCollection = collectionSelect.value;
    currentCollection = selectedCollection;
    
    if (selectedCollection) {
        loadDataBtn.disabled = false;
        loadDataBtn.textContent = 'Load Data';
        dataCount.textContent = '';
    } else {
        loadDataBtn.disabled = true;
        dataCount.textContent = '';
    }
    
    // Clear data container
    clearData();
}

/**
 * Handle load data button click
 */
async function handleLoadData() {
    if (!currentCollection) {
        return;
    }
    
    // Reset to first page when loading new collection
    currentPage = 1;
    
    // Show loading state
    showLoading(true);
    clearError();
    
    try {
        // Fetch collection data with pagination
        const response = await fetch(`/api/collection/${encodeURIComponent(currentCollection)}?page=${currentPage}&limit=${limit}`);
        
        // Debug: check response status
        console.log('Response status:', response.status);
        
        const result = await response.json();
        
        // Debug: check response data
        console.log('Response data:', result);
        
        if (result.status === 'success') {
            // Display data
            displayData(result.data);
        } else {
            // Show error
            showError(result.message);
        }
    } catch (error) {
        // Handle network errors
        console.error('Fetch error:', error);
        showError(`Failed to load data: ${error.message}`);
    } finally {
        // Hide loading state
        showLoading(false);
    }
}

/**
 * Load data for a specific page
 * @param {number} page - Page number to load
 */
async function loadPage(page) {
    if (!currentCollection) {
        return;
    }
    
    // Update current page
    currentPage = page;
    
    // Show loading state
    showLoading(true);
    clearError();
    
    try {
        // Fetch collection data for specific page
        const response = await fetch(`/api/collection/${encodeURIComponent(currentCollection)}?page=${currentPage}&limit=${limit}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            // Display data
            displayData(result.data);
        } else {
            // Show error
            showError(result.message);
        }
    } catch (error) {
        // Handle network errors
        showError(`Failed to load data: ${error.message}`);
    } finally {
        // Hide loading state
        showLoading(false);
    }
}

/**
 * Display collection data
 * @param {Object} data - Collection data
 */
function displayData(data) {
    // Clear data container
    dataContainer.innerHTML = '';
    
    // Update pagination state
    totalDocuments = data.count;
    totalPages = data.total_pages;
    
    // Update data count
    dataCount.textContent = `Total documents: ${totalDocuments}`;
    
    // Check if there are documents
    if (data.count === 0) {
        dataContainer.innerHTML = '<p class="text-center text-muted">No documents in this collection</p>';
        showDataContainer(true);
        hidePagination();
        return;
    }
    
    // Get all arrays
    const ids = data.ids || [];
    const documents = data.documents || [];
    const metadatas = data.metadatas || [];
    const embeddings = data.embeddings || [];
    
    // Display each document
    for (let i = 0; i < ids.length; i++) {
        const documentItem = createDocumentItem({
            id: ids[i],
            document: documents[i] || '',
            metadata: metadatas[i] || {},
            embedding: embeddings[i] || []
        });
        dataContainer.appendChild(documentItem);
    }
    
    // Show data container and pagination
    showDataContainer(true);
    updatePagination();
    
    // Apply embeddings visibility
    toggleEmbeddings();
}

/**
 * Handle previous page click
 */
function handlePrevPage(e) {
    e.preventDefault();
    if (currentPage > 1) {
        loadPage(currentPage - 1);
    }
}

/**
 * Handle next page click
 */
function handleNextPage(e) {
    e.preventDefault();
    if (currentPage < totalPages) {
        loadPage(currentPage + 1);
    }
}

/**
 * Update pagination controls
 */
function updatePagination() {
    // Update page info
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalDocuments} documents)`;
    
    // Update prev/next buttons
    prevPageItem.classList.toggle('disabled', currentPage === 1);
    nextPageItem.classList.toggle('disabled', currentPage === totalPages);
    
    // Update page jump input
    pageJumpInput.value = currentPage;
    pageJumpInput.max = totalPages;
    
    // Generate page numbers
    generatePageNumbers();
    
    // Show pagination container
    paginationContainer.classList.remove('d-none');
}

/**
 * Handle page jump button click
 */
function handlePageJump() {
    const targetPage = parseInt(pageJumpInput.value);
    
    // Validate input
    if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
        // Show error message
        showError(`Please enter a valid page number between 1 and ${totalPages}`);
        return;
    }
    
    // Load the target page
    loadPage(targetPage);
}

/**
 * Generate page number buttons
 */
function generatePageNumbers() {
    // Remove any existing page number items
    // Find and remove all li elements between prevPageItem and the jump input
    const prevItem = prevPageItem;
    const jumpItem = pageJumpBtn.closest('li');
    
    let current = prevItem.nextSibling;
    while (current && current !== jumpItem) {
        const next = current.nextSibling;
        if (current.tagName === 'LI') {
            current.remove();
        }
        current = next;
    }
    
    // Calculate page range to display
    let startPage = 1;
    let endPage = Math.min(5, totalPages);
    
    // Create page number buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageItem = document.createElement('li');
        pageItem.className = `page-item ${i === currentPage ? 'active' : ''}`;
        
        const pageLink = document.createElement('a');
        pageLink.className = 'page-link';
        pageLink.href = '#';
        pageLink.textContent = i;
        pageLink.addEventListener('click', (e) => {
            e.preventDefault();
            loadPage(i);
        });
        
        pageItem.appendChild(pageLink);
        
        // Insert after prevPageItem
        paginationUl.insertBefore(pageItem, jumpItem);
    }
    
    // If there are more than 5 pages, add an ellipsis and last page button
    if (totalPages > 5) {
        // Add ellipsis
        const ellipsisItem = document.createElement('li');
        ellipsisItem.className = 'page-item disabled';
        ellipsisItem.innerHTML = '<span class="page-link">...</span>';
        paginationUl.insertBefore(ellipsisItem, jumpItem);
        
        // Add last page button
        const lastPageItem = document.createElement('li');
        lastPageItem.className = `page-item ${totalPages === currentPage ? 'active' : ''}`;
        
        const lastPageLink = document.createElement('a');
        lastPageLink.className = 'page-link';
        lastPageLink.href = '#';
        lastPageLink.textContent = totalPages;
        lastPageLink.addEventListener('click', (e) => {
            e.preventDefault();
            loadPage(totalPages);
        });
        
        lastPageItem.appendChild(lastPageLink);
        paginationUl.insertBefore(lastPageItem, jumpItem);
    }
}

/**
 * Hide pagination container
 */
function hidePagination() {
    paginationContainer.classList.add('d-none');
}

/**
 * Create a document item element
 * @param {Object} item - Document data
 * @returns {HTMLElement} - Document item element
 */
function createDocumentItem(item) {
    const div = document.createElement('div');
    div.className = 'document-item fade-in';
    
    // Format metadata as pretty JSON
    const formattedMetadata = JSON.stringify(item.metadata, null, 2);
    
    // Format embedding as string
    const embeddingString = Array.isArray(item.embedding) ? 
        `[${item.embedding.slice(0, 5).join(', ')}${item.embedding.length > 5 ? ', ...' : ''}]` : 
        String(item.embedding);
    
    div.innerHTML = `
        <div class="document-header">
            <div>
                <span class="document-id">ID: ${item.id}</span>
            </div>
        </div>
        
        <div class="document-section">
            <h6>Document Content</h6>
            <div class="document-content">${item.document || '(empty)'}</div>
        </div>
        
        <div class="document-section">
            <h6>Metadata</h6>
            <div class="metadata-content">${formattedMetadata}</div>
        </div>
        
        <div class="document-section embedding-section">
            <h6>Embedding (first 5 values)</h6>
            <div class="embedding-content">${embeddingString}</div>
        </div>
    `;
    
    return div;
}

/**
 * Toggle embeddings visibility
 */
function toggleEmbeddings() {
    const embeddingSections = document.querySelectorAll('.embedding-section');
    const isChecked = showEmbeddingsCheckbox.checked;
    
    embeddingSections.forEach(section => {
        if (isChecked) {
            section.classList.remove('embedding-hidden');
        } else {
            section.classList.add('embedding-hidden');
        }
    });
}

/**
 * Show loading indicator
 * @param {boolean} show - Whether to show loading
 */
function showLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('d-none');
        showDataContainer(false);
    } else {
        loadingIndicator.classList.add('d-none');
    }
}

/**
 * Show/hide data container
 * @param {boolean} show - Whether to show data container
 */
function showDataContainer(show) {
    if (show) {
        dataContainer.classList.remove('d-none');
        emptyState.classList.add('d-none');
    } else {
        dataContainer.classList.add('d-none');
        emptyState.classList.remove('d-none');
    }
}

/**
 * Clear data container
 */
function clearData() {
    dataContainer.innerHTML = '';
    dataCount.textContent = '';
    showDataContainer(false);
    clearError();
    hidePagination();
    
    // Reset pagination state
    currentPage = 1;
    totalPages = 1;
    totalDocuments = 0;
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
    errorMessage.innerHTML = `<strong>Error:</strong> ${message}`;
    errorMessage.classList.remove('d-none');
}

/**
 * Clear error message
 */
function clearError() {
    errorMessage.classList.add('d-none');
    errorMessage.textContent = '';
}

/**
 * Show connection message
 * @param {string} message - Message to display
 * @param {string} type - Message type (success, error, info)
 */
function showConnectionMessage(message, type = 'info') {
    connectionMessage.textContent = message;
    connectionMessage.className = `mt-2 text-${type}`;
    
    // Auto-clear after 5 seconds for success/info messages
    if (type !== 'error') {
        setTimeout(() => {
            if (connectionMessage.textContent === message) {
                connectionMessage.textContent = '';
                connectionMessage.className = 'mt-2';
            }
        }, 5000);
    }
}
