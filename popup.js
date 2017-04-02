
window.browser = (function () {
    return window.msBrowser ||
        window.browser ||
        window.chrome;
})();

var backgroundPage = chrome.extension.getBackgroundPage();
var odv = backgroundPage.odv;
var tabId;

browser.tabs.query({active: true, currentWindow: true},function(tabs){
    tabId = tabs[0].id;
    updateHtml();
});

function updateHtml()
{
    var status = status = odv.tabStatus[tabId];

    if(status < 1) {
        document.getElementById('error_text').innerHTML = "Got no data. Try refeshing the page.";
        document.getElementById('process').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        return;
    }

    if(status < 50) {
        window.setTimeout(updateHtml, 500);
        return;
    }

    if(status === odv.tabStatusNoBusinessId) {
        document.getElementById('error_text').innerHTML = "<p>The owner of this website is not authenticated.</p><p>Do not enter any sensitive personel information, unless you are absolutely sure that you are on a wellknown website and NOT on a imitating phishing site or any other unknown site.</p>";
        document.getElementById('process').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        return;
    }

    if(status < 99) {
        document.getElementById('error_text').innerHTML = "Error code: " + status;
        document.getElementById('process').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        return;
    }

    var response = odv.tabMeta[tabId].response;

    var id = response.official.id.toUpperCase();

    var countryIso2 = id.substring(0, 2);

    var extrainfoEl = document.getElementById('extrainfo');

    document.getElementById('official_name').innerText = response.official.name;
    document.getElementById('id').innerText = id;
    document.getElementById('countryflag').setAttribute('src', 'https://www.peercraft.com/img/flags/23x15/'+countryIso2+'.png');

    if(response.official.addressLines) {
        var el = document.createElement('p');
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
    }

    if(response.official.dkStatusTimeline) {
        var el = document.createElement('p');
        var div = document.createElement('div');
        div.innerHTML = "<b>Status Timeline:</b>";
        el.appendChild(div);
        response.official.dkStatusTimeline.forEach(function(item){
            var div = document.createElement('div');
            div.innerText = item.date+" "+item.translated;
            el.appendChild(div);
        });
        extrainfoEl.appendChild(el);
    }

    if(response.official.mainLineOfBusinessNaceV2) {
        var naceV2list = fetchFile('naceV2.json');

        var el = document.createElement('p');
        var div = document.createElement('div');
        div.innerHTML = "<b>Line of Business:</b>";
        el.appendChild(div);;
        var div = document.createElement('div');
        div.innerText = naceV2list[response.official.mainLineOfBusinessNaceV2]
            +" ("+response.official.mainLineOfBusinessNaceV2+")";
        el.appendChild(div);
        extrainfoEl.appendChild(el);
    }

    if(response.official.dkManagement) {
        var el = document.createElement('p');
        var div = document.createElement('div');
        div.innerHTML = "<b>Management:</b>";
        el.appendChild(div);
        response.official.dkManagement.forEach(function(item){
            var div = document.createElement('div');
            div.innerText = item.name;
            el.appendChild(div);
        });
        extrainfoEl.appendChild(el);
    }

    document.getElementById('process').style.display = 'none';
    document.getElementById('success').style.display = 'block';
}

function fetchFile(file) {
    try {
        var xhr = new XMLHttpRequest();

        xhr.open('GET', browser.runtime.getURL(file), false);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(null);

        if(xhr.status !== 200) {
            return false;
        }

        return JSON.parse(xhr.responseText);
    } catch (ex) {
        console.log(ex);
        return false;
    }
}
