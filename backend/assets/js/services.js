'use strict';

/* Services */

app.factory('AuthenticationService', function ($http, $cookieStore) {

	var
		cookieName = 'lobbycloud-user',
		cookieUser = $cookieStore.get(cookieName),
		accessLevels = routingConfig.accessLevels,
		userRoles = routingConfig.userRoles,
		currentUser = cookieUser || { username: '', role: userRoles.public };


	function changeUser(user) {
		user.isAdmin = user.role.title === userRoles.admin.title;
		$cookieStore.put(cookieName, user);
		angular.extend(currentUser, user);
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
		check: function (success, error) {
			$http.post('/api/admin/user')
				.success(function (user) {
					setCurrentUser(user);
					success(user);
				}).error(function (err) {
					if (error) error(err);
				});
		},
		login: function (user, success, error) {
			$http.post('/api/login', user)
				.success(function (user) {
					setCurrentUser(user);
					success(user);
				}).error(function (err) {
					if (error) error(err);
				});
		},
		logout: function (success, error) {
			$http.post('/api/logout').success(function () {
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
		user: currentUser
	};
});

app.factory('UsersService', function ($resource) {
	'use strict';
	return $resource('/api/admin/:cmd', {}, {
			users: {
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
