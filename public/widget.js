/* Site-to-Agent embed: <script src="https://HOST/widget.js" data-agent="AGENT_ID" async></script> */
(function () {
  var s = document.currentScript;
  var id = s && s.getAttribute("data-agent");
  if (!id) return console.error("site-to-agent: missing data-agent");
  var origin = new URL(s.src).origin;
  var frame = document.createElement("iframe");
  frame.src = origin + "/a/" + encodeURIComponent(id) + "?embed=1";
  frame.title = "Chat assistant";
  frame.style.cssText = "position:fixed;right:20px;bottom:84px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 110px);border:1px solid #334155;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none;z-index:2147483646;background:#020617";
  var btn = document.createElement("button");
  btn.textContent = "Chat";
  btn.setAttribute("aria-label", "Open chat");
  btn.style.cssText = "position:fixed;right:20px;bottom:20px;height:48px;padding:0 20px;border:0;border-radius:24px;background:#6366f1;color:#fff;font:600 15px system-ui;cursor:pointer;z-index:2147483647";
  btn.onclick = function () {
    var open = frame.style.display === "none";
    frame.style.display = open ? "block" : "none";
    btn.textContent = open ? "Close" : "Chat";
  };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
