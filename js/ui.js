var $f = jQuery.noConflict(true);

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
//  console.log(JSON.stringify(msg));
  var scope = angular.element($f('#tweet-container')).scope();

  if (msg.action == "export-ack") {
    var result = msg.result;
    if (scope) {
      scope.classes[result.name].url = result.data;
      scope.classes[result.name].filename = result.filename;
    }
  }
  else if (msg.action == "list-ack") {
    var result = msg.result;
    if (scope){
      if (typeof result.items != "undefined" && result.items.length) {
        if (scope.currentClass != result.name) {
          scope.currentClass = result.name;
          scope.authors = [];
          for (var key in scope.classes[result.name].authors) {
            var author = scope.classes[result.name].authors[key];
            author.selected = true;
            scope.authors.push(author);
         }
        }
//        console.log(JSON.stringify(scope.classes[result.name]));
        scope.totalMessages = result.total;
        scope.totalPages = Math.ceil(scope.totalMessages / scope.messagesPerPage);
        scope.messages = result.items;
      }
      else {
        scope.classes[result.name] = result;
//        console.log(JSON.stringify(result));
      }
    }
  }
  else if (msg.action == "summary-ack") {
    var result = msg.result;
    if (scope) scope.classes = result;
    for (var name in result) {
      if (result.hasOwnProperty(name)) {
        chrome.extension.sendMessage({action:'list', name: name, countOnly:true});
      }
    }
  }

  if (scope) scope.$apply();
 });

var App = angular.module('messageApp', ['ngRoute', 'ngSanitize', 'ui.bootstrap']);

App.config(function($routeProvider) {
  $routeProvider.
  when('/', { controller: ListController, template: ' ' }).
  when('/list/:clazz/:page', { controller: ListController, template: ' '}).
  otherwise({ redirectTo: '/'});
});

App.config( [ '$compileProvider', function( $compileProvider ) {
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension|blob):/);
  }
]);

App.directive('tweet', function($compile) {
  return {
    restrict: 'E',
    templateUrl: 'tweet.html',
    scope: {
      msg : '='
    },
    link: function(scope, element, attrs) {
        $compile(element.contents())(scope.$new());
    }
  };
});

function ListController($scope, $route, $routeParams, $location, $timeout) {
  $scope.currentPage = 1;
  $scope.messagesPerPage = 28;
  $scope.totalMessages = 0;
  $scope.totalPages = 0;

  $scope.currentClass = null;
  $scope.classes = {};
  $scope.authors = [];

  $scope.uploadFile = null;

  $scope.revokeBlob = function(key) {
    var clz = $scope.classes[key];
    if (!clz) return;

    var blob = clz.url;
    if (!blob) return;

    $timeout(function() { 
      URL.revokeObjectURL(blob); 
      delete clz.url;
    }, 3000);
  };

  $scope.exportFeeds = function(name) {
    console.log('exportFeeds:' + name);
    chrome.extension.sendMessage({action:'export', name: name});
  };

/*
  $scope.resetDatabase = function() {
    chrome.extension.sendMessage({action:'reset'});
  };
*/

  $scope.go = function(page) {
    if (typeof page == "undefined") page = $scope.currentPage;
    var path = "/list/" + $scope.currentClass + "/" + page;
    $location.path(path);
  };

  $scope.gotoPage = function(clazz, page, authors) {
    if (typeof page == "undefined") page = 1;

    var count = $scope.messagesPerPage;
    var offset = count * (page - 1);

//    $scope.currentClass = clazz;
    $scope.currentPage = page;
    chrome.extension.sendMessage({action:'list', name: clazz, offset: offset, count: count, authors:authors});
  };

  $scope.switchPicture = function(pic) {
    console.log(pic);
    if (!pic.url) return;
    if (pic.url.indexOf(/\/thumbnail\//) >= 0)
      pic.url = pic.url.replace(/\/thumbnail\//, '/bmiddle/');
    else if (pic.url.indexOf(/\/bmiddle\//) >= 0)
      pic.url = pic.url.replace(/\/bmiddle\//, '/thumbnail/');
  };

  $scope.$on('$routeChangeSuccess', function(event, current) {
    var delay = false;
    if (typeof $scope.classes.inbox == 'undefined') {
      chrome.extension.sendMessage({action:'summary'});
      delay = true;
    }

    var authors = [];
    for (var a in $scope.authors) {
      if ($scope.authors[a].selected) authors.push($scope.authors[a].id);
    }

    if (typeof $routeParams.clazz != 'undefined') {
      if ($routeParams.clazz != $scope.currentClass) authors = [];
      $timeout(function() { 
        $scope.gotoPage($routeParams.clazz, $routeParams.page, authors);
      }, delay? 3000: 0);
    }
  });

  $scope.$watch('authors|filter:{selected:true}', function (nv) {
    var authors = nv.map(function (author) {
      return author.id;
    });
//    console.log(JSON.stringify(authors));
    if ($scope.currentClass != null)
      $scope.gotoPage($scope.currentClass, 1, authors);
  }, true);
}

