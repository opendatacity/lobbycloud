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


app.config(function ($stateProvider, $urlRouterProvider, $logProvider) {
	'use strict';

	$logProvider.debugEnabled(false);

	var access = routingConfig.accessLevels;

	$urlRouterProvider.otherwise('/start');

//	$urlRouterProvider.when('/docs', '/docs/list');

	$stateProvider
		.state('login', {
			url: '/login',
			templateUrl: 'partials/login.html',
			controller: 'LoginController',
			data: {
				access: access.public
			}
		})
		.state('app', {
			url: '/start',
			templateUrl: 'partials/start.html',
			controller: 'StartController'
		})
		.state('users', {
			url: '/users',
			templateUrl: 'partials/users.html',
			controller: 'UserListController',
			data: {
				access: access.admin
			}
		})
		.state('docs', {
			url: '/docs',
			templateUrl: 'partials/docs.html',
			controller: 'DocsListController'
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

app.run(function ($window, $rootScope, $location, $state, gettextCatalog, AuthenticationService) {

	'use strict';

	var access = routingConfig.accessLevels;

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

