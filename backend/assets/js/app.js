'use strict';

var app = angular
	.module('LobbyCloudCentralApp',
	[
		'ngCookies',
		'ui.router',
		'ui.bootstrap',
		'gettext',
		'ngResource',
		'ngTable',
		'ngSanitize',
		'angularMoment'
	]);


app.config(function ($stateProvider, $urlRouterProvider, $logProvider, $locationProvider) {
	'use strict';
//	$locationProvider.html5Mode(true).hashPrefix('!');

	$logProvider.debugEnabled(false);

	var access = routingConfig.accessLevels;

	$urlRouterProvider.otherwise('/start');
//	$routeProvider.when "/",
//		controller: ["$state", ($state) ->
//		$state.transitionTo("catalogue.popular")
//	]

//	$urlRouterProvider.when('/', '/docs/list');

	$stateProvider
		.state('login', {
			url: '/login',
			templateUrl: 'partials/login.html',
			controller: 'LoginController',
			data: {
				access: access.public
			}
		})
		.state('start', {
			url: '/start',
			templateUrl: 'partials/start.html',
			controller: 'StartController'
		})
		.state('users', {
			url: '/users',
			templateUrl: 'partials/users.html',
			controller: 'UsersController',
			data: {
				access: access.admin
			}
		})
		.state('docs', {
			url: '/docs',
			templateUrl: 'partials/docs.html',
			controller: 'DocsController'
		})
		.state('queue', {
			url: '/queue',
			templateUrl: 'partials/queue.html',
			controller: 'QueueController'
		})
		.state('docitem', {
			url: '/doc/:id',
			templateUrl: 'partials/doc.html',
			controller: 'DocController'
		})
		.state('queueitem', {
			url: '/queue/:id',
			templateUrl: 'partials/queueitem.html',
			controller: 'QueueItemController'
		})
		.state('topics', {
			url: '/topics',
			templateUrl: 'partials/topics.html',
			controller: 'TopicsController'
		})
		.state('organisations', {
			url: '/organisations',
			templateUrl: 'partials/organisations.html',
			controller: 'OrganisationsController'
		})
		.state('upload', {
			url: '/upload',
			templateUrl: 'partials/upload.html',
			controller: 'DocsUploadController'
		})
		.state('logout', {
			url: '/logout',
			templateUrl: 'partials/logout.html',
			controller: 'LogoutController'
		})
		.state('error', {
			url: '/error',
			templateUrl: 'partials/error.html',
			controller: 'AppController',
			data: {
				access: access.public
			}
		});
});

app.run(function ($window, $rootScope, $timeout, $location, $state, gettextCatalog, AuthenticationService) {

	'use strict';

	var access = routingConfig.accessLevels;

	$rootScope.resize = function (e) {
		$('#main').css('min-height', $(window).innerHeight() - ($('header').outerHeight() + $('footer').outerHeight()));
	};
	$(window).resize($rootScope.resize);
	$rootScope.resize();

	$rootScope.$on('stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
		$rootScope.resize();
	});

	$rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
		var state_access = toState.data ? toState.data.access : access.user;
		if (!AuthenticationService.authorize(state_access)) {
			event.preventDefault();
			//see if logged in through frontend
			AuthenticationService.check(
				function (user) {
					$state.go(toState.name);
				}, function (err) {
					$rootScope.accessdenied = true;
					$state.go('login');
				}
			);
		}
	});

})
;

