(function () {
  "use strict";

  var REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var PATHS = {
    index: "/updates/public/index.json",
    internalIndex: "/updates/internal/index.json",
    announcements: "/updates/announcements.json",
    android: "/updates/public/mutuara/android.json"
  };

  var THEME_KEY = "mutuara-theme";

  var INTERNAL_KEY_HASH = "927ea4e963322a1fd0b69818369db7459e06c3165abaa7528a3db4c3a60319eb";

  var state = {
    manifest: null,
    versionName: "—",
    versionCode: "—"
  };

  /* ------------------------------------------------------------------ */
  /* 基础工具                                                            */
  /* ------------------------------------------------------------------ */

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(text, len) {
    var s = String(text);
    while (s.length < len) s += " ";
    return s;
  }

  function loadJSON(url, timeout) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var opts = { cache: "no-store" };
    if (ctrl) opts.signal = ctrl.signal;

    var timer = window.setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeout || 5000);

    return fetch(url, opts).then(
      function (res) {
        window.clearTimeout(timer);
        if (!res.ok) throw new Error(url + " → " + res.status);
        return res.json();
      },
      function (err) {
        window.clearTimeout(timer);
        throw err;
      }
    );
  }

  function formatBytes(bytes) {
    var n = Number(bytes);
    if (!n || n <= 0) return "—";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n = n / 1024;
      i += 1;
    }
    return n.toFixed(n >= 100 || i === 0 ? 0 : 1) + " " + units[i];
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(d.getUTCDate()).padStart(2, "0");
    return d.getUTCFullYear() + "-" + mm + "-" + dd;
  }

  var TAG_LABEL = { feature: "新增", fix: "修复", improve: "优化", other: "其他" };

  function changelogHTML(list) {
    if (!list || !list.length) return "";
    var items = list.map(function (item) {
      var type = item && TAG_LABEL[item.type] ? item.type : "other";
      return (
        '<li><span class="tag ' + type + '">' + TAG_LABEL[type] + "</span>" +
        "<span>" + esc(item && item.text ? item.text : "") + "</span></li>"
      );
    });
    return '<ul class="changelog">' + items.join("") + "</ul>";
  }

  /* ------------------------------------------------------------------ */
  /* 主题                                                                */
  /* ------------------------------------------------------------------ */

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}

    var label = qs("#theme-label");
    if (label) label.textContent = theme;

    var meta = qs("#theme-color");
    if (meta) meta.setAttribute("content", theme === "light" ? "#f2f6f4" : "#04060a");

    var btn = qs("#theme-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      btn.setAttribute("aria-label", theme === "light" ? "切换到暗色主题" : "切换到亮色主题");
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "light" ? "dark" : "light");
  }

  function initTheme() {
    applyTheme(currentTheme());
    var btn = qs("#theme-toggle");
    if (btn) btn.addEventListener("click", toggleTheme);
  }

  /* ------------------------------------------------------------------ */
  /* 字符艺术（固定 ASCII 大字，纯文本渲染，无图片依赖）                      */
  /* ------------------------------------------------------------------ */

  var ART_BANNER = [
    '888b     d888 888     888 88888888888 888     888       d8888 8888888b.         d8888',
    '8888b   d8888 888     888     888     888     888      d88888 888   Y88b       d88888',
    '88888b.d88888 888     888     888     888     888     d88P888 888    888      d88P888',
    '888Y88888P888 888     888     888     888     888    d88P 888 888   d88P     d88P 888',
    '888 Y888P 888 888     888     888     888     888   d88P  888 8888888P"     d88P  888',
    '888  Y8P  888 888     888     888     888     888  d88P   888 888 T88b     d88P   888',
    '888   "   888 Y88b. .d88P     888     Y88b. .d88P d8888888888 888  T88b   d8888888888',
    '888       888  "Y88888P"      888      "Y88888P" d88P     888 888   T88b d88P     888'
  ]
    .map(function (line) {
      return line.replace(/ +$/, "");
    })
    .join("\n");

  var ART_FONT_FAMILY =
    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

  var artState = { cols: 0, rows: 0, text: "", adv: 0 };

  function artMeasure(text) {
    var lines = text.split("\n");
    var cols = 0;
    var i;

    for (i = 0; i < lines.length; i++) {
      if (lines[i].length > cols) cols = lines[i].length;
    }

    return { cols: cols, rows: lines.length };
  }

  function artAdvance() {
    if (artState.adv) return artState.adv;

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return 0.6;

    ctx.font = "100px " + ART_FONT_FAMILY;
    var width = ctx.measureText("0000000000").width / 10;
    var adv = width / 100;
    if (!adv || !isFinite(adv)) adv = 0.6;

    artState.adv = adv;
    return adv;
  }

  function fitArt(el) {
    if (!artState.cols) return;

    var host = el.closest ? el.closest(".brand") : null;
    var avail = host ? host.clientWidth : 0;
    if (!avail) return;

    var size = avail / (artState.cols * artAdvance());
    if (!isFinite(size) || size <= 0) return;

    el.style.fontSize = size.toFixed(2) + "px";
    el.style.lineHeight = "1";

    var rendered = el.getBoundingClientRect().width;
    if (rendered > 1) {
      size *= avail / rendered;
      el.style.fontSize = size.toFixed(2) + "px";
    }
  }

  function renderArt() {
    var el = qs("#brand-art");
    if (!el) return;

    if (!artState.text) {
      var metrics = artMeasure(ART_BANNER);
      artState.text = ART_BANNER;
      artState.cols = metrics.cols;
      artState.rows = metrics.rows;

      el.textContent = artState.text;
      el.classList.remove("is-pending");
    }

    fitArt(el);
  }

  function initArt() {
    var el = qs("#brand-art");
    if (!el) return;

    renderArt();
    fontsReady();

    var raf = 0;
    window.addEventListener("resize", function () {
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        renderArt();
      });
    });
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var loading = document.fonts.load("16px " + ART_FONT_FAMILY);
    return Promise.race([loading, sleep(1600)]).then(
      function () {
        artState.adv = 0;
        renderArt();
      },
      function () {}
    );
  }

  /* ------------------------------------------------------------------ */
  /* 打字机                                                              */
  /* ------------------------------------------------------------------ */

  function typeInto(el, text, speed, skipState) {
    return new Promise(function (resolve) {
      if (!el) {
        resolve();
        return;
      }

      if (!text) {
        el.textContent = "";
        resolve();
        return;
      }

      var i = 0;
      el.textContent = "";

      (function step() {
        if (skipState && skipState.value) {
          el.textContent = text;
          resolve();
          return;
        }

        i += 1;
        el.textContent = text.slice(0, i);

        if (i >= text.length) {
          resolve();
          return;
        }

        window.setTimeout(step, speed);
      })();
    });
  }

  function revealSeq() {
    var items = qsa(".reveal");
    var i = 0;

    (function next() {
      if (i >= items.length) return;
      items[i].classList.add("show");
      i += 1;
      window.setTimeout(next, REDUCE ? 20 : 120);
    })();
  }

  /* ------------------------------------------------------------------ */
  /* 版本                                                                */
  /* ------------------------------------------------------------------ */

  function paintVersion() {
    var verEl = qs("#brand-ver");
    if (verEl) verEl.textContent = "v" + state.versionName;

    var tbEl = qs("#tb-version");
    if (tbEl) tbEl.textContent = "v" + state.versionName + " · build " + state.versionCode;
  }

  function loadVersion() {
    return loadJSON(PATHS.android).then(
      function (manifest) {
        state.manifest = manifest;
        if (manifest.version_name) state.versionName = String(manifest.version_name);
        if (manifest.version_code) state.versionCode = String(manifest.version_code);
        paintVersion();
        return manifest;
      },
      function () {
        paintVersion();
        return null;
      }
    );
  }

  /* ------------------------------------------------------------------ */
  /* 启动序列                                                            */
  /* ------------------------------------------------------------------ */

  function bootSequence(versionPromise) {
    var cmdEl = qs("#boot-cmd");
    if (!cmdEl) {
      revealSeq();
      return Promise.resolve();
    }

    var l1 = qs("#boot-l1");
    var l2 = qs("#boot-l2");

    var skip = { value: false };
    var speed = REDUCE ? 9 : 46;

    function onSkip(e) {
      if (e && e.type === "keydown" && e.key !== "Escape") return;
      skip.value = true;
    }

    document.addEventListener("keydown", onSkip);
    var lineEl = cmdEl.parentNode;
    if (lineEl) lineEl.addEventListener("click", onSkip);

    return typeInto(cmdEl, "system -version", speed, skip)
      .then(function () {
        return sleep(REDUCE ? 40 : 380);
      })
      .then(function () {
        return versionPromise;
      })
      .then(function () {
        if (l1) l1.classList.add("ok");
        return typeInto(
          l1,
          "Mutuara OS " + state.versionName + " build " + state.versionCode,
          REDUCE ? 7 : 17,
          skip
        );
      })
      .then(function () {
        return typeInto(l2, "platform: web   channel: public   status: online", REDUCE ? 6 : 14, skip);
      })
      .then(function () {
        revealSeq();
        return sleep(REDUCE ? 40 : 220);
      });
  }

  /* ------------------------------------------------------------------ */
  /* 控制台                                                              */
  /* ------------------------------------------------------------------ */

  var CMDS = {};

  function pushLog(log, text, cls) {
    var el = document.createElement("div");
    el.className = "log-line" + (cls ? " " + cls : "");
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function go(url) {
    window.location.href = url;
  }

  function cmdHelp(log) {
    var names = Object.keys(CMDS).filter(function (name) {
      return !CMDS[name].hidden;
    });
    pushLog(log, "可用命令:", "dim");
    names.forEach(function (name) {
      pushLog(log, "  " + pad(name, 14) + CMDS[name].desc);
    });
    pushLog(log, "  " + pad("↑ / ↓", 14) + "浏览历史命令", "dim");
    pushLog(log, "  " + pad("Tab", 14) + "补全命令", "dim");
  }

  function cmdVersion(log) {
    pushLog(log, "mutuara os " + state.versionName + " (build " + state.versionCode + ")", "ok");
    pushLog(log, "channel   public");
    pushLog(log, "manifest  " + PATHS.android, "dim");
    pushLog(log, "updated   " + formatDate(state.manifest && state.manifest.published_at), "dim");
  }

  function cmdSystem(log) {
    pushLog(log, "Mutuara OS " + state.versionName + " build " + state.versionCode, "ok");
    pushLog(log, "platform: web   channel: public   status: online");
  }

  function cmdAbout(log) {
    pushLog(log, "Mutuara — 终端原生更新与分发通道。");
    pushLog(log, "站点只提供版本信息与安装包入口，更新策略由客户端实现。", "dim");
  }

  function cmdTheme(log) {
    toggleTheme();
    pushLog(log, "theme → " + currentTheme(), "ok");
  }

  function cmdLs(log) {
    pushLog(log, "/releases/", "dim");
    pushLog(log, "/updates/public/");
    pushLog(log, "  index.json");
    pushLog(log, "  mutuara/android.json");
    pushLog(log, "  mutuara/ios.json");
    pushLog(log, "/updates/internal/");
    pushLog(log, "  index.json");
    pushLog(log, "  Navi-IME-android/update.json");
    pushLog(log, "/updates/announcements.json");
  }

  function cmdDate(log) {
    pushLog(log, new Date().toString());
  }

  function cmdWhoami(log) {
    pushLog(log, "guest (read-only)");
  }

  function cmdClear(log) {
    log.textContent = "";
  }

  function registerCommands() {
    CMDS.help = { desc: "列出可用命令", run: cmdHelp };
    CMDS.version = { desc: "显示当前版本信息", run: cmdVersion };
    CMDS.system = { desc: "system -version 显示系统信息", run: cmdSystem };
    CMDS.download = { desc: "打开软件下载库", run: function () { go("/download.html"); } };
    CMDS.news = { desc: "查看更新公告", run: function () { go("/announcements.html"); } };
    CMDS.home = { desc: "回到主页", run: function () { go("/index.html"); } };
    CMDS.about = { desc: "关于 Mutuara", run: cmdAbout };
    CMDS.theme = { desc: "切换亮色 / 暗色主题", run: cmdTheme };
    CMDS.ls = { desc: "列出更新清单目录", run: cmdLs };
    CMDS.date = { desc: "显示当前时间", run: cmdDate };
    CMDS.whoami = { desc: "显示当前用户", run: cmdWhoami };
    CMDS.clear = { desc: "清空控制台输出", run: cmdClear };

    CMDS.dl = { hidden: true, desc: "download 的别名", run: CMDS.download.run };
    CMDS.announcements = { hidden: true, desc: "news 的别名", run: CMDS.news.run };
    CMDS.beta = { hidden: true, desc: "内测通道", run: function () { go("/beta.html"); } };
  }

  function initConsoleCaret() {
    var input = qs("#console-field");
    var caret = qs("#console-caret");
    if (!input || !caret) return;

    function sync() {
      var active = document.activeElement === input;
      caret.hidden = active || input.value.length > 0;
    }

    input.addEventListener("input", sync);
    input.addEventListener("focus", sync);
    input.addEventListener("blur", sync);
    sync();
  }

  function initConsole() {
    var form = qs("#console-form");
    var input = qs("#console-field");
    var log = qs("#console-log");
    if (!form || !input || !log) return;

    var history = [];
    var cursor = -1;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var raw = input.value.trim();
      input.value = "";

      var caret = qs("#console-caret");
      if (caret) caret.hidden = false;

      if (!raw) return;

      history.push(raw);
      cursor = history.length;

      pushLog(log, "guest@mutuara:~$ " + raw);

      var parts = raw.split(/\s+/);
      var name = parts[0];
      var cmd = CMDS[name];

      if (!cmd) {
        pushLog(log, "command not found: " + name, "err");
        pushLog(log, "输入 help 查看可用命令", "dim");
        return;
      }

      if (name === "system" && parts[1] !== "-version") {
        pushLog(log, "usage: system -version", "warn");
        return;
      }

      if (name === "clear") {
        log.textContent = "";
        return;
      }

      cmd.run(log, parts.slice(1));
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        if (!history.length) return;
        e.preventDefault();
        cursor = Math.max(0, cursor - 1);
        input.value = history[cursor] || "";
      } else if (e.key === "ArrowDown") {
        if (!history.length) return;
        e.preventDefault();
        cursor = Math.min(history.length, cursor + 1);
        input.value = history[cursor] || "";
      } else if (e.key === "Tab") {
        e.preventDefault();
        var value = input.value.trim();
        if (!value) return;
        var names = Object.keys(CMDS).filter(function (k) {
          return !CMDS[k].hidden;
        });
        var matches = names.filter(function (n) {
          return n.indexOf(value) === 0;
        });
        if (matches.length === 1) {
          input.value = matches[0] + " ";
        } else if (matches.length > 1) {
          pushLog(log, matches.join("  "), "dim");
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 树形软件库（下载页）                                                 */
  /* ------------------------------------------------------------------ */

  function treeLine(treeEl, branchText, nameText, kind) {
    var row = document.createElement("div");
    row.className = "tree-line";

    var branch = document.createElement("span");
    branch.className = "tree-branch";
    branch.textContent = branchText;

    var node;
    if (kind === "entry") {
      node = document.createElement("button");
      node.type = "button";
    } else {
      node = document.createElement("span");
    }
    node.className = "tree-node";

    var name = document.createElement("span");
    name.className = "tree-name" + (kind === "dir" ? " is-dir" : "");

    var meta = document.createElement("span");
    meta.className = "tree-meta";

    var channel = document.createElement("span");
    channel.className = "tree-meta-ch";

    var version = document.createElement("span");
    version.className = "tree-meta-v";

    meta.appendChild(channel);
    meta.appendChild(version);
    node.appendChild(name);
    node.appendChild(meta);
    row.appendChild(branch);
    row.appendChild(node);
    treeEl.appendChild(row);

    return {
      row: row,
      branch: branch,
      node: node,
      name: name,
      channel: channel,
      version: version
    };
  }

  function entryMeta(entry) {
    var data = entry._data;
    var channel = entry.channel === "internal" ? "internal" : "public";
    var value;

    if (!data) {
      value = "manifest missing";
    } else if (entry.platform === "ios") {
      value = data.version_name ? "v" + data.version_name : "—";
    } else {
      value = data.version_name ? "v" + data.version_name : "—";
    }

    return { channel: channel, value: value };
  }

  function detailHTML(app, entry) {
    var data = entry._data;
    var platform = entry.platform;
    var channel = entry.channel === "internal" ? "internal" : "public";

    var head =
      '<div class="pane-head">' +
      '<span class="prompt">guest@mutuara:~$</span>' +
      '<span class="cmd">cat ' + esc(entry.manifest) + "</span>" +
      '<span class="pane-status">' + esc(app.name) + " · " + esc(platform) + " · " + esc(channel) + "</span>" +
      "</div>";

    if (!data) {
      return head + '<p class="pane-note">该清单暂时不可用，请稍后再试或检查路径是否正确。</p>';
    }

    var versionName = data.version_name ? String(data.version_name) : "—";
    var versionCode = data.version_code ? String(data.version_code) : "—";

    var grid =
      '<div class="meta-grid">' +
      '<div class="meta-cell"><span class="meta-key">app</span><span class="meta-val">' + esc(app.name) + "</span></div>" +
      '<div class="meta-cell"><span class="meta-key">platform</span><span class="meta-val">' + esc(platform) + "</span></div>" +
      '<div class="meta-cell"><span class="meta-key">channel</span><span class="meta-val">' + esc(channel) + "</span></div>" +
      '<div class="meta-cell"><span class="meta-key">version</span><span class="meta-val">v' + esc(versionName) + " · " + esc(versionCode) + "</span></div>" +
      '<div class="meta-cell"><span class="meta-key">published</span><span class="meta-val">' + esc(formatDate(data.published_at)) + "</span></div>" +
      "</div>";

    var log = changelogHTML(data.changelog);
    var body = head + grid;

    if (log) {
      body += '<p class="tag-label">CHANGELOG</p>' + log;
    }

    if (platform === "ios") {
      var store = data.app_store_url || "";
      var tf = data.testflight_url || "";
      var buttons = '<div class="btn-row">';
      if (store) {
        buttons += '<a class="btn" href="' + esc(store) + '" target="_blank" rel="noopener">APP STORE</a>';
      }
      if (tf) {
        buttons += '<a class="btn ghost" href="' + esc(tf) + '" target="_blank" rel="noopener">TESTFLIGHT</a>';
      }
      buttons += "</div>";
      body += buttons;
    } else {
      var packages = data.packages || [];
      if (packages.length) {
        var list = '<div class="pkg-list">';
        packages.forEach(function (pkg) {
          var arch = pkg.arch || "universal";
          var variant = pkg.variant || "default";
          var size = formatBytes(pkg.size);
          var url = pkg.download_url || "";
          var checksum = pkg.checksum || "";

          list +=
            '<a class="pkg" href="' + esc(url || "#") + '" target="_blank" rel="noopener">' +
            '<span class="arch">' + esc(arch) + "</span>" +
            '<span class="sep">/</span>' +
            "<span>" + esc(variant) + "</span>" +
            '<span class="sep">·</span>' +
            "<span>" + esc(size) + "</span>" +
            '<span class="sum">' + esc(checksum ? checksum.slice(0, 19) : "no checksum") + "</span>" +
            "</a>";
        });
        list += "</div>";

        var primary = packages[0].download_url || "";
        body += list;
        body +=
          '<div class="btn-row"><a class="btn" href="' + esc(primary || "#") + '" target="_blank" rel="noopener">' +
          "DOWNLOAD APK</a></div>";
      } else {
        body += '<p class="pane-note">该版本暂未提供安装包。</p>';
      }
    }

    return body;
  }

  function renderDetail(detailEl, app, entry) {
    detailEl.innerHTML = detailHTML(app, entry);
    detailEl.hidden = false;
  }

  function printTree(treeEl, apps, detailEl) {
    var chain = Promise.resolve();
    var speed = REDUCE ? 5 : 14;

    var root = treeLine(treeEl, "", "", "root");
    chain = chain.then(function () {
      return typeInto(root.name, "~/releases", REDUCE ? 4 : 22);
    });

    apps.forEach(function (app, appIndex) {
      var lastApp = appIndex === apps.length - 1;
      var appBranch = lastApp ? "└─ " : "├─ ";

      var appRow = treeLine(treeEl, appBranch, "", "dir");
      chain = chain.then(function () {
        return typeInto(appRow.name, app.name + "/", REDUCE ? 4 : 16);
      });
      chain = chain.then(function () {
        return typeInto(appRow.channel, app.tagline || "", speed);
      });

      var entries = (app.entries || []).filter(function (entry) {
        return !entry.hidden;
      });

      entries.forEach(function (entry, entryIndex) {
        var lastEntry = entryIndex === entries.length - 1;
        var prefix = (lastApp ? "   " : "│  ") + (lastEntry ? "└─ " : "├─ ");

        var meta = entryMeta(entry);
        var row = treeLine(treeEl, prefix, "", "entry");

        row.node.setAttribute("aria-label", app.name + " " + entry.platform + " " + meta.channel);

        chain = chain.then(function () {
          return typeInto(row.name, entry.platform, REDUCE ? 4 : 16);
        });
        chain = chain.then(function () {
          row.channel.className = "tree-meta-ch ch-" + (meta.channel === "internal" ? "locked" : "public");
          return typeInto(row.channel, meta.channel, speed);
        });
        chain = chain.then(function () {
          return typeInto(row.version, meta.value, speed);
        });
        chain = chain.then(function () {
          row.node.addEventListener("click", function () {
            qsa(".tree-node", treeEl).forEach(function (el) {
              el.classList.remove("is-open");
            });
            row.node.classList.add("is-open");
            renderDetail(detailEl, app, entry);
            detailEl.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "nearest" });
          });
        });
      });
    });

    return chain;
  }

  function initTree() {
    var treeEl = qs("#tree");
    if (!treeEl) return;

    var detailEl = qs("#dl-detail");
    var statusEl = qs("#lib-status");

    loadJSON(PATHS.index)
      .then(function (index) {
        var apps = ((index && index.apps) || []).filter(function (app) {
          return !app.hidden;
        });

        var tasks = [];
        apps.forEach(function (app) {
          (app.entries || []).forEach(function (entry) {
            if (entry.hidden) return;
            tasks.push(
              loadJSON(entry.manifest)
                .then(function (data) {
                  entry._data = data;
                })
                .catch(function () {
                  entry._data = null;
                })
            );
          });
        });

        return Promise.all(tasks).then(function () {
          return apps;
        });
      })
      .then(function (apps) {
        if (statusEl) statusEl.textContent = apps.length + " app · ok";
        return printTree(treeEl, apps, detailEl);
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = "error";
        pushLog(treeEl, "error: 无法读取软件库索引 (" + err.message + ")", "err");
        pushLog(treeEl, "请确认 /updates/index.json 存在且格式正确。", "dim");
      });
  }

  /* ------------------------------------------------------------------ */
  /* 公告                                                                */
  /* ------------------------------------------------------------------ */

  function initAnnouncements() {
    var listEl = qs("#ann-list");
    if (!listEl) return;

    var statusEl = qs("#ann-status");

    loadJSON(PATHS.announcements)
      .then(function (data) {
        var items = (data && data.items) || [];
        items.sort(function (a, b) {
          return new Date(b.date || 0) - new Date(a.date || 0);
        });

        if (!items.length) {
          listEl.innerHTML = '<p class="pane-note">暂无公告。</p>';
        } else {
          listEl.innerHTML = items
            .map(function (item) {
              var channel = item.channel === "internal" ? "internal" : "public";
              var platforms = (item.platforms || []).join(" / ");
              var paragraphs = (item.body || [])
                .map(function (p) {
                  return "<p>" + esc(p) + "</p>";
                })
                .join("");

              return (
                '<article class="ann">' +
                '<div class="ann-head">' +
                '<h2 class="ann-title">' + esc(item.title) + "</h2>" +
                '<span class="ann-date">' + esc(formatDate(item.date)) + "</span>" +
                '<span class="ann-meta"><span class="badge ' + channel + '">' + channel + "</span>" +
                (platforms ? '<span class="badge">' + esc(platforms) + "</span>" : "") +
                "</span>" +
                "</div>" +
                (item.summary ? '<p class="pane-note">' + esc(item.summary) + "</p>" : "") +
                paragraphs +
                "</article>"
              );
            })
            .join("");
        }

        if (statusEl) statusEl.textContent = items.length + " item · ok";
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = "error";
        listEl.innerHTML = '<p class="pane-note">无法读取公告：' + esc(err.message) + "</p>";
      });
  }

  /* ------------------------------------------------------------------ */
  /* 内测口令                                                            */
  /* ------------------------------------------------------------------ */

  function sha256Hex(text) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || !window.TextEncoder) return Promise.reject(new Error("需要 HTTPS 环境"));

    var bytes = new window.TextEncoder().encode(text);
    return subtle.digest("SHA-256", bytes).then(function (buffer) {
      var view = new Uint8Array(buffer);
      var hex = "";
      for (var i = 0; i < view.length; i++) {
        hex += (view[i] < 16 ? "0" : "") + view[i].toString(16);
      }
      return hex;
    });
  }

  function renderInternalLibrary(detailEl) {
    detailEl.innerHTML = '<p class="pane-note">正在读取内测索引…</p>';

    loadJSON(PATHS.internalIndex)
      .then(function (index) {
        var apps = ((index && index.apps) || []).filter(function (app) {
          return !app.hidden;
        });

        var tasks = [];
        apps.forEach(function (app) {
          (app.entries || []).forEach(function (entry) {
            if (entry.hidden) return;
            tasks.push(
              loadJSON(entry.manifest)
                .then(function (data) {
                  entry._data = data;
                })
                .catch(function () {
                  entry._data = null;
                })
            );
          });
        });

        return Promise.all(tasks).then(function () {
          return apps;
        });
      })
      .then(function (apps) {
        if (!apps.length) {
          detailEl.innerHTML = '<p class="pane-note">内测索引为空。</p>';
          return;
        }

        detailEl.innerHTML = apps
          .map(function (app) {
            var entries = (app.entries || []).filter(function (entry) {
              return !entry.hidden;
            });
            var blocks = entries
              .map(function (entry) {
                return detailHTML(app, entry);
              })
              .join("");

            return '<p class="tag-label">' + esc(app.name) + "</p>" + blocks;
          })
          .join("");
      })
      .catch(function (err) {
        detailEl.innerHTML =
          '<p class="pane-note">无法读取内测索引：' + esc(err.message) + "</p>";
      });
  }

  function initBeta() {
    var form = qs("#gate-form");
    if (!form) return;

    var input = qs("#gate-input");
    var msg = qs("#gate-msg");
    var gate = qs("#gate");
    var panel = qs("#beta-panel");
    var detail = qs("#beta-detail");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var key = (input.value || "").trim();
      if (!key) {
        msg.textContent = "请输入口令";
        return;
      }

      msg.textContent = "校验中…";

      sha256Hex(key)
        .then(function (hex) {
          if (hex !== INTERNAL_KEY_HASH) {
            msg.textContent = "口令不正确";
            return;
          }

          msg.textContent = "";
          if (gate) gate.hidden = true;
          if (panel) panel.hidden = false;
          if (detail) renderInternalLibrary(detail);
        })
        .catch(function (err) {
          msg.textContent = "校验失败：" + err.message;
        });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    registerCommands();
    initTheme();
    initConsoleCaret();
    initArt();

    var versionPromise = loadVersion();
    var isHome = !!qs("#boot-cmd");

    var booted = isHome ? bootSequence(versionPromise) : Promise.resolve().then(revealSeq);

    booted
      .then(initConsole)
      .catch(function () {
        revealSeq();
        initConsole();
      });

    initTree();
    initAnnouncements();
    initBeta();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();