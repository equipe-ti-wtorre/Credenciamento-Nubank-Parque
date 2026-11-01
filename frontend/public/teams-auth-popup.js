(function () {
  try {
    var flag =
      sessionStorage.getItem('teams.auth.popup') === '1' ||
      localStorage.getItem('teams.auth.popup') === '1' ||
      /(?:^|;\s*)teams_auth_popup=1(?:;|$)/.test(document.cookie || '');
    if (!flag) return;
    var q = location.search || '';
    var h = location.hash || '';
    if (!/(?:^|[?#&])(code|id_token|error)=/i.test(q + h)) return;
    if (location.pathname.indexOf('/auth/teams') === 0) return;
    location.replace('/auth/teams.html' + q + h);
  } catch (e) {}
})();
