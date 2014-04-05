'use strict';

/* Services */

app.factory('AuthenticationService', function ($http, $cookieStore) {

	var
		cookieUser = $cookieStore.get('user')
		, accessLevels = routingConfig.accessLevels
		, userRoles = routingConfig.userRoles
		, currentUser = cookieUser || { username: '', role: userRoles.public };

	function changeUser(user) {
		$cookieStore.put('user', user);
		angular.extend(currentUser, user);
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
		isAdmin: function (user) {
			if (user === undefined) {
				user = currentUser;
			}
			return user.role.title === userRoles.admin.title;
		},
		register: function (user, success, error) {
			$http.post('/api/register', user).success(function (res) {
				changeUser(res);
				success();
			}).error(error);
		},
		login: function (user, success, error) {
			$http.post('/api/login', user).success(function (user) {
				changeUser(user);
				success(user);
			}).error(error);
		},
		logout: function (success, error) {
			$http.post('/api/logout').success(function () {
				changeUser({
					username: '',
					role: userRoles.public
				});
				$cookieStore.remove('user');
				success();
			}).error(error);
		},
		reset: function () {
			changeUser({
				username: '',
				role: userRoles.public
			});
			$cookieStore.remove('user');
		},
		accessLevels: accessLevels,
		userRoles: userRoles,
		user: currentUser
	};
});

app.factory('AdminService', function ($resource) {
	'use strict';
	return $resource('/api/admin/:cmd', {}, {
			users: {
				method: 'POST',
				params: {cmd: 'users'},
				isArray: true
			},
			groups: {
				method: 'POST',
				params: {cmd: 'groups'},
				isArray: true
			},
			deleteUser: {
				method: 'POST',
				params: {cmd: 'deleteUser'}
			},
			addUser: {
				method: 'POST',
				params: {cmd: 'addUser'}
			},
			editUser: {
				method: 'POST',
				params: {cmd: 'editUser'}
			}
		}
	);
});

app.factory('DocsService', function ($resource) {
	'use strict';
	return $resource('/api/docs/:cmd', {}, {
			list: {
				method: 'GET',
				params: {cmd: 'list'},
				isArray: true
			}
		}
	);
});
