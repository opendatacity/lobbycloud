'use strict';

/* Services */

app.factory('AuthenticationService', function ($http, $cookieStore) {

	var
		cookieName = 'lobbycloud-user',
		cookieUser = $cookieStore.get(cookieName),
		accessLevels = routingConfig.accessLevels,
		userRoles = routingConfig.userRoles,
		currentUser = cookieUser || { username: '', role: userRoles.public };

	console.log(currentUser);

	function changeUser(user) {
		user.isAdmin = user.role.title === userRoles.admin.title;
		$cookieStore.put(cookieName, user);
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
				console.log(user.role);
				user.role = userRoles[user.role];
				console.log(user.role);
				if (!user.role) {
					console.log('Unknown user role, assuming user');
					user.role = userRoles.user;
				}
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
				$cookieStore.remove(cookieName);
				success();
			}).error(error);
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
				params: {cmd: 'users.delete'}
			},
			addUser: {
				method: 'POST',
				params: {cmd: 'users.add'}
			},
			editUser: {
				method: 'POST',
				params: {cmd: 'users.update'}
			}
		}
	);
});

app.factory('DocsService', function ($resource) {
	'use strict';
	return $resource('/api/admin/:cmd', {}, {
			list: {
				method: 'POST',
				params: {cmd: 'docs'},
				isArray: true
			}
		}
	);
});
