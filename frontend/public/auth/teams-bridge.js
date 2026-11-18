/* Extraído de teams-bridge.html para permitir CSP sem script inline. */
(function () {
  function go(path) {
    var target = path || "/dashboard";
    if (target.charAt(0) !== "/") target = "/" + target;
    window.location.replace(target);
  }
  function fromContext(ctx) {
    var page = (ctx && ctx.page) || {};
    var raw = page.subPageId || page.subEntityId || (ctx && ctx.subEntityId) || "";
    if (!raw || typeof raw !== "string") return null;
    try { raw = decodeURIComponent(raw.trim()); } catch (e) {}
    if (/^https?:\/\//i.test(raw)) {
      try {
        var u = new URL(raw);
        return u.pathname + u.search;
      } catch (e) { return null; }
    }
    if (/^(aprovacoes|acessos-servico|admin)\b/i.test(raw)) raw = "/" + raw;
    if (raw.charAt(0) !== "/") return null;
    return raw;
  }
  async function main() {
    if (!window.microsoftTeams) {
      go("/dashboard");
      return;
    }
    try {
      await microsoftTeams.app.initialize();
      var ctx = await microsoftTeams.app.getContext();
      var path = fromContext(ctx);
      if (path) {
        try { sessionStorage.setItem("teams.pendingDeepLink", path); } catch (e) {}
        go(path);
        return;
      }
      // Poll curto — subPageId às vezes chega atrasado
      for (var i = 0; i < 10; i++) {
        await new Promise(function (r) { setTimeout(r, 300); });
        ctx = await microsoftTeams.app.getContext();
        path = fromContext(ctx);
        if (path) {
          try { sessionStorage.setItem("teams.pendingDeepLink", path); } catch (e) {}
          go(path);
          return;
        }
      }
    } catch (e) {}
    go("/dashboard");
  }
  main();
})();
