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

app.controller('StartController', function ($scope, InvitesService, AuthenticationService) {
	'use strict';
	$scope.account = AuthenticationService.user;
	$scope.genInvite = function() {
		$scope.invite = InvitesService.create();
	};
});

app.controller('UserListController', function ($scope, $state, $modal, AuthenticationService, UsersService) {
	'use strict';
	$scope.account = AuthenticationService.user;

	$scope.getUserByID = function (id) {
		return $scope.users.filter(function (user) {
			return user.id === id;
		})[0]
	};

	$scope.users = UsersService.users({},
		function (data) {
		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});

	var deleteUser = function (user) {
		user.processing = true;
		UsersService.delete({id: user.id},
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

	var updateUser = function (edit_user, org_user) {
		if (org_user) {
			org_user.processing = true;
			UsersService.edit({id: org_user.id, user: edit_user}, function (user) {
				$scope.users[$scope.users.indexOf(org_user)] = user;
			}, function (err) {
				org_user.processing = false;
				alert(err.data);
			})
		} else {
			UsersService.add({user: edit_user}, function (user) {
				$scope.users.push(user);
			}, function (err) {
				alert(err.data);
			})
		}
	};

	$scope.editUserDialog = function (org_user) {
		var user = org_user ? angular.copy(org_user) : {role: AuthenticationService.userRoles.user.title, create: true};
		user.role = AuthenticationService.userRoles[user.role];
		if (!user.url)
			user.url = null;
		var modalInstance = $modal.open({
			templateUrl: 'partials/user.html',
			controller: function ($scope, $modalInstance, user, AuthenticationService) {

				$scope.user = user;
				$scope.userRoles = [AuthenticationService.userRoles.user, AuthenticationService.userRoles.admin];

				$scope.ok = function (form) {
					if (form.$valid)
						$modalInstance.close($scope.user);
				};

				$scope.cancel = function () {
					$modalInstance.dismiss('cancel');
				};
			},
			resolve: {
				user: function () {
					return user;
				}
			}
		});

		modalInstance.result.then(function (user) {
			user.role = user.role.title;
			updateUser(user, org_user);
		}, function () {
//			$log.info('Modal dismissed at: ' + new Date());
		});
	};

	$scope.deleteUserDialog = function (org_user) {
		var modalInstance = $modal.open({
			templateUrl: 'deleteUserDialog.html',
			controller: function ($scope, $modalInstance, user, AuthenticationService) {
				$scope.user = user;
				$scope.ok = function () {
					$modalInstance.close($scope.user);
				};
				$scope.cancel = function () {
					$modalInstance.dismiss('cancel');
				};
			},
			resolve: {
				user: function () {
					return org_user;
				}
			}
		});

		modalInstance.result.then(function () {
			deleteUser(org_user);
		}, function () {
//			$log.info('Modal dismissed at: ' + new Date());
		});
	};

});


app.controller('InvitesController', function ($scope, InvitesService, AuthenticationService) {
	'use strict';
	$scope.account = AuthenticationService.user;
	$scope.loading = true;
	$scope.invites = InvitesService.list();
});

app.controller('DocsListController', function ($scope, $state, $filter, $templateCache, ngTableParams, gettextCatalog, AuthenticationService, DocsService) {
	'use strict';

	$scope.account = AuthenticationService.user;
	$scope.loading = true;
	var data = [];
	$scope.docs = [];

	var reload = function (o, n) {
		if ((!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			console.log('reload');
			$scope.tableParams.reload();
		}
	};

	$scope.$watch("search.range", function (o, n) {
		if (($scope.search) && (!$scope.search.range_enabled))
			$scope.search.range_enabled = true;
		else
			reload(o, n);
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
			var min = null;
			var max = 0;
			data.forEach(function (doc) {
				min = min ? Math.min(doc.uploaded, min) : doc.uploaded;
				max = Math.max(doc.uploaded, max);
			});
			$scope.search = {
				title: '',
				range: {
					startDate: moment(min),
					endDate: moment(max)
				},
				range_enabled: false
			};
			$scope.tableParams = new ngTableParams({
				page: 1,            // show first page
				count: 10,           // count per page,
				sorting: {
					name: 'asc'     // initial sorting
				}
			}, {
				total: data.length, // length of data
//				groupBy: function(item) {
//					return 'First letter "' + item.title[0] + '"';
//				},
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

			$scope.search.range_enabled = false;
			$scope.loading = false;

		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});
});


app.controller('DocsUploadController', function ($scope) {
	'use strict';
	//we use the components from the front end
});
