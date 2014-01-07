var db = null;
var blob = null;

function initDatabase() {
  var req = indexedDB.open("weof", 1);
  req.onsuccess = function(e) {
    db = e.target.result;
    console.log("db = " + JSON.stringify(db));
  };
  req.onerror = function(e) { console.log(e); };

  req.onupgradeneeded = function(e) {
    var db = e.target.result;
    e.target.transaction.onerror = function(e) { console.log(e); };

    console.log("creating stores");
    if(db.objectStoreNames.contains("inbox")) db.deleteObjectStore("inbox");
    if(db.objectStoreNames.contains("sent")) db.deleteObjectStore("sent");
    if(db.objectStoreNames.contains("other")) db.deleteObjectStore("other");
    if(db.objectStoreNames.contains("private")) db.deleteObjectStore("private");

    var store = null;
    store = db.createObjectStore("inbox", {keyPath: "mid"});
    store.createIndex("by_timestamp", "timestamp");

    store = db.createObjectStore("sent", {keyPath: "mid"});
    store.createIndex("by_timestamp", "timestamp");

    store = db.createObjectStore("other", {keyPath: "mid"});
    store.createIndex("by_timestamp", "timestamp");

    store = db.createObjectStore("private", {keyPath: "mid"});
    store.createIndex("by_timestamp", "timestamp");
  };
};

function absoluteUrl(url, server) {
  if (url && url[0] == '/') return 'http://' + server + url;
  else return url;
};

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function reconstruct(obj, server) {
  if (!obj || ! obj.t) return null;
  var e = "<" + obj.t + " ";
  if (obj.a) {
    for (var k in obj.a) {
      var n = obj.a[k];
      if (obj.t.toLowerCase() == 'a' && k.toLowerCase() == 'href')
        n = absoluteUrl(n, server);
        e += (" " + k + "=\"" + n + "\"");
    }
  }

  e += ">";

  if (obj.c){
    for (var i=0; i<obj.c.length; ++i) {
      var child = obj.c[i];
      if (typeof child == "object") {
        var ec = reconstruct(obj.c[i], server);
        if(ec) e += ec;
      } else {
        e += escapeHtml(child);
      }
    }
  }

  e += "</" + obj.t + ">";
  return e;
};

initDatabase();

// notify of page refreshes
/*
chrome.extension.onConnect.addListener(function(port) {
  port.onMessage.addListener(function (msg) {
    if (msg.action === 'register') {
      var respond = function (tabId, changeInfo, tab) { };

      chrome.tabs.onUpdated.addListener(respond);
      port.onDisconnect.addListener(function () {
        chrome.tabs.onUpdated.removeListener(respond);
      });
    }
  });
});
*/

chrome.browserAction.onClicked.addListener(function(tab) {
  if (tab.url && tab.url.indexOf('weibo.com') >= 0) {
    chrome.tabs.sendMessage(tab.id, { action:'toggle'});
    return;
  }
  chrome.tabs.create({'url': chrome.extension.getURL('ui.html')});
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if(message.action == "save") {
    var feed = JSON.parse(message.data);
    var store = db.transaction([feed.type], "readwrite").objectStore(feed.type);

    var req = store.put(feed);
    req.onsuccess = function(e) {};
    req.onerror = function(e) { console.log(e); };
    sendResponse({action: 'save', result: "ok" });
  }
  else if (message.action == "list") {
    console.log(message.data);

    var items = [];
    var xauthors = {};

    var name = message.name;
    var offset = message.offset || 0;
    var count = message.count || -1;
    var countOnly = message.countOnly || false;
    var authors = message.authors;
    var total = 0;

    var tx = db.transaction([name], "readonly");
    var req = tx.objectStore(name).index('by_timestamp').openCursor(null, 'prev');
    req.onerror = function(e) { console.log(e); };
    req.onsuccess = function(e) { 
      var cur = e.target.result;
      if (cur) {
        var author = cur.value.parts[0].x_author;
        if (countOnly) {
          if (name != 'inbox') {
            if (author.id in xauthors) xauthors[author.id].count ++;
            else xauthors[author.id] = {id: author.id, name: author.nickname, count: 1};
          }
        }
        else if (authors && !authors[author.id]) {
          cur.continue();
          return;
        }

        if(!countOnly && total >= offset) {
          if (count < 0 || total < offset +count)
            items.push(cur.value);
        }
        cur.continue();
        ++total;
      }
    };

    tx.oncomplete = function(e) {
      for (var i=0; i<items.length; ++i) {
        var m = items[i];
        for(var j=0; j<m.parts.length; ++j) {
            m.parts[j].x_author.a_link = absoluteUrl(m.parts[j].x_author.link, m.ext.server);
            m.parts[j].html = reconstruct(JSON.parse(m.parts[j].data), m.ext.server);
            m.parts[j].a_permlink = absoluteUrl(m.parts[j].x_permlink, m.ext.server);
        }
      }

      var msg = {action:'list-ack', result: {name: name, total: total, offset: offset, count: count, items: items, authors: xauthors}};
//      console.log('reply: ' + JSON.stringify(msg));
      chrome.tabs.sendMessage(sender.tab.id, msg);
    };
  }
  else if (message.action == "export") {
    var items = [];
    
    var name = message.name;
    var tx = db.transaction([name], "readonly");
    var req = tx.objectStore(name).openCursor();
    req.onerror = function(e) { console.log(e); };
    req.onsuccess = function(e) { 
      var i = e.target.result;
      if (i) {
        items.push(i.value);
        i.continue();
      }
    }
 
    tx.oncomplete = function(e) {
      console.log('items: ' + items.length);
      var blobs = [];
      for(var i=0; i<items.length; ++i) {
        blobs.push("\x10\x10\x10\x10\x10\x10\x10\x11\x11\x11\x11\x11\x11\x53\x0D\x0A");
        blobs.push(JSON.stringify(items[i]));
        blobs.push("\x0d\x0a");
      }

      if (items.length) {
        var blob = new Blob(blobs, {type : 'application/octet-stream'});
        console.log(blob.size);
        chrome.tabs.sendMessage(sender.tab.id, { action:'export-ack', result: {data:URL.createObjectURL(blob), name:message.name, filename: message.name + "-" + Date.now() + ".box"}});
      }
    };
  }
  else if (message.action == "summary") {
    var names = db.objectStoreNames;
    var result = {};
    for(var i=0; i<names.length; ++i) result[names[i]] = {name: names[i]};
    chrome.tabs.sendMessage(sender.tab.id, { action:'summary-ack', result: result});
  }
  else if (message.action == "ui") {
    chrome.tabs.create({'url': chrome.extension.getURL('ui.html')}, function(tab) {
    // Tab opened.
    });
  }
  else if (message.action == "reset") {
    console.log('delete database');
    (function() { 
      var req = indexedDB.deleteDatabase('weof');
      req.onerror = function(e) { console.log(e); };
    })();

    initDatabase();
  }
});

