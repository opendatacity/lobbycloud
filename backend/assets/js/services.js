'use strict';

/* Services */

app.factory('AuthenticationService', function ($http, $rootScope, $cookieStore) {

	var
		cookieName = 'lobbycloud-user',
		cookieUser = $cookieStore.get(cookieName),
		accessLevels = routingConfig.accessLevels,
		userRoles = routingConfig.userRoles,
		userRoleList = routingConfig.userRoleList,
		currentUser = cookieUser || { username: '', role: userRoles.public };

	$rootScope.account = currentUser;

	function changeUser(user) {
		$cookieStore.put(cookieName, user);
		angular.extend(currentUser, user);
		$rootScope.account = currentUser;
	}

	function setCurrentUser(user) {
		user.role = userRoles[user.role];
		if (!user.role) {
			console.log('Unknown user role, assuming user');
			user.role = userRoles.user;
		}
		changeUser(user);
	}

	return {
		authorize: function (accessLevel, role) {
			if (role === undefined) {
				role = currentUser.role;
			}
			return accessLevel.bitMask & role.bitMask;
		},
		isLoggedIn: function (user) {
			if (user === undefined) {
				user = currentUser;
			}
			return user.role.title === userRoles.user.title || user.role.title === userRoles.admin.title;
		},
		check: function (success, error) {
			$http.post('/api/backend/user')
				.success(function (user) {
					setCurrentUser(user);
					success(user);
				}).error(function (err) {
					if (error) error(err);
				});
		},
		login: function (user, success, error) {
			$http.post('/api/backend/login', user)
				.success(function (user) {
					setCurrentUser(user);
					success(user);
				}).error(function (err) {
					if (error) error(err);
				});
		},
		logout: function (success, error) {
			$http.post('/api/backend/logout').success(function () {
				changeUser({
					username: '',
					role: userRoles.public
				});
				$cookieStore.remove(cookieName);
				success();
			}).error(function (err) {
				if (error) error(err);
			});

		},
		reset: function () {
			changeUser({
				username: '',
				role: userRoles.public
			});
			$cookieStore.remove(cookieName);
		},
		accessLevels: accessLevels,
		userRoles: userRoles,
		userRolesList: userRoleList,
		user: currentUser
	};
});

app.factory('UsersService', function ($resource) {
	'use strict';
	return $resource('/api/backend/:cmd', {}, {
			list: {
				method: 'POST',
				params: {cmd: 'users'},
				isArray: true
			},
			delete: {
				method: 'POST',
				params: {cmd: 'users.delete'}
			},
			add: {
				method: 'POST',
				params: {cmd: 'users.add'}
			},
			edit: {
				method: 'POST',
				params: {cmd: 'users.update'}
			}
		}
	);
});

app.factory('InvitesService', function ($resource) {
	'use strict';
	return $resource('/api/backend/:cmd', {}, {
			create: {
				method: 'POST',
				params: {cmd: 'invite.create'}
			}
		}
	);
});

app.factory('DocsService', function ($resource) {
	'use strict';
	return $resource('/api/backend/:cmd', {}, {
			list: {
				method: 'POST',
				params: {cmd: 'docs'},
				isArray: true
			}
		}
	);
});

app.factory('TopicsService', function ($resource) {
	'use strict';
	return $resource('/api/backend/:cmd', {}, {
			list: {
				method: 'POST',
				params: {cmd: 'topics'},
				isArray: true
			},
			delete: {
				method: 'POST',
				params: {cmd: 'topics.delete'}
			},
			add: {
				method: 'POST',
				params: {cmd: 'topics.add'}
			},
			edit: {
				method: 'POST',
				params: {cmd: 'topics.update'}
			}
		}
	);
});
