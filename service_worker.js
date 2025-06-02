const cacheVersion = 1;
const supportedProtocols = ['https:'];

function getBaseUrl(tabUrl) {
    const url = new URL(tabUrl);

    if(supportedProtocols.indexOf(url.protocol) < 0) {
        throw new Error("Unsupported protocol");
    }

    return `${url.protocol}//${url.host}`;
}

// Listen for web requests to capture the business ID from response headers
chrome.webRequest.onHeadersReceived.addListener((details) => {
    const tabId = details.tabId;
    let businessId;
    for (let i = 0; i < details.responseHeaders.length; ++i) {
        if (details.responseHeaders[i].name.toLowerCase() === 'x-opendiscovery-id') {
            businessId = details.responseHeaders[i].value;
            break;
        }
    }

    console.log("Business ID found in HEADER:", businessId, "for tabId:", tabId);
    chrome.storage.session.set({
        [`tabHeaderBusinessId_${tabId}`]: businessId,
    });
}, {
    "urls": ['https://*/*'],
    "types": ['main_frame']
}, ['responseHeaders']);

// Listen for tab updates to fetch business ID from the domains well-known URLs
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if(changeInfo.status == "loading" && tab.url) { // Ensure URL exists
        let currentUrlBase;

        try {
            currentUrlBase = getBaseUrl(tab.url)
        } catch (error) {
            console.error("Invalid tab URL:", error);
            return;
        }

        getCache(tabId, currentUrlBase)
            .then(fetchWellKnownUrl.bind(null, currentUrlBase))
            .then(storeWellKnownCache.bind(null, currentUrlBase))
            .then(updateExtensionIcon.bind(null, tabId))
            .then((result) => {
                if (result.businessId) {
                    console.log("Business ID found in WELL-KNOWN:", result.businessId, "for tabId:", tabId);
                } else {
                    console.warn("No business ID found in WELL-KNOWN for tabId:", tabId);
                }
            }
            );
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove([
        `tabHeaderBusinessId_${tabId}`,
    ]); // Clean up session storage
});

function getCache(tabId, currentUrlBase) {
    return new Promise((resolve, reject) => {
        const wellknownCacheKey = `wellknown_${currentUrlBase}`;
        const tabHeaderKey = `tabHeaderBusinessId_${tabId}`;
        return chrome.storage.session.get([wellknownCacheKey, tabHeaderKey]).then((results) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting well-known cache:", chrome.runtime.lastError.message);
                reject(new Error("Failed to retrieve well-known cache."));
            } else {
                console.log("Retrieved well-known cache for:", currentUrlBase, results);

                if (results[tabHeaderKey]) {
                    console.log("Using business ID from tab header cache for");
                    resolve({
                        businessId: results[tabHeaderKey],
                        cacheVersion, // Set a dummy to skip caching the tab header
                    });
                    return;
                }

                if (!results[wellknownCacheKey]) {
                    console.log("No valid cache found for:", currentUrlBase);
                    resolve(null); // No valid cache found, proceed to fetch
                    return;
                }

                const result = results[wellknownCacheKey];

                if (!result.cacheVersion || result.cacheVersion !== cacheVersion) {
                    console.log("Cache version mismatch for:", currentUrlBase, "Expected:", cacheVersion, "Got:", result.cacheVersion);
                    resolve(null); // Cache version mismatch, proceed to fetch
                    return;
                }

                if (result.ttl && result.ttl < Date.now()) {
                    console.log("Cache expired for:", currentUrlBase, result);
                    resolve(null); // Cache expired, proceed to fetch
                    return;
                }

                console.log("Using cached well-known data for:", currentUrlBase, result);
                resolve(result);
            }
        });
    });
}

function storeWellKnownCache(currentUrlBase, result) {
    if (result && result.cacheVersion) {
        // If the result already cached, we don't need to store it again
        return Promise.resolve(result);
    }

    return new Promise((resolve, reject) => {
        console.log("Storing well-known data for:", currentUrlBase, result);

        result.cacheVersion = cacheVersion; // Set cache version
        result.ttl = Date.now() + 24 * 60 * 60 * 1000; // Cache for 24 hours
        chrome.storage.session.set({
            [`wellknown_${currentUrlBase}`]: result
        }).then(() => {
            resolve(result);
        });
    });
}

function fetchWellKnownUrl(currentUrlBase, result) {
    if (result) {
        return Promise.resolve(result); // If we have a valid cached result, return it immediately
    }

    return new Promise((resolve, reject) => {
        chrome.storage.session.set({
            [`wellknown_${currentUrlBase}`]: {
                inProgress: true,
                cacheVersion: cacheVersion,
                ttl: Date.now() + 60 * 1000 // Cache for 1 minute
            }
        });

        fetch(`${currentUrlBase}/.well-known/opendiscovery/host.json`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        }).then((response) => {
            console.log("Fetched well-known URL:", currentUrlBase, response);

            if (!response.ok) {
                console.warn('Page returned error, no OpenDiscovery ID found at well-known URL:', currentUrlBase, response);
                if (response.status === 404) {
                    throw new Error("The owner of this website could not be identified or verified via OpenDiscovery. Exercise caution, especially if asked for sensitive information.");
                } else {
                    throw new Error("Failed to resolve business information. The lookup service might be unavailable.");
                }
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.warn('Unexpected content type for well-known URL:', contentType);
                throw new Error("Failed to resolve business information. The lookup service might be unavailable.");
            }

            response.json().then((data) => {
                if (!data || !data.id) {
                    console.warn('Missing ID field in well-known URL response:', data);
                    throw new Error("Failed to resolve business information. The lookup service might be unavailable.");
                }

                resolve({
                    businessId: data.id
                });
            });
        }).catch((error) => {
            console.warn("Error fetching well-known URL:", currentUrlBase, error);
            resolve({error: error.message});
        });
    });
}

function updateExtensionIcon(tabId, result) {
    return new Promise((resolve, reject) => {
        let color;
        if (result && result.businessId) {
            color = 'blue'; // Set to blue if business ID is found
        }

        if (!color) {
            resolve(result);
            return;
        }

        console.log(`Setting icon for tab ${tabId} to color: ${color}`);
        chrome.action.setIcon({
            'tabId': tabId,
            'path': {
                '19': 'icons/'+color+'19.png',
                '38': 'icons/'+color+'38.png'
            }
        }).catch(error => {
            console.warn(`Failed to set icon for tab ${tabId}: ${error.message}`);
        });

        resolve(result);
    });
}

// Listen for messages from popup or other extension parts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getBusinessId") {
        const tabId = request.tabId;
        const tabUrl = request.tabUrl;

        const currentUrlBase = getBaseUrl(tabUrl);

        getCache(tabId, currentUrlBase)
            .then(fetchWellKnownUrl.bind(null, currentUrlBase))
            .then(storeWellKnownCache.bind(null, currentUrlBase))
            .then(updateExtensionIcon.bind(null, tabId))
            .then((result) => {
                sendResponse(result);
            })
            .catch((error) => {
                console.error("Error retrieving business ID:", error);
                sendResponse({error: "Failed to retrieve business ID, please try reloading the extension."});
            });

        return true; // Indicate that the response is sent asynchronously
    }

    // Handle other actions if needed
    return false; // Indicate synchronous response for unhandled messages
});

console.log("Business Investigator Service Worker Started/Restarted");
