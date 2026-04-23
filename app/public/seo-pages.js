(function () {
  var STORAGE_KEY = "consultin-public-attribution";
  var QUERY_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "msclkid",
    "ttclid",
  ];

  function clean(value, maxLength) {
    if (typeof value !== "string") return "";
    var trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.slice(0, maxLength);
  }

  function safeParse(raw) {
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function canUseSessionStorage() {
    try {
      return typeof window.sessionStorage !== "undefined";
    } catch {
      return false;
    }
  }

  function readStored() {
    if (!canUseSessionStorage()) return {};
    return safeParse(window.sessionStorage.getItem(STORAGE_KEY));
  }

  function writeStored(data) {
    if (!canUseSessionStorage()) return;

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors on static pages.
    }
  }

  function rememberCurrentPage() {
    var stored = readStored();
    var currentParams = new URLSearchParams(window.location.search);
    var next = Object.assign({}, stored);

    QUERY_KEYS.forEach(function (key) {
      var value = clean(currentParams.get(key), 255);
      if (value) next[key] = value;
    });

    if (!next.landingPath)
      next.landingPath = clean(window.location.pathname, 200);
    if (!next.landingSearch && window.location.search)
      next.landingSearch = clean(window.location.search, 512);
    if (!next.landingReferrer && document.referrer)
      next.landingReferrer = clean(document.referrer, 512);

    next.pagePath = clean(window.location.pathname, 200);
    next.pageSearch = clean(window.location.search, 512);

    writeStored(next);
    return next;
  }

  function decorateSignupLinks(state) {
    var currentParams = new URLSearchParams(window.location.search);
    var signupLinks = document.querySelectorAll('a[href^="/cadastro-clinica"]');

    signupLinks.forEach(function (link) {
      try {
        var url = new URL(link.getAttribute("href"), window.location.origin);
        var params = new URLSearchParams(url.search);

        QUERY_KEYS.forEach(function (key) {
          if (params.has(key)) return;

          var currentValue = clean(currentParams.get(key), 255);
          if (currentValue) {
            params.set(key, currentValue);
            return;
          }

          var storedValue = clean(state[key], 255);
          if (storedValue) params.set(key, storedValue);
        });

        var query = params.toString();
        link.setAttribute(
          "href",
          url.pathname + (query ? "?" + query : "") + url.hash,
        );
      } catch {
        // Ignore malformed links.
      }
    });
  }

  var state = rememberCurrentPage();
  decorateSignupLinks(state);
})();
