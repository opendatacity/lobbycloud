'use strict';

/* Controllers */

app.controller('BodyController', function ($scope, $state, $location, $window, AuthenticationService, gettextCatalog) {
	'use strict';

	gettextCatalog.debug = false;

	$scope.setLang = function (lng, noreload) {
		$window.moment.lang(lng.substr(0, 2));
		gettextCatalog.currentLanguage = lng;
		if (!noreload)
			$state.go($state.$current, null, { reload: true });
	};

	$scope.setLang('de_DE', true);

	$scope.isActiveLang = function (lng) {
		return gettextCatalog.currentLanguage == lng;
	};

	$scope.isLoggedIn = function () {
		return AuthenticationService.isLoggedIn();
	};

	$scope.isAdmin = function () {
		return AuthenticationService.isAdmin();
	};

	$scope.isActive = function (viewLocation) {
		return $location.path().indexOf(viewLocation) >= 0;
	};

});

app.controller('LogoutController', function ($scope, $location, AuthenticationService) {
	'use strict';
	AuthenticationService.logout(
		function () {
		},
		function (err) {
			$scope.err = err;
		}
	);
});

app.controller('LoginController', function ($scope, $location, AuthenticationService) {
	'use strict';

	$scope.login = {};

	$scope.loginUser = function () {
		$scope.login = {
			username: $("#login-user").val(),
			password: $("#login-pass").val()
		};
		AuthenticationService.login($scope.login,
			function (user) {
				$location.path("/app");
			},
			function (err) {
				$scope.error = err;
			}
		);
	};

});

app.controller('StartController', function ($scope, AuthenticationService) {
	'use strict';
	$scope.user = AuthenticationService.user;
});

app.controller('AdminController', function ($scope, AuthenticationService) {
	'use strict';
	$scope.user = AuthenticationService.user;
});

app.controller('AdminUsersController', function ($scope, $location, $state, AuthenticationService, AdminService) {
	'use strict';
	$scope.userRoles = [
		AuthenticationService.userRoles.user,
		AuthenticationService.userRoles.admin
	];

	$scope.users = AdminService.users({},
		function (data) {
		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});

	var getUserByID = function (id) {
		return $scope.users.filter(function (user) {
			return user.id === id;
		})[0]
	};

	$scope.cancelDialog = function () {
		$scope.current_user = null;
	};

	$scope.deleteUser = function () {
		var user = $scope.current_user;
		$scope.current_user = null;
		user.processing = true;
		AdminService.deleteUser({id: user.id},
			function () {
				$scope.users = $scope.users.filter(function (u) {
					return u.id !== user.id;
				});
			}, function (err) {
				user.processing = false;
				alert(err.data);
			}
		);
	};

	$scope.editUser = function () {
		var edit_user = $scope.current_user;
		$scope.current_user = null;
		edit_user.processing = true;
		if (edit_user.id) {
			var org_user = getUserByID(edit_user.id);
			AdminService.editUser({user: edit_user}, function (user) {
				$scope.users[$scope.users.indexOf(org_user)] = user;
			})
		} else {
			AdminService.addUser({user: edit_user}, function (user) {
				$scope.users.push(user);
			})
		}
	};

	$scope.showUserDialog = function () {
		var user;
		if (this.rowuser == null) // new User
			user = {role: AuthenticationService.userRoles.user};
		else
			user = angular.copy(this.rowuser);
		if (user) {
			user.role = AuthenticationService.userRoles[user.role.title];
			$scope.current_user = user;
			$('#modal-editUser').modal();
		}
	};

	$scope.deleteUserDialog = function () {
		$scope.current_user = this.rowuser;
		if ($scope.current_user)
			$('#modal-deleteUser').modal();
	};

});

app.controller('AdminGroupsController', function ($scope, $state, AuthenticationService, AdminService) {
	'use strict';

	$scope.groups = AdminService.groups({},
		function (data) {
		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});
});

app.controller('DocsController', function ($scope, $state, $filter, $templateCache, ngTableParams, gettextCatalog, AuthenticationService, DocsService) {
	'use strict';

	var data = [];
	$scope.docs = [];
	$scope.search = {
		title: '',
		range: {
			startDate: '',
			endDate: ''
		},
		range_enabled: false
	};

	var reload = function () {
		if (($scope.tableParams) && (this.last !== undefined)) {
			$scope.tableParams.reload();
		}
	};

	$scope.$watch("search.range", function () {
		if (($scope.tableParams) && (this.last !== undefined)) {
			if (!$scope.search.range_enabled)
				$scope.search.range_enabled = true;
			else
				$scope.tableParams.reload();
		}
	});
	$scope.$watch("search.range_enabled", reload);
	$scope.$watch("search.title", reload);

	$scope.selectRow = function (clickdoc) {
		if (clickdoc.$selected) {
			clickdoc.$selected = false;
			$scope.doc = null;
		} else {
			if ($scope.doc) {
				$scope.doc.$selected = false;
			}
			clickdoc.$selected = true;
			$scope.doc = clickdoc;
		}
	};

	DocsService.list({},
		function (docsdata) {
			data = docsdata;

			$scope.tableParams = new ngTableParams({
				page: 1,            // show first page
				count: 10,           // count per page,
				sorting: {
					name: 'asc'     // initial sorting
				}
			}, {
				total: data.length, // length of data
				getData: function ($defer, params) {
					var
						orderedData = $scope.search.title ? $filter('filter')(data, {'title': $scope.search.title}) : data;
					if ($scope.search.range && $scope.search.range_enabled) {
						var startDate = new Date($scope.search.range.startDate).valueOf();
						var endDate = new Date($scope.search.range.endDate).valueOf();
						orderedData = $filter('filter')(orderedData, function (value) {
							return (value.uploaded >= startDate) && (value.uploaded <= endDate);
						});
					}

					orderedData = params.sorting() ? $filter('orderBy')(orderedData, params.orderBy()) : orderedData;

					params.total(orderedData.length); // set total for recalc pagination
					$scope.docs = orderedData;
					$defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
				}
			});
		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});
});
