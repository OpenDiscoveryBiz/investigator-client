# Business Investigator Client
This is a browser extension that displays an icon in the address bar enabling a web site to prove the authenticity of its claimed owner. This is done by [resolving](https://github.com/OpenDiscoveryBiz/resolver) the BusinessID retrieved from a [HTTP header field](https://tools.ietf.org/html/rfc7230#section-3.2), a [.well-known address](https://tools.ietf.org/html/rfc5785), a [DNS record](https://tools.ietf.org/html/rfc6763), or an [SSL certificate](https://www.ietf.org/rfc/rfc5280.txt) and comparing the resulting list of URL's with the URL of the website (or webpage).

When clicking the icon a popup appears with selected relevant information about the website owner. This may include part of the public records of the business entity as well as selfasserted and third party attested claims.

The Browser Extension is one of several components needed to enable Distributed Business Service Discovery scenarios.

These components are currently under initial development and we welcome collaboration on the further development of scope and principles (Contact: [Henrik Biering](mailto:hb@peercraft.com)) as well as the technical implementation (Contact: [Casper Biering](mailto:cb@peercraft.com)).
