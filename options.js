const defaultResolverHost = "https://resolver.opendiscovery.biz"; // Hardcoded default

// TODO: show user a message of settings being saved and close the dialog afterwards
// No need for browser polyfill, use chrome.* directly

var elmResolverHost = document.getElementById('resolverHost');
var elmBtnSave = document.getElementById('btnSave');
var elmBtnReset = document.getElementById('btnReset');
var statusMessageEl = document.getElementById('statusMessage'); // Added for feedback

elmResolverHost.setAttribute('placeholder', defaultResolverHost);

chrome.storage.sync.get(['options'], function(items){
    if (chrome.runtime.lastError) {
        console.error("Error getting resolverHost:", chrome.runtime.lastError.message);
        displayStatus("Error loading settings.", "error");
    } else {
        elmResolverHost.value = items.options.resolverHost || '';
    }
});

elmBtnSave.addEventListener('click', function(){
    save();
});

elmBtnReset.addEventListener('click', function(){
    elmResolverHost.value = ''; // Clear the input field
    save(); // Save the empty value (background will use default)
});

function save() {
    var hostValue = elmResolverHost.value.trim(); // Trim whitespace

    // Basic validation: Check if it looks like a URL (optional but recommended)
    let isValid = true;
    if (hostValue && !hostValue.match(/^https:\/\/.+/)) {
        isValid = false;
        displayStatus("Invalid URL format. Please include https://", "error");
    }

    if (isValid) {
        chrome.storage.sync.set({
            // Save the trimmed value, or defaultResolverHost if empty?
            // Let's save empty string, background handles default logic.
            'options': {
                'resolverHost': hostValue
            }
        }, function(){
            if (chrome.runtime.lastError) {
                console.error("Error saving resolverHost:", chrome.runtime.lastError.message);
                displayStatus("Error saving settings.", "error");
            } else {
                console.log('Settings saved');
                displayStatus("Settings saved successfully!", "success");
            }
        });
    }
}

// Function to display status messages
let statusTimeout;
function displayStatus(message, type = "info") {
     if (statusTimeout) clearTimeout(statusTimeout); // Clear previous timeout

     statusMessageEl.textContent = message;
     statusMessageEl.className = type; // Use class for styling (e.g., .success, .error)
     statusMessageEl.style.display = 'block';

     // Hide the message after a few seconds
     statusTimeout = setTimeout(() => {
         statusMessageEl.style.display = 'none';
         statusMessageEl.textContent = '';
         statusMessageEl.className = '';
     }, 3000); // Hide after 3 seconds
}
