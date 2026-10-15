/* Runs in <head> before first paint so there is no flash of the wrong language. */
(function () {
  var root = document.documentElement;
  var lang = 'en';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    var saved = localStorage.getItem('lang');
    if (q === 'km' || q === 'en') lang = q;
    else if (saved === 'km' || saved === 'en') lang = saved;
    else if ((navigator.language || '').toLowerCase().indexOf('km') === 0) lang = 'km';
  } catch (e) {}
  root.setAttribute('data-lang', lang);
  root.lang = lang;
})();
