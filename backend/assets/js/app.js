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
		'angularMoment',
		'angularFileUpload'
	]);


app.config(function ($stateProvider, $urlRouterProvider, $logProvider) {
	'use strict';

	$logProvider.debugEnabled(false);

	var access = routingConfig.accessLevels;

	$urlRouterProvider.otherwise('/start');

	$urlRouterProvider.when('/admin', '/admin/users');
	$urlRouterProvider.when('/docs', '/docs/list');

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
		.state('admin', {
			url: '/admin',
			abstract: true,
			templateUrl: 'partials/admin.html',
			controller: 'AdminController',
			data: {
				access: access.admin
			}
		})
		.state('admin.users', {
			url: '/users',
			templateUrl: 'partials/admin/users.html',
			controller: 'AdminUsersController',
			data: {
				access: access.admin
			}
		})
		.state('admin.groups', {
			url: '/groups',
			templateUrl: 'partials/admin/groups.html',
			controller: 'AdminGroupsController',
			data: {
				access: access.admin
			}
		})


		.state('docs', {
			url: '/docs',
			abstract: true,
			templateUrl: 'partials/docs.html',
			controller: 'DocsController'
		})
		.state('docs.list', {
			url: '/list',
			templateUrl: 'partials/docs/list.html',
			controller: 'DocsListController'
		})
		.state('docs.upload', {
			url: '/upload',
			templateUrl: 'partials/docs/upload.html',
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
			controller: 'AppController'
		});
});

app.run(function ($window, $rootScope, $location, $state, gettextCatalog, AuthenticationService) {

	'use strict';

	var access = routingConfig.accessLevels;

	$rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
		var state_access = toState.data ? toState.data.access : access.user;
		if (!AuthenticationService.authorize(state_access)) {
			$rootScope.accessdenied = true;
			event.preventDefault();
			$state.go('login');
		}
	});

});

