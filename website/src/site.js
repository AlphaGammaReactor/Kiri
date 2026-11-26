// Asks the server whether a Mac build is published, then turns the download buttons on or shows "coming soon".
(function () {
  var body = document.body;
  fetch("/api/release", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var mac = data && data.mac;
      if (!mac) { body.setAttribute("data-release-state", "none"); return; }
      body.setAttribute("data-release-state", "ready");
      document.querySelectorAll("[data-mac-file]").forEach(function (el) {
        el.textContent = mac.file + (mac.size_mb ? " · " + mac.size_mb + " MB" : "");
      });
      document.querySelectorAll("[data-meta]").forEach(function (el) {
        var tpl = el.getAttribute("data-meta-ver");
        if (tpl && mac.version) el.textContent = tpl.replace("{v}", mac.version);
      });
      if (data.mac_intel) {
        document.querySelectorAll("[data-intel-link]").forEach(function (el) { el.hidden = false; });
      }
      if (/[?&]start=1/.test(location.search)) {
        setTimeout(function () { location.href = "/download/mac"; }, 400);
      }
    })
    .catch(function () { body.setAttribute("data-release-state", "none"); });
})();
