//TODO: remove routeProvider?
angular.module('myApp', ['ngRoute'])
.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
      when('/', {templateUrl: chrome.extension.getURL('template/panel.html'),   controller: AppController}).
      otherwise({redirectTo: '/'});
}])
.config( [ '$compileProvider', function( $compileProvider ) {   
        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension|blob):/);
    }
])
.config(function($sceDelegateProvider) {
  $sceDelegateProvider.resourceUrlWhitelist([
    // Allow same origin resource loads.
    'self',
    // Allow loading from our assets domain.  Notice the difference between * and **.
    'chrome-extension://*/**']);
});

var Flux = {};
var $f = jQuery.noConflict(true);

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  console.log(JSON.stringify(msg));
  if ($f('#flux-panel').length == 0) {
      $f('body').append("<div id='flux-panel' ng-csp ng-app='myApp'><div ng-view></div></div>");
      angular.bootstrap($f('#flux-panel'), ["myApp"]);
  }
  else {
    if (msg.action == 'toggle')
      $f('#flux-panel').toggle();
  }
});

function AppController($scope, $timeout, $route){
  $scope.feedController = new Flux.FeedController();
  $scope.hasNextPage = false;
  $scope.hasPrevPage = false;
  $scope.hasMoreFeeds = false;
  $scope.currentPage = 1;
  $scope.status = "ready";

  $scope.feeds = [];

  $scope.closePanel = function() { 
    $f('#flux-panel').toggle(); 
  };

  $scope.nextPage = function() {
    if (! $scope.feedController.hasNextPage())
      return;
		$scope.feedController.nextPage();
    $timeout(function() { $scope.updateStatus(); }, 3000);
	};

  $scope.prevPage = function() {
    if (! $scope.feedController.hasPreviousPage())
      return;
		$scope.feedController.previousPage();
    $timeout(function() { $scope.updateStatus(); }, 3000);
	};

  $scope.refresh = function() {
    $scope.updateStatus();
  };

  $scope.openUI = function() {
    chrome.extension.sendMessage({action:'ui'});
  };

  $scope.loadFeeds = function() {
    var controller = $scope.feedController;
    if (controller.isLoading()) {
			alert('still loading');
			return;
		}

		controller.loadFeeds(function(){ 
      $scope.updateStatus();
      console.log('loaded');
      $scope.saveFeeds();
      $scope.status = "saving...";

      if (controller._error)
        $scope.status = controller._error;

      if (controller.hasNextPage()) {
        controller.nextPage();
        $scope.status = "going next page...";
        $timeout(function() { $scope.loadFeeds(); }, 5000);
      }
    }, function(msg) {
      $scope.updateStatus();
      $scope.status = "loading...";
		});
	};

  $scope.saveFeeds = function() {
    var controller = $scope.feedController;
    if (controller.isLoading()) {
			alert('still loading');
			return;
		}

		for (var i=0; i< controller._feeds.length; ++i) {
			var feed = controller._feeds[i];
//			if (! $f('#checkbox-feed-' + feed.mid).is(":checked")) 
//				continue; 

			var message = {
					action: "save",
					data: JSON.stringify(feed)
			};

			chrome.extension.sendMessage(message);
		}
  };

	$scope.deleteFeeds = function() {
    var controller = $scope.feedController;

		var feeds = [];
		for (var i=0; i< controller.feeds.length; ++i) {
			var feed = controller.feeds[i];
			feeds.push(feed.mid);
		}
		controller.deleteFeeds(feeds);
	};

  $scope.updateStatus = function() {
    var controller = $scope.feedController;
    $scope.hasNextPage = controller.hasNextPage();
    $scope.hasPrevPage = controller.hasPreviousPage();
    $scope.hasMoreFeeds = controller.hasMoreFeeds();
    $scope.currentPage = controller.currentPage();

    controller.collectFeeds();
    $scope.feeds = controller._feeds;
  };

  $scope.updateStatus();
}

//feed
;(function(flux) {

var Author = flux.Author = function() {};
var Feed = flux.Feed = function() {};

var Controller = flux.Controller = function() {
	this._loading = false;
	this._feeds = [];
	this._feedStatus = {};
};

flux.parseQueryString = function(q) {
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
		obj = {};

    while (e = r.exec(q))
       obj[d(e[1])] = d(e[2]);

	return obj;
};

Controller.clickAnchor = function(target) {
	if (target.click) target.click();
	else if (document.createEvent){
		var evt = document.createEvent("MouseEvents"); 
		evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null); 
		target.dispatchEvent(evt);
	}
}

Controller.prototype.type = function() { return "base"; } 
Controller.prototype.hasNextPage = function() { return false; }
Controller.prototype.hasPreviousPage = function() { return false; }
Controller.prototype.hasMoreFeeds = function() { return false; }
Controller.prototype.isLoading = function() { return this._loading; }
Controller.prototype.nextPage = function() { return false; }
Controller.prototype.previousPage = function() { return false; }
Controller.prototype.currentPage = function() { return null; }

Controller.prototype.loadFeeds = function(callback) { callback(); return true; }
Controller.prototype.collectFeeds = function() { return this._feeds.length; };
Controller.prototype.updateFeedStatus = function() {
	for (var i=0; i< this._feeds.length; ++i) {
		var feed = this._feeds[i];
		if (feed.id && !(feed.id in this._feedStatus)) {
			this._feedStatus[feed.id] = { 'saved': false, 'selected': false, 'feed': feed};
		}
	}
}

Feed.renameRoot = function(obj) {
	if (obj.t) {
        obj.t = 'EM';
        if (obj.a) delete obj.a;
    }
}

Feed.prototype.parseContent = function(elem, decorator) {
    if (! elem) return null;
    
    var obj = Feed._parseElement(elem);
    if (! obj) return null;

	if (typeof decorator == "function")
		decorator(obj);
/*	
    if (rewriteRoot && obj.t) {
        obj.t = 'EM';
        if (obj.a) delete obj.a;
    }
*/
//    this._content = JSON.stringify(obj);
  return obj; // JSON.stringify(obj);
};

Feed.prototype.summary = function() {
	if (! this._content) return '';

	var obj = JSON.parse(this._content);
	if (! obj.c) return '';

	var s = '';
	for(var i=0; i < obj.c.length; ++i) {
		if (typeof obj.c[i] == 'object') {
			var c = obj.c[i];
			if (c.c) {
				for(var j=0; j < c.c.length; ++j) {
					if (typeof c.c[j] == "string") s += c.c[j];
				}
			}
		}
		else if (typeof obj.c[i] == "string") 
			s += obj.c[i];

	}

	return s;
}

Feed._parseElement = function(elem) {
    if (!elem || !elem.nodeType) return null;

	switch (elem.nodeType) {
    	case 3: // text node
		case 4: // CDATA node
			return elem.nodeValue;
            
		case 10: // doctype
		case 8: // comment node
            return null;
            
		case 1:  // element
		case 9:  // document
		case 11: // documentFragment
            if (elem.tagName.toLowerCase() in ['frame', 'iframe'/*, 'style', 'input', 'textarea' */]) break;
            if (elem.hasAttribute('__ignore')) {
//                console.log(elem.innerHTML); 
		break;
            }

            var obj = {};
            obj.t = elem.tagName;
            
            if (elem.attributes) {
                var props = {};
        		for (var i=0; i<elem.attributes.length; i++) {
                    var attr = elem.attributes[i];
	    			if (! attr.specified) continue;
					if (attr.name === "style") {
						props.style = elem.style.cssText || attr.value;
					} else if ("string" === typeof attr.value) {
						props[attr.name] = attr.value;
					}
				}
                obj.a = props;
			}

        	if (elem.hasChildNodes()) {
                var children = [];
		    	for (var i=0; i<elem.childNodes.length; i++) {
			    	var child = elem.childNodes[i];
				    child = Feed._parseElement(child);
				    if (child) {
					    children.push(child);
				    }
			    }
			    obj.c = children;
		    }
        
            return obj;

		default: // etc.
            break;
	}
    
    return null;
};

})(Flux);

//weibo

;(function($, flux) {

var Author = flux.Author;
var Feed = flux.Feed;
var Config = flux.Config;

var BaseController = flux.Controller;
if (flux.FeedController) return;

var Controller = flux.FeedController = function() {
	this.base = BaseController;
	this.base();
};

Controller.prototype = new BaseController();

Controller.prototype.type = function() {
    if ($('#pl_content_homeFeed').length) return "inbox";
	else if ($('.WB_feed_self').length) {
    if ($('.PRF_profile_header').find('.pf_info').find('.pf_do .btn_bed[node-type="hover"]').length)
      return "other";
    return "sent";
  }
  else if ($('#pl_content_messageDetail').length)
    return 'private';
	return "inbox";
}

Controller.prototype.findPageButtonByName = function(name) {
	var  as = $('div.W_pages a.W_btn_c');
  if (!as.length)
    as = $('div.W_pages_minibtn a.W_btn_c');

  if (as && as.length) {
    for (var i=0; i<as.length; ++i) {
      if ($(as[i]).find('span').text() == name) return as[i];
    }
  }

  return null;
}

Controller.prototype.hasNextPage = function() {
  return this.findPageButtonByName('下一页') != null;

//	return $('a.W_btn_c[action-type="feed_list_page_next"]').length > 0;
}

Controller.prototype.hasPreviousPage = function() {
  return this.findPageButtonByName('上一页') != null;
//	return $('a.W_btn_c[action-type="feed_list_page_pre"]').length > 0;
}

Controller.prototype.hasMoreFeeds = function() {
  if (this.type() == 'private') return false;
	return (! this.hasNextPage() && ! this.hasPreviousPage()) || (this.type() == "feed" && $("a.PRF_feed_list_more").length > 0 && $("a.PRF_feed_list_more").is("visible"));
//    return $('.W_loading').length > 0;
}

Controller.prototype.nextPage = function() {
	var btn = this.findPageButtonByName('下一页');
	if (btn) BaseController.clickAnchor(btn);
}

Controller.prototype.previousPage = function() {
	var btn = this.findPageButtonByName('上一页');
	if (btn) BaseController.clickAnchor(btn);
}

Controller.prototype.currentPage = function() {
  if (this.type() == 'private') {
    var s = $('div.W_pages_minibtn a.S_txt1').attr('action-data');
    return s;
  }

	var s = $('div.W_pages a.current[action-type="feed_list_page_more"]').attr('action-data');
	if (!s) return null;

	var p = s.search(/\?/);
	if (p >= 0) s = s.substring(p + 1);

	var qs = flux.parseQueryString(s);
	return "currentPage" in qs? qs.currentPage: null;
}

Controller.prototype.deleteFeeds = function(feeds) {
	if (! feeds.length) return false;

	var _this = this;
	var id = feeds.shift();
	$.post('/aj/mblog/del?__rnd=' + Math.round((new Date()).getTime() / 1000), {'_t': 0, 'mid': id}, function() { _this.deleteFeeds(feeds); });
}

Controller.prototype.loadFeeds = function(callback, progress, count) {
	console.log('loading feeds');
	var _this = this;
	if (this._loading) return false;

	if (typeof count != 'number' || count < 0) count = 10;
	if (typeof progress == 'function') progress(count);

	this._error = null;
    if (this.hasMoreFeeds() && count > 0) {
/*			
	    if (window.STK) {
    	    var g = window.STK.core.util.pageSize();
        	var h = {scrollLeft:0,scrollTop:g.page.height - g.win.height,winWidth:g.win.width,winHeight:g.win.height,pageWidth:g.page.width,pageHeight:g.page.height};
	        window.STK.common.channel.window.fire("scroll",h);

        	window.setTimeout(function() { _this._loading = false; _this.loadFeeds(callback, progress, count - 1); }, 5000);
		}
*/
    if ($("a.PRF_feed_list_more").length) {
	    BaseController.clickAnchor($("a.PRF_feed_list_more")[0]);
    }
    else {
      if ($('.W_loading').length)
  		  $('.W_loading')[0].scrollIntoView();
    }
		window.setTimeout(function() { 
      $('html, body').scrollTop(0); 
   	  _this._loading = false; _this.loadFeeds(callback, progress, count - 1);
      }, 5000);

	  this._loading = true;
	} else {
		this._loading = false;
		if (count == 0) {
      this._error = "timeout";
      console.log('timeout');
    }

		if (callback) callback();
	}
}

Controller.prototype.currentAuthor = function() {
	if (this.type() == "inbox" || this.type() == "private") return null;
	var personContainer = null;
	if ($('.PRF_profile_header').length)
		personContainer = $('.PRF_profile_header').find('.profile_top');

	if (! personContainer) return null;

	var author = new Author();

	var face = personContainer.find('.pf_head_pic img');
	author.avatar = face.attr('src').replace(/\/180\//, '/50/');
	author.nickname = face.attr('alt');

	var link = personContainer.find('.pf_info .pf_name');
  author.id = link.find('div.icon_bed[node-type="level"] a').attr('href');
  if (author.id.indexOf('/?id=') > 0) author.id = author.id.substring(author.id.indexOf('/?id=') + 5);

  author.link = link.find('div.icon_bed a').last().attr('href');
  if (author.link.indexOf('?') > 0) author.link = author.link.substring(0, author.link.indexOf('?'));
  author.name = author.link;

	return author;
}

//2014-1-1
Controller.prototype.collectMessages = function() {
	this._feeds = [];
  var container = $('.msg_dialogue[node-type="messageList"]');
	if (! container.length) return 0;

  var items = container.children();
  var time = 0;
  for (var i=0; i<items.length; ++i) {
    var msg = $(items[i]);
    if (msg.hasClass('msg_time_line')) {
      time = Date.parse(msg.children('.time_tit').text()) / 1000;
    }
    else {
      var feed = new Feed();
      feed.timestamp = time;
      feed.mid = msg.attr('mid');
      feed.type = 'private';
      if (msg.hasClass('msg_dialist_l')) {
        feed.sent = '1';
      }
      var from = msg.find('.msg_dialist_box .msg_dialist_pic');
      var author = {};
      author.link = from.children('a.dialist_pic_box').attr('href');
      author.avatar = from.find('a.dialist_pic_box img').attr('src');
      author.id = from.find('a.dialist_pic_box img').attr('usercard');
      if (author.id.indexOf('id=') == 0) author.id = author.id.substring(3);
      if (msg.hasClass('msg_dialist_r')) {
        author.nickname = $('.group_read .title .dia_object').text();
      }

      var part = {type:'text/html', subtype:'json', "x_author": author};
      part.data = JSON.stringify(feed.parseContent(msg.find('div.msg_dia_con')[0]));
      part.text = msg.find('div.msg_dia_con').text();
      part.timestamp = time;
      feed.parts = [part];

      feed.ext = {"server": "weibo.com"};
      this._feeds.push(feed);
    }
  }
}

Controller.prototype.collectFeeds = function() {
  if (this.type() == 'private') {
    this.collectMessages();
    return;
  }

	var container = $('.WB_feed[node-type="feed_list"]');
	if (! container.length) return 0;

	var defaultAuthor = this.currentAuthor();

	var feeds = container.find('div.WB_feed_type[action-type="feed_list_item"]'); //XXX: dAtail...

	var _this = this;

  this._feeds = [];
  for (var it=0; it<feeds.length; it++) {
    var item = $(feeds[it]);
    if (item.attr('node-type') || item.attr('data-mark'))
      continue;
        
    var feed = new Feed();
    feed.mid = item.attr('mid');

    item = item.children('div.WB_feed_datail');
       
    feed.parts = [];

    var part = {"type":"text/html", "subtype":"json"};
    feed.parts.push(part);

   if (item.children('.WB_face').length) {
        	var author = new Author();
	        part.x_author = author;

          var au = item.children('.WB_face').find('a > img');
	        author.id = au.attr('usercard');
			    if (author.id && author.id.indexOf('id=') == 0) author.id = author.id.substr(3);

    	    author.nickname = au.attr('title');
        	author.link = item.children('.WB_face').children('a').attr('href');
	        author.name = author.link;
    	    author.avatar = au.attr('src');
		} 
    else if (_this.type() != "inbox") {
			    part.x_author = defaultAuthor;
	  }
  
    var content = item.children('.WB_detail');

    var ad = content.children('.WB_func').children('.WB_from').find('a[node-type="feed_list_item_date"]');
    part.x_permlink = ad.attr('href');
    part.timestamp = ad.attr('date') / 1000;

    var b = content.children('.WB_func').children('.WB_handle').find('a');
		for (var i=0; i<b.length; ++i) {
				  var t = $(b[i]).text();
				  var m = t.match(/转发(\((\d+)\))?/);
				  if (m) {
					  if (m[2]) part.reposts = parseInt(m[2]);
					  continue;
				  }
				  var m = t.match(/评论(\((\d+)\))?/);
				  if (m) {
					  if (m[2]) part.comments = parseInt(m[2]);
					  continue;
				  }
		}
	       
    var content_node = content.children('.WB_text');
    var obj = feed.parseContent(content_node[0]);
    part.data = JSON.stringify(obj);
    part.text = content_node.text();

    var pics = item.find('.WB_detail > .WB_media_list').find('li img.bigcursor');
    if (pics.length) {
    		var p = [];
    		for (var j = 0; j < pics.length; ++j) p.push({url: pics[j].src});
    		part.x_pictures = p;
    }
		
    var ref = item.find('.WB_detail > .WB_media_expand > div[node-type="feed_list_forwardContent"]');
        if (ref.length) {
    		var fauthor = new Author();
        var ffeed = {"type":"text/html", "subtype":"json"};
        	ffeed.x_author = fauthor;
          ffeed.id = item.find('.WB_detail > .WB_media_expand > .WB_func > .WB_handle').attr('mid');

          var au = ref.find('.WB_info > a.WB_name');
          fauthor.id = au.attr('usercard');
          if (fauthor.id && fauthor.id.indexOf("id=") == 0) fauthor.id = fauthor.id.substring(3);
          fauthor.nickname = au.attr('title');
          fauthor.link = au.attr('href');
          fauthor.name = fauthor.link;
            
          var ad = item.find('.WB_detail > .WB_media_expand > .WB_func > .WB_from > a[node-type="feed_list_item_date"]');
          ffeed.x_permlink = ad.attr('href');
        	ffeed.timestamp = ad.attr('date') / 1000;

          var ct = ref.children('.WB_text');
          if (ct.length)
            ffeed.data = JSON.stringify(feed.parseContent(ct[0]));

          var pics = item.find('.WB_detail > .WB_media_expand > div[node-type="feed_list_media_prev"]').find('li img.bigcursor');
          if (pics.length) {
    			  var p = [];
	    		  for (var j = 0; j < pics.length; ++j) p.push({url: pics[j].src});
    			  ffeed.x_pictures = p;
          }
          if (typeof ffeed.data != 'undefined')
            feed.parts.push(ffeed);
    }

    feed.timestamp = part.timestamp;
    feed.from = part.x_author.id;
    feed.ext = {"server": "weibo.com"};

    feed.type = _this.type();
//    console.log('new feed: ' + JSON.stringify(feed, null, 2));

		_this._feeds.push(feed);
	}

	this.updateFeedStatus();

	return this._feeds.length;
};

})($f, Flux);


