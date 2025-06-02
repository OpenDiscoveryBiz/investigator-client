const defaultResolverHost = "https://resolver.opendiscovery.biz"; // Hardcoded default

var tabId;
var tabUrl;
var tabUrlBase;
var tabUrlHost;
var businessId;
var resolverHost;
var naceV2list; // Cache for NACE codes
(async () => {
    naceV2list = await fetchNaceFile('naceV2_1.json');
})();

const countryCodeToFlag = (isoCode) => {
  return isoCode
        .toUpperCase()
        .replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
}

function getResolverHost() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['options'], function(items) {
            if (chrome.runtime.lastError) {
                console.error("Error getting resolver host:", chrome.runtime.lastError.message);
                reject("Could not retrieve resolver host.");
            } else {
                resolverHost = items.options && items.options.resolverHost || defaultResolverHost;
                resolve();
            }
        });
    });
}

function getTabId() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
                console.error("Error getting current tab:", chrome.runtime.lastError?.message || "No active tab found");
                reject("Could not get active tab information.");
            } else {
                tabId = tabs[0].id;
                tabUrl = tabs[0].url;

                url = new URL(tabUrl);
                tabUrlBase = `${url.protocol}//${url.host}`;
                tabUrlHost = url.host;

                resolve();
            }
        });
    });
}

function getBusinessId() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "getBusinessId", tabId: tabId, tabUrl: tabUrl }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error getting business ID:", chrome.runtime.lastError.message);
                reject("Error communicating with background script.");
            } else if (response) {
                console.info("Received from background script:", response);
                if (response.error) {
                    reject(response.error);
                } else if (response.inProgress) {
                    setTimeout(() => resolve(getBusinessId()), 750); // Retry after 750ms
                } else {
                    businessId = response.businessId;
                    resolve();
                }
            } else {
                console.warn("No response received from background script. Retrying...");
                setTimeout(() => resolve(getBusinessId()), 750); // Retry after 750ms
            }
        });
    });
}

function lookupResolver() {
    return new Promise((resolve, reject) => {
        const url = `${resolverHost}/lookup?version=1&id=${encodeURIComponent(businessId)}`;
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    console.error(`Resolver HTTP error! status: ${response.status} ${response.statusText}`);
                    throw new Error('Resolver is down, please try again later.');
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    reject(data.error);
                    return;
                }

                console.log("Resolver response:", data);
                resolve(data);
            })
            .catch(error => {
                reject(error);
            });
    });
}

function validateResponse(response) {
    return new Promise((resolve, reject) => {
        console.log("Validating response for business ID:", response);

        if (response.id && response.id !== businessId) {
            console.error(`Resolver returned different ID: ${response.id}. Expected: ${businessId}`);
            reject(`Verification failed. Resolver returned a different business ID: ${response.id}. Expected: ${businessId}`);
            return;
        }

        var found_match = false;

        if(response.official.voluntaryProviders &&
            Array.isArray(response.official.voluntaryProviders) && (
                response.official.voluntaryProviders.indexOf(tabUrlBase) > -1
            ) ) {
            found_match = true;
        }

        if(response.voluntary && response.voluntary.id) {
            if (response.voluntary.authzDomains &&
                Array.isArray(response.voluntary.authzDomains)) {
                if (response.voluntary.authzDomains.indexOf(tabUrlHost) > -1) {
                    found_match = true;
                } else if (!found_match) {
                    console.log("Verification failed: Missing authorization data for voluntary provider.");
                    reject("Verification failed. The website domain does not match the registered domains for the identified business.");
                    return;
                }
            } else if (!found_match) {
                console.log("Missing authorization data for voluntary provider.");
                reject("Verification failed. The website domain does not match the registered domains for the identified business.");
                return;
            }
        }

        if(!found_match) {
            console.log("No matching voluntary provider found for response business ID.");
            reject("Verification failed. The website domain does not match the registered domains for the identified business.");
            return;
        }

        resolve(response);
    });
}

Promise.all([
    getResolverHost(),
    getTabId().then(getBusinessId),
])
    .then(lookupResolver)
    .then(validateResponse)
    .then(response => {
        var id = response.official.id.toUpperCase();
        var countryIso2 = id.substring(0, 2);
        var extrainfoEl = document.getElementById('extrainfo');

        // Clear previous extra info
        extrainfoEl.innerHTML = '';

        document.getElementById('official_name').innerText = response.official.name;
        document.getElementById('id').innerText = `(${id})`; // Wrap ID in parentheses
        document.getElementById('countryflag').innerHTML = countryCodeToFlag(countryIso2);

        if(response.official.addressLines) {
            var el = document.createElement('p');
            // Sanitize address lines before setting innerText? For now, assume safe.
            el.innerText = response.official.addressLines.join(", ");
            extrainfoEl.appendChild(el);
        }

        if(response.official.dkEmployees) {
            var el = document.createElement('p');
            if(response.official.dkEmployees.from === response.official.dkEmployees.to) {
                el.innerHTML = "<b>Number of employees:</b> "
                    +response.official.dkEmployees.from
                    +" ("+response.official.dkEmployees.date+")";
            } else {
                el.innerHTML = "<b>Number of employees:</b> "
                    +response.official.dkEmployees.from
                    +" to "
                    +response.official.dkEmployees.to
                    +" ("+response.official.dkEmployees.date+")";
            }
            extrainfoEl.appendChild(el);
        } else {
            // Only show if data is missing, not explicitly "None registered" unless API confirms
            // var el = document.createElement('p');
            // el.innerHTML = "<b>Number of employees:</b> Not available";
            // extrainfoEl.appendChild(el);
        }

        if(response.official.dkStatusTimeline) {
            var el = document.createElement('p');
            var div = document.createElement('div');
            div.innerHTML = "<b>Status Timeline:</b>";
            el.appendChild(div);
            response.official.dkStatusTimeline.forEach(function(item){
                var itemDiv = document.createElement('div'); // Use different var name
                itemDiv.innerText = item.date+" "+item.translated;
                el.appendChild(itemDiv);
            });
            extrainfoEl.appendChild(el);
        }

        if(response.official.mainLineOfBusinessNaceV2) {
            if (naceV2list && naceV2list[response.official.mainLineOfBusinessNaceV2]) {
                var el = document.createElement('p');
                var titleDiv = document.createElement('div'); // Use different var name
                titleDiv.innerHTML = "<b>Line of Business:</b>";
                el.appendChild(titleDiv);
                var naceDiv = document.createElement('div'); // Use different var name
                naceDiv.innerText = naceV2list[response.official.mainLineOfBusinessNaceV2]
                    + " (" + response.official.mainLineOfBusinessNaceV2 + ")";
                el.appendChild(naceDiv);
                extrainfoEl.appendChild(el);
            } else {
                console.warn("NACE code not found in list:", response.official.mainLineOfBusinessNaceV2);
                // Optionally display the code without description
                var el = document.createElement('p');
                el.innerHTML = `<b>Line of Business Code:</b> ${response.official.mainLineOfBusinessNaceV2}`;
                extrainfoEl.appendChild(el);
            }
        }

        if(response.official.dkManagement) {
            var el = document.createElement('p');
            var titleDiv = document.createElement('div'); // Use different var name
            titleDiv.innerHTML = "<b>Management:</b>";
            el.appendChild(titleDiv);
            response.official.dkManagement.forEach(function(item){
                var mgmtDiv = document.createElement('div'); // Use different var name
                mgmtDiv.innerText = item.name; // Assuming 'name' is the property
                el.appendChild(mgmtDiv);
            });
            extrainfoEl.appendChild(el);
        }

        document.getElementById('process').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('success').style.display = 'block';
    })
    .catch(error => {
        console.error("Error during business ID lookup:", error);

        document.getElementById('error_text').innerHTML = error;
        document.getElementById('process').style.display = 'none';
        document.getElementById('success').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    });

// Fetch local JSON file (like naceV2.json)
async function fetchNaceFile(file) {
    // TODO: re-write this to use Promise
    try {
        const url = chrome.runtime.getURL(file);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${file}: ${response.statusText}`);
            return null; // Return null instead of false
        }
        return await response.json();
    } catch (ex) {
        console.error(`Exception fetching ${file}:`, ex);
        return null; // Return null on exception
    }
}
