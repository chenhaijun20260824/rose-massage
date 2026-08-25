/*
 * sync-adapter.js — GitHub Gist 后端适配器（本地优先 + 多端同步）
 * 由 setup-token.html 把 GitHub PAT / Gist ID 写入 localStorage 后自动启用。
 * 未配置时本文件直接 return，页面退化为纯本地（零网络、不报错）。
 *
 * 存储模型：一个公开 Gist，内含单个文件 rose-sync.json = {
 *   accounts:[...], technicians:[...], notices:[...], audit_log:[...],
 *   __deleted:{ accounts:[id...], technicians:[id...], ... }   // 墓碑，跨端传播删除
 * }
 *
 * 读取：公开接口（gist.github.com，无需 token），所有设备打开即可读数据
 * 写入：需认证 PATCH（保护数据不被任意篡改），写入前先读最新版避免覆盖
 *
 * 适配器对外满足 rose-sync.js 的契约：
 *   pull(binKey, cb)      -> cb(array, ok, deletedIds)
 *   push(binKey, data, deletedIds, cb) -> cb(ok)
 */
(function () {
  var TOKEN_KEY = 'rose_gh_token';
  var GIST_KEY  = 'rose_gh_gist';
  var BASE_KEY  = 'rose_gh_api_base';
  var FILE = 'rose-sync.json';
  var BINS = ['accounts', 'technicians', 'notices', 'audit_log'];
  var DESCRIPTION = 'rose-massage 本地优先同步存储（公开版）';
  var DEFAULT_GIST_ID = '335732b242ed305912b3a3d5c6ce9dc1'; // 公开数据 Gist，所有设备共用

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var token = lsGet(TOKEN_KEY);
  var base = lsGet(BASE_KEY) || 'https://api.github.com';
  // 迁移：清掉旧账号遗留的不可写 Gist ID，强制改用新账号共享 Gist
  (function () {
    var cached = lsGet(GIST_KEY);
    if (cached && cached !== DEFAULT_GIST_ID) {
      try { localStorage.removeItem(GIST_KEY); } catch (e) {}
    }
  })();
  var gistId = lsGet(GIST_KEY) || DEFAULT_GIST_ID; // 首次无 localStorage 则用默认 Gist（公开可读）
  var hasToken = !!(token && token.trim());

  // 令牌优先级：localStorage（配置页/连接云端写入）> 页面内嵌 ROSE_GH_PAT（首页/后台复用）
  // validPat 校验 ghp_ / github_pat_ 前缀，占位符（“在此填入…”）自动忽略
  function validPat(t) {
    t = String(t || '').trim();
    if (t.indexOf('ghp_') === 0 || t.indexOf('github_pat_') === 0) return t;
    return '';
  }
  var DEFAULT_PAT = (typeof window !== 'undefined' && window.ROSE_GH_PAT) ? validPat(window.ROSE_GH_PAT) : '';
  token = validPat(token) || DEFAULT_PAT;
  hasToken = !!token;

  function headers() {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function fileObj(content) { var o = {}; o[FILE] = { content: content }; return o; }

  // 认证请求（读取+写入均需认证）
  function api(path, method, body) {
    return fetch(base + path, {
      method: method || 'GET',
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined
    });
  }

  // 读取 gist 全部 bins -> obj 或 null
  // 无 token 时：用公开 gist.github.com 接口（无需认证，任何设备可读）
  // 有 token 时：用认证 API（获取最新 raw_url）
  function readAll(cb) {
    if (!gistId) return cb(null);
    if (!hasToken) {
      // 公开接口：通过 gist.github.com 获取文件列表 → raw_url → 内容
      fetch('https://gist.github.com/' + gistId, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) return cb(null); return r.json(); })
        .then(function (d) {
          if (!d || !d.files || !d.files[FILE]) return cb(null);
          var rawUrl = d.files[FILE].raw_url;
          if (!rawUrl) return cb(null);
          return fetch(rawUrl);
        })
        .then(function (r) { if (!r || !r.ok) return cb(null); return r.text(); })
        .then(function (txt) {
          try { cb(JSON.parse(txt)); } catch (e) { cb(null); }
        })
        .catch(function () { cb(null); });
    } else {
      // 认证接口：获取最新 raw_url 再拉内容（确保拿到最新版本）
      api('/gists/' + gistId, 'GET').then(function (r) {
        if (!r.ok) return cb(null);
        return r.json().then(function (d) {
          var f = d.files && d.files[FILE];
          var rawUrl = f && f.raw_url;
          if (!rawUrl) return cb(null);
          return fetch(rawUrl);
        }).then(function (r) { if (!r || !r.ok) return cb(null); return r.text(); })
        .then(function (txt) { try { cb(JSON.parse(txt)); } catch (e) { cb(null); } })
        .catch(function () { cb(null); });
      }).catch(function () { cb(null); });
    }
  }

  // 写入 gist 全部 bins（需认证 PATCH）
  function writeAll(obj, cb) {
    if (!hasToken) { cb(false); return; } // 无 token 不能写
    
    // 【关键修复】写入前清理所有 base64 图片，防止 Gist 爆大到截断导致拉取失败
    try {
      ['accounts','technicians'].forEach(function(bin) {
        (obj[bin] = obj[bin] || []).forEach(function(item) {
          if (item.photo && typeof item.photo === 'string' && item.photo.length > 200) item.photo = '[cloud_photo]';
          if (item.photos && Array.isArray(item.photos)) {
            item.photos = item.photos.map(function(p) {
              if (typeof p === 'string' && p.length > 200) return '[cloud_photo]';
              return p;
            });
          }
        });
      });
    } catch(e) {}
var content = JSON.stringify(obj);
    // 【关键修复】数据超过 500KB 时拒绝写入（防止截断后拉取返回旧数据覆盖本地）
    if (TextEncoder().encode(content).length > 500000) { try { if (typeof console !== 'undefined') console.warn('rose-sync: 数据过大，跳过云端写入'); } catch(e) {} cb(false); return; }
    var doWrite = function (id) {
      api('/gists/' + id, 'PATCH', { files: fileObj(content) }).then(function (r) {
        cb(!!(r && r.ok));
      }).catch(function () { cb(false); });
    };
    if (gistId) return doWrite(gistId);
    // 首次：查找同令牌已有 gist 或新建公开 gist
    resolveGist(function (id) {
      if (!id) return cb(false);
      gistId = id;
      doWrite(gistId);
    });
  }

  // 用固定 description 在同一 GitHub 账号下查找/复用同一个 gist，实现多设备自动共享
  function findExistingGist(scanCb) {
    api('/user/gists?per_page=100', 'GET').then(function (r) {
      if (!r.ok) return scanCb(null);
      return r.json().then(function (list) {
        var found = null;
        (list || []).forEach(function (g) { if (g.description === DESCRIPTION) found = g.id; });
        scanCb(found);
      });
    }).catch(function () { scanCb(null); });
  }
  function resolveGist(cb) {
    if (gistId) return cb(gistId);
    findExistingGist(function (existing) {
      if (existing) { gistId = existing; lsSet(GIST_KEY, gistId); return cb(gistId); }
      api('/gists', 'POST', { description: DESCRIPTION, public: true, files: fileObj('{}') }).then(function (r) {
        if (!r.ok) return cb(null);
        return r.json().then(function (d) { gistId = d.id; lsSet(GIST_KEY, gistId); cb(gistId); });
      }).catch(function () { cb(null); });
    });
  }
  window.RoseSyncResolve = resolveGist;

  // 自动静默拉取：页面加载时立即拉取云端数据并【合并】写入本地存储
  // 合并而非覆盖：云端空/旧数据不会冲掉本地新数据（注册/审核结果）
  function autoPull() {
    if (!gistId) return;
    readAll(function (obj) {
      if (!obj) return;
      ['accounts', 'technicians', 'notices', 'audit_log'].forEach(function (bin) {
        var key = 'rose_' + bin;
        var arr = obj[bin];
        if (!Array.isArray(arr)) return;
        try {
          var localArr = [];
          var raw = localStorage.getItem(key);
          if (raw) { try { localArr = JSON.parse(raw); } catch (e) { localArr = []; } }
          var merged;
          if (window.JB && JB._mergeLists && Array.isArray(localArr)) {
            merged = JB._mergeLists(localArr, arr, bin); // 本地优先 + 云端补充 + 本地墓碑过滤
          } else {
            merged = arr;
          }
          localStorage.setItem(key, JSON.stringify(merged));
        } catch (e) {}
      });
      // 墓碑传播：云端删除同步到本地
      var del = obj.__deleted;
      if (del && window.JB && JB.markDeleted) {
        Object.keys(del).forEach(function (bin) {
          var ids = del[bin];
          if (!Array.isArray(ids)) return;
          ids.forEach(function (id) { try { JB.markDeleted(bin, id); } catch (e) {} });
        });
      }
      try { localStorage.setItem('rose_cloud_version', String(Date.now())); } catch (e) {}
    });
  }

  // 页面加载后立即拉取（早于 800ms 的 syncAll；主动触发一次）
  if (window.JB) { JB.autoPull = autoPull; JB.autoPull(); }
  window.addEventListener('load', function () { setTimeout(function () { if (window.JB && JB.autoPull) JB.autoPull(); }, 50); });

  // 写入串行化，避免并发 push 互相覆盖（每个 push 都是 读-改-写）
  var chain = Promise.resolve();

  window.RoseSyncAdapter = {
    endpoint: base + '/gists/' + gistId,
    pull: function (binKey, cb) {
      readAll(function (obj) {
        if (!obj) return cb([], false, []);
        var del = (obj.__deleted && Array.isArray(obj.__deleted[binKey])) ? obj.__deleted[binKey] : [];
        var arr = obj[binKey];
        cb(Array.isArray(arr) ? arr : [], true, del);
      });
    },
    push: function (binKey, data, deletedIds, cb) {
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          readAll(function (cur) {
            var obj = cur || {};
            BINS.forEach(function (b) { if (!(b in obj)) obj[b] = []; });
            obj[binKey] = data;
            obj.__deleted = obj.__deleted || {};
            obj.__deleted[binKey] = deletedIds || [];
            writeAll(obj, function (ok) { resolve(ok); });
          });
        });
      }).then(function (ok) { if (typeof cb === 'function') cb(ok); },
               function () { if (typeof cb === 'function') cb(false); });
    }
  };
})();
