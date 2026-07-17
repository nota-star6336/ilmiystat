(function (global) {
  'use strict';

  var SESSION_KEY = 'token';
  var LOCAL_KEY = 'ilmiystat_auth_token';
  var WINDOW_NAME_KEY = '__ilmiystat_token__';
  var COOKIE_KEY = 'ilmiystat_auth_token';

  function safeGet(storage, key) {
    try {
      return storage && typeof storage.getItem === 'function' ? (storage.getItem(key) || '') : '';
    } catch (_e) {
      return '';
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (storage && typeof storage.setItem === 'function') {
        storage.setItem(key, value);
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function safeRemove(storage, key) {
    try {
      if (storage && typeof storage.removeItem === 'function') {
        storage.removeItem(key);
      }
    } catch (_e) {}
  }

  function normalizeToken(token) {
    return typeof token === 'string' ? token.trim() : '';
  }

  function readCookieToken() {
    try {
      var raw = typeof document !== 'undefined' && typeof document.cookie === 'string' ? document.cookie : '';
      if (!raw) return '';
      var re = new RegExp('(?:^|;\\s*)' + COOKIE_KEY + '=([^;]*)');
      var m = raw.match(re);
      if (!m || !m[1]) return '';
      return normalizeToken(decodeURIComponent(m[1]));
    } catch (_e) {
      return '';
    }
  }

  function writeCookieToken(token) {
    try {
      if (typeof document === 'undefined') return false;
      if (!token) {
        document.cookie = COOKIE_KEY + '=; Max-Age=0; Path=/; SameSite=Lax';
        return true;
      }
      document.cookie = COOKIE_KEY + '=' + encodeURIComponent(token) + '; Path=/; SameSite=Lax';
      return true;
    } catch (_e) {
      return false;
    }
  }

  function readWindowNameToken() {
    try {
      var raw = typeof global.name === 'string' ? global.name : '';
      if (!raw) return '';
      var re = new RegExp('(?:^|;)' + WINDOW_NAME_KEY + '=([^;]*)');
      var m = raw.match(re);
      if (!m || !m[1]) return '';
      return normalizeToken(decodeURIComponent(m[1]));
    } catch (_e) {
      return '';
    }
  }

  function writeWindowNameToken(token) {
    try {
      var raw = typeof global.name === 'string' ? global.name : '';
      var cleaned = raw
        .replace(new RegExp('(?:^|;)' + WINDOW_NAME_KEY + '=[^;]*', 'g'), '')
        .replace(/^;+|;+$/g, '');
      if (!token) {
        global.name = cleaned;
        return true;
      }
      var encoded = encodeURIComponent(token);
      global.name = cleaned ? (cleaned + ';' + WINDOW_NAME_KEY + '=' + encoded) : (WINDOW_NAME_KEY + '=' + encoded);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function setAuthToken(token) {
    var normalized = normalizeToken(token);
    if (!normalized) {
      clearAuthToken();
      return false;
    }
    var sessionSaved = safeSet(global.sessionStorage, SESSION_KEY, normalized);
    var localSaved = safeSet(global.localStorage, LOCAL_KEY, normalized);
    var windowSaved = writeWindowNameToken(normalized);
    var cookieSaved = writeCookieToken(normalized);
    return !!(sessionSaved || localSaved || windowSaved || cookieSaved);
  }

  function getAuthToken() {
    var sessionToken = normalizeToken(safeGet(global.sessionStorage, SESSION_KEY));
    var localToken = normalizeToken(safeGet(global.localStorage, LOCAL_KEY));

    if (sessionToken) {
      if (localToken !== sessionToken) {
        safeSet(global.localStorage, LOCAL_KEY, sessionToken);
      }
      return sessionToken;
    }

    if (localToken) {
      safeSet(global.sessionStorage, SESSION_KEY, localToken);
      return localToken;
    }

    var windowToken = readWindowNameToken();
    if (windowToken) {
      safeSet(global.sessionStorage, SESSION_KEY, windowToken);
      safeSet(global.localStorage, LOCAL_KEY, windowToken);
      writeCookieToken(windowToken);
      return windowToken;
    }

    var cookieToken = readCookieToken();
    if (cookieToken) {
      safeSet(global.sessionStorage, SESSION_KEY, cookieToken);
      safeSet(global.localStorage, LOCAL_KEY, cookieToken);
      writeWindowNameToken(cookieToken);
      return cookieToken;
    }

    return '';
  }

  function clearAuthToken() {
    safeRemove(global.sessionStorage, SESSION_KEY);
    safeRemove(global.localStorage, LOCAL_KEY);
    writeWindowNameToken('');
    writeCookieToken('');
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (event) {
      if (!event || event.key !== LOCAL_KEY) return;
      var token = normalizeToken(event.newValue || '');
      if (token) {
        safeSet(global.sessionStorage, SESSION_KEY, token);
      } else {
        safeRemove(global.sessionStorage, SESSION_KEY);
      }
    });
  }

  global.getAuthToken = getAuthToken;
  global.setAuthToken = setAuthToken;
  global.clearAuthToken = clearAuthToken;

  // Sync an existing session immediately so new tabs can reuse it.
  getAuthToken();
})(window);
