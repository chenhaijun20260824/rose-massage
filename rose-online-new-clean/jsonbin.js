/*
 * rose-sync.js — 本地优先同步核心库（取代 jsonbin.js）
 * 架构：本地优先（localStorage 永远可用），可选接入轻量后端做多端同步。
 * 默认不接任何云端：零额度、零网络依赖、不会弹"密钥失败"红条。
 * 多端同步：给 window.RoseSyncAdapter 赋值适配器即可（见 sync-adapter.js 示例）。
 */
var JB = {
  BINS: { accounts: 'accounts', technicians: 'technicians', notices: 'notices', audit_log: 'audit_log' },
  _adapterNow: function () {
    try { return (typeof window !== 'undefined' && window.RoseSyncAdapter) ? window.RoseSyncAdapter : null; }
    catch (e) { return null; }
  },
  _storageKey: function (binKey) { return 'rose_' + binKey; },
  _unwrap: function (v) {
    var depth = 0;
    while (depth < 5 && v && typeof v === 'object' && 'record' in v && Object.keys(v).length <= 2) { v = v.record; depth++; }
    return v;
  },
  _getLocal: function (binKey) {
    try {
      var v = localStorage.getItem(this._storageKey(binKey));
      if (!v) return [];
      return this._unwrap(JSON.parse(v));
    } catch (e) { return []; }
  },
  _setLocal: function (binKey, data) {
    try {
      localStorage.setItem(this._storageKey(binKey), JSON.stringify(data));
      return true;
    } catch (e) {
      if (typeof toast === 'function') toast('本地存储已满，请清理浏览器缓存');
      return false;
    }
  },
  _mergeLists: function (localArr, cloudArr, binKey) {
    var self = this;
    var delSet = {};
    if (binKey) self.getDeleted(binKey).forEach(function (id) { delSet[id] = true; });
    var map = {}, noKey = [];
    function ts(it) { return (it && (it.updateTime || it.time || it.registerTime)) || 0; }
    function keyOf(it) { return it && (it.id || it.account || it.accountId); }
    function isDel(it) { var k = keyOf(it); return k && delSet[k]; }
    function add(it) {
      if (!it || typeof it !== "object") return;
      if (isDel(it)) return;
      var k = keyOf(it);
      if (!k) { noKey.push(it); return; }
      if (!map[k]) map[k] = [it, ts(it)];
      else if (ts(it) > map[k][1]) map[k] = [it, ts(it)];
    }
    (Array.isArray(cloudArr) ? cloudArr : []).forEach(add);
    (Array.isArray(localArr) ? localArr : []).forEach(add);
    var out = [];
    Object.keys(map).forEach(function (k) { out.push(map[k][0]); });
    return out.concat(noKey);
  },
  get: function (binKey, cb) {
    var self = this;
    var local = this._getLocal(binKey);
    var adapter = this._adapterNow();
    if (adapter && typeof adapter.pull === "function") {
      adapter.pull(binKey, function (cloudArr, ok, deletedIds) {
        if (ok && deletedIds && deletedIds.length) {
          deletedIds.forEach(function (id) { self.markDeleted(binKey, id); });
        }
        if (ok && Array.isArray(cloudArr)) {
          var merged = self._mergeLists(local, cloudArr, binKey);
          self._setLocal(binKey, merged);
          cb(merged, true, cloudArr);
        } else {
          cb(local, false, local);
        }
      });
    } else {
      setTimeout(function () { cb(local, true, local); }, 0);
    }
  },
  put: function (binKey, data, cb) {
    var self = this;
    this._setLocal(binKey, data);
    var adapter = this._adapterNow();
    if (adapter && typeof adapter.push === "function") {
      adapter.push(binKey, data, self.getDeleted(binKey), function (ok) { if (typeof cb === "function") cb(ok); });
    } else {
      if (typeof cb === "function") setTimeout(function () { cb(true); }, 0);
    }
  },
  syncAll: function (cb) {
    var adapter = this._adapterNow();
    if (!adapter) { if (typeof cb === "function") cb(true); return; }
    var self = this, keys = ["accounts", "technicians", "notices", "audit_log"], pending = keys.length;
    function done() { pending--; if (pending <= 0 && typeof cb === "function") cb(true); }
    keys.forEach(function (k) {
      var snapshot = self._getLocal(k);
      self.get(k, function (mergedArr, ok, rawArr) {
        if (!ok) { done(); return; }
        if (!Array.isArray(rawArr)) rawArr = [];
        var merged = self._mergeLists(snapshot, rawArr, k);
        var same = JSON.stringify(merged) === JSON.stringify(rawArr);
        if (same) done();
        else self.put(k, merged, function () { done(); });
      });
    });
  },
  getCurrentUser: function () {
    try { var raw = localStorage.getItem("rose_current_user"); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  },
  genId: function () {
    var ts = Date.now().toString(36);
    var r1 = Math.random().toString(36).slice(2);
    var r2 = "";
    try { r2 = crypto.getRandomValues(new Uint32Array(1))[0].toString(36); }
    catch (e) { r2 = Math.random().toString(36).slice(2); }
    return ts + r1 + r2;
  },
  _deletedKey: function (binKey) { return 'rose_deleted_' + binKey; },
  getDeleted: function (binKey) {
    try { return JSON.parse(localStorage.getItem(this._deletedKey(binKey)) || "[]"); } catch (e) { return []; }
  },
  markDeleted: function (binKey, id) {
    if (!id) return;
    var d = this.getDeleted(binKey);
    if (d.indexOf(id) < 0) d.push(id);
    try { localStorage.setItem(this._deletedKey(binKey), JSON.stringify(d)); } catch (e) {}
  },
  unmarkDeleted: function (binKey, id) {
    var d = this.getDeleted(binKey).filter(function (x) { return x !== id; });
    try { localStorage.setItem(this._deletedKey(binKey), JSON.stringify(d)); } catch (e) {}
  }
};

// 页面加载后如有适配器则静默同步；纯本地模式下直接 no-op（不联网、不弹窗）
setTimeout(function () { try { JB.syncAll(); } catch (e) {} }, 800);

// 全局错误捕获（保留，便于排查）
window.onerror = function (m, s, l, c) {
  try {
    var d = document.createElement("div");
    d.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#c00;color:#fff;font-size:12px;padding:8px;z-index:99999;white-space:pre-wrap;";
    d.textContent = "页面报错: " + m + " (" + l + ":" + c + ")";
    (document.body || document.documentElement).appendChild(d);
  } catch (e) {}
  return false;
};

/*
 * 可选多端同步：在引入本文件之后、页面逻辑之前设置 window.RoseSyncAdapter 即可，
 * 例如 sync-adapter.js。本地永远优先，后端不可用也不影响本机数据。
 */