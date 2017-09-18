// TODO: better icons
// TODO: spinning icons when doing lookup?
// TODO: add comments

function openDiscoveryValidator() {

    this.tabDomain = {};
    this.tabStatus = {};
    this.tabMeta = {};
    this.tabSearchingDone = {};
    this.tabCompleteDone = {};
    this.tabWellknownDone = {};
    this.tabHeaderBusinessId = {};
    this.tabWellknownBusinessId = {};

    this.resolverCache = new LRUMap(150);
    this.wellknownCache = new LRUMap(150);
    this.resolverCallbacks = {};
    this.wellknownCallbacks = {};

    this.resolverHost = this.defaultResolverHost;
    this.ttlDefault = 600;
    this.ttlMax = 3600;
    this.ttlMin = 600;

    //browser.browserAction.onClicked.addListener(this.buttonClicked.bind(this));

    browser.webRequest.onCompleted.addListener(this.webRequestCompleted.bind(this), {
        "urls": ['http://*/*','https://*/*'],
        "types": ['main_frame']
    }, ['responseHeaders']);

    browser.tabs.onUpdated.addListener(this.tabsUpdated.bind(this));
    browser.tabs.onRemoved.addListener(this.tabsRemoved.bind(this));
}

openDiscoveryValidator.prototype.defaultResolverHost = "https://resolver.opendiscovery.biz";
openDiscoveryValidator.prototype.tabStatusUnknown = 0;
openDiscoveryValidator.prototype.tabStatusSearching = 1;
openDiscoveryValidator.prototype.tabStatusResolving = 2;
openDiscoveryValidator.prototype.tabStatusResolvingFailed = 50;
openDiscoveryValidator.prototype.tabStatusMissingVoluntary = 51;
openDiscoveryValidator.prototype.tabStatusMissingAuthzData = 52;
openDiscoveryValidator.prototype.tabStatusVerificationFailed = 53;
openDiscoveryValidator.prototype.tabStatusResolverReturnedIncorrectId = 54;
openDiscoveryValidator.prototype.tabStatusNoBusinessId = 98;
openDiscoveryValidator.prototype.tabStatusBusinessSuccess = 99;

openDiscoveryValidator.prototype.setResolverHost = function(resolverHost) {
    this.resolverHost = resolverHost;
};

openDiscoveryValidator.prototype.tabsUpdated = function(tabId, changeInfo, tab) {
    if(changeInfo.status == "loading") {
        var urlParse = tab.url.toLowerCase().match(/^(([\w-]+):\/+(\[?([\w\.-]+)\]?)(?::)*(?::\d+)?)/),
            urlAuth = urlParse[1],
            urlSchema = urlParse[2],
            urlDomain = urlParse[3];

        this.tabSearchingDone[tabId] = false;
        this.tabWellknownDone[tabId] = false;
        this.tabCompleteDone[tabId] = false;
        this.tabDomain[tabId] = urlDomain;

        this.tabStatus[tabId] = this.tabStatusSearching;

        if(['http','https'].indexOf(urlSchema) > -1) {
            this.lookupWellknown(urlAuth, function (domain, meta) {
                this.tabWellknownDone[tabId] = true;
                this.tabWellknownBusinessId[tabId] = meta.response ? meta.response.id : null;
                this.searchPartDone(tabId);
            });
        }
    }

    if(changeInfo.status == "complete") {
        this.tabCompleteDone[tabId] = true;
        this.searchPartDone(tabId);
    }
};

openDiscoveryValidator.prototype.tabsRemoved = function(tabId, changeInfo, tab) {
    delete this.tabSearchingDone[tabId];
    delete this.tabWellknownDone[tabId];
    delete this.tabCompleteDone[tabId];
    delete this.tabHeaderBusinessId[tabId];
    delete this.tabWellknownBusinessId[tabId];
    delete this.tabDomain[tabId];
    delete this.tabStatus[tabId];
    delete this.tabMeta[tabId];
};

openDiscoveryValidator.prototype.searchPartDone = function(tabId) {
    if(this.tabSearchingDone[tabId]) {
        return;
    }
    if(this.tabHeaderBusinessId[tabId]) {
        this.tabSearchingDone[tabId] = true;
        this.resolveBusinessId(tabId, this.tabHeaderBusinessId[tabId]);
    } else if(this.tabWellknownDone[tabId] && this.tabWellknownBusinessId[tabId]) {
        this.tabSearchingDone[tabId] = true;
        this.resolveBusinessId(tabId, this.tabWellknownBusinessId[tabId]);
    } else if(this.tabCompleteDone[tabId] && this.tabWellknownDone[tabId]) {
        this.tabStatus[tabId] = this.tabStatusNoBusinessId;
    }
};

openDiscoveryValidator.prototype.resolveBusinessId = function(tabId, businessId) {
    this.tabStatus[tabId] = this.tabStatusResolving;
    this.lookupResolver(businessId, this.resolverComplete.bind(this, tabId));
};

openDiscoveryValidator.prototype.resolverComplete = function(tabId, businessId, meta) {
    this.tabMeta[tabId] = meta;

    if(!meta && !meta.response) {
        this.tabStatus[tabId] = this.tabStatusResolvingFailed;
        this.setIcon(tabId, 'grey');
        return;
    }

    if(meta.response.id.toLowerCase() != businessId.toLowerCase()) {
        this.tabStatus[tabId] = this.tabStatusResolverReturnedIncorrectId;
        this.setIcon(tabId, 'grey');
        return;
    }

    var found_match = false;

    if(meta.response.official.voluntaryProviders &&
        Array.isArray(meta.response.official.voluntaryProviders) && (
            meta.response.official.voluntaryProviders.indexOf('http://'+this.tabDomain[tabId]) > -1 ||
            meta.response.official.voluntaryProviders.indexOf('https://'+this.tabDomain[tabId]) > -1
        ) ) {
        found_match = true;
    }

    if(meta.response.voluntary && meta.response.voluntary.id) {
        if (meta.response.voluntary.authzDomains &&
            Array.isArray(meta.response.voluntary.authzDomains)) {
            if (meta.response.voluntary.authzDomains.indexOf(this.tabDomain[tabId]) > -1) {
                found_match = true;
            } else if (!found_match) {
                this.tabStatus[tabId] = this.tabStatusVerificationFailed;
                this.setIcon(tabId, 'grey');
                return;
            }
        } else if (!found_match) {
            this.tabStatus[tabId] = this.tabStatusMissingAuthzData;
            this.setIcon(tabId, 'grey');
            return;
        }
    }

    if(found_match) {
        this.tabStatus[tabId] = this.tabStatusBusinessSuccess;
        this.setIcon(tabId, 'blue');
    } else {
        this.tabStatus[tabId] = this.tabStatusMissingVoluntary;
        this.setIcon(tabId, 'grey');
    }
};


openDiscoveryValidator.prototype.setIcon = function(tabId, color) {
    browser.browserAction.setIcon({
        'tabId': tabId,
        'path': {
            '19': 'icons/'+color+'19.png',
            '38': 'icons/'+color+'38.png'
        }
    });
};

openDiscoveryValidator.prototype.webRequestCompleted = function(details) {
    var tabId = details.tabId;

    var businessId;
    for (var i = 0; i < details.responseHeaders.length; ++i) {
        if (details.responseHeaders[i].name.toLowerCase() === 'x-opendiscovery-id') {
            businessId = details.responseHeaders[i].value;
            break;
        }
    }

    this.tabHeaderBusinessId[tabId] = businessId;
};

openDiscoveryValidator.prototype.lookupResolver = function(businessId, callback) {
    var cached = this.resolverCache.get(businessId);
    if(cached && cached.expire > (new Date())) {
        this.runAsync(callback, businessId, cached);
        return;
    }

    var any_active = this.resolverCallbacks[businessId] && this.resolverCallbacks[businessId].length > 0;

    if(any_active) {
        this.resolverCallbacks[businessId].push(callback);
    } else {
        this.resolverCallbacks[businessId] = [callback];
        this.fetchJson(this.resolverHost + "/lookup?version=1&id=" + encodeURIComponent(businessId),
            this.lookupResolverComplete.bind(this, businessId));
    }
};

openDiscoveryValidator.prototype.lookupResolverComplete = function(businessId, meta) {
    // Cache the response
    var ttlMeta = this.ttlDefault;
    if(meta.response && meta.response.ttl) {
        var ttlResponse = parseInt(meta.response.ttl, 10);
        if(ttlResponse > 0) {
            ttlMeta = Math.max(Math.min(ttlResponse, this.ttlMax), this.ttlMin);
        }
    }
    meta.expire = new Date((new Date()).getTime() + ttlMeta*1000);
    this.resolverCache.set(businessId, meta);

    // Get callbacks and clear
    var callbacks = this.resolverCallbacks[businessId];
    delete this.resolverCallbacks[businessId];

    // Run all registered callback async
    callbacks.forEach(function(callback){
        this.runAsync(callback, businessId, meta);
    }, this);
};

openDiscoveryValidator.prototype.lookupWellknown = function(domain, callback) {
    var cached = this.wellknownCache.get(domain);
    if(cached && cached.expire > (new Date())) {
        this.runAsync(callback, domain, cached);
        return;
    }

    var any_active = this.wellknownCallbacks[domain] && this.wellknownCallbacks[domain].length > 0;

    if(any_active) {
        this.wellknownCallbacks[domain].push(callback);
    } else {
        this.wellknownCallbacks[domain] = [callback];
        this.fetchJson(domain + "/.well-known/opendiscovery/host.json",
            this.lookupWellknownComplete.bind(this, domain));
    }
};

openDiscoveryValidator.prototype.lookupWellknownComplete = function(domain, meta) {
    // Cache the response
    var ttlMeta = this.ttlDefault;
    if(meta.response && meta.response.ttl) {
        var ttlResponse = parseInt(meta.response.ttl, 10);
        if(ttlResponse > 0) {
            ttlMeta = Math.max(Math.min(ttlResponse, this.ttlMax), this.ttlMin);
        }
    }
    meta.expire = new Date((new Date()).getTime() + ttlMeta*1000);
    this.wellknownCache.set(domain, meta);

    // Get callbacks and clear
    var callbacks = this.wellknownCallbacks[domain];
    delete this.wellknownCallbacks[domain];

    // Run all registered callback async
    callbacks.forEach(function(callback){
        this.runAsync(callback, domain, meta);
    }, this);
};

openDiscoveryValidator.prototype.fetchJson = function(url, callback) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.onload = this.fetchJsonOnload.bind(this, xhr, callback);
        xhr.onerror = this.async(callback, {'error': 'error'});
        xhr.onabort = this.async(callback, {'error': 'abort'});
        xhr.ontimeout = this.async(callback, {'error': 'timeout'});

        xhr.open('GET', url);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(null);
    } catch (ex) {
        this.runAsync(callback, {'error': 'exception'});
    }
};

openDiscoveryValidator.prototype.fetchJsonOnload = function(xhr, callback) {
    if (xhr.status != 200 &&
        xhr.status != 404) {
        this.runAsync(callback, {'error': 'error'});
        return;
    }

    try {
        var response = JSON.parse(xhr.response);
        this.runAsync(callback, {'response': response});
    } catch (ex) {
        this.runAsync(callback, {'error': 'exception'});
    }
};

openDiscoveryValidator.prototype.async = function() {
    var self = this,
        args = Array.from(arguments),
        callback = args.shift();

    return function() {
        var callbackargs = Array.from(arguments);
        setTimeout(function() {
            callback.apply(self, args.concat(callbackargs));
        },0);
    };
};

openDiscoveryValidator.prototype.runAsync = function() {
    var self = this,
        args = Array.from(arguments),
        callback = args.shift();

    setTimeout(function() {
        callback.apply(self, args);
    },0);
};
