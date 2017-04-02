// TODO: show user a message of settings being saved and close the dialog afterwards

window.browser = (function () {
    return window.msBrowser ||
        window.browser ||
        window.chrome;
})();

var elmResolverHost = document.getElementById('resolverHost');
var elmBtnSave = document.getElementById('btnSave');
var elmBtnReset = document.getElementById('btnReset');

elmResolverHost.setAttribute('placeholder', openDiscoveryValidator.prototype.defaultResolverHost);

browser.storage.local.get(['resolverHost'], function(items){
    elmResolverHost.value = items.resolverHost || '';
});

elmBtnSave.addEventListener('click', function(){
    save();
});

elmBtnReset.addEventListener('click', function(){
    elmResolverHost.value = '';
    save();
});

function save() {
    browser.storage.local.set({
        'resolverHost': elmResolverHost.value
    }, function(){
        //message('Settings saved');
    });
}
