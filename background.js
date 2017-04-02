window.browser = (function () {
    return window.msBrowser ||
        window.browser ||
        window.chrome;
})();

var odv = new openDiscoveryValidator();

browser.storage.onChanged.addListener(function(items){
    if(items.resolverHost) {
        odv.setResolverHost(items.resolverHost.newValue || odv.defaultResolverHost);
    }
});

browser.storage.local.get(['resolverHost'], function(items){
    odv.setResolverHost(items.resolverHost || odv.defaultResolverHost);
});
