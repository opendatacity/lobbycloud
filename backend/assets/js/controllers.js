'use strict';

/* Controllers */

app.controller('BodyController', function ($scope, $state, $window, AuthenticationService, gettextCatalog) {
	'use strict';

	gettextCatalog.debug = false;

	$scope.accessLevels = routingConfig.accessLevels;
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

	$scope.access = function (level) {
		return AuthenticationService.authorize(level);
	};

});

app.controller('LogoutController', function ($scope, AuthenticationService) {
	'use strict';
	AuthenticationService.logout(
		function () {
		},
		function (err) {
			$scope.err = err;
		}
	);
});

app.controller('LoginController', function ($scope, $state, AuthenticationService) {
	'use strict';

	$scope.login = {};

	$scope.loginUser = function () {
		$scope.login = {
			username: $("#login-user").val(),
			password: $("#login-pass").val()
		};
		AuthenticationService.login($scope.login,
			function (user) {
				$state.go('start');
			},
			function (err) {
				$scope.error = err;
			}
		);
	};

});

app.controller('StartController', function ($scope, InvitesService, AuthenticationService) {
	'use strict';
	$scope.genInvite = function () {
		$scope.invite = InvitesService.create();
	};
});

app.controller('InvitesController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, InvitesService) {
	'use strict';

	$scope.load = function () {
		$scope.loading = true;
		InvitesService.list(function (invites) {
			$scope.loading = false;
			$scope.invites = invites;
		}, function (err) {
			$scope.loading = false;
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});
	}

	$scope.load();
});

app.controller('DocsController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, DocsService) {
	'use strict';

	var reloadTable = function (o, n) {
		if ((!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.initData = function (data) {
		//init filter
		var min = null;
		var max = 0;
		data.forEach(function (doc) {
			min = min ? Math.min(doc.uploaded, min) : doc.uploaded;
			max = Math.max(doc.uploaded, max);
		});
		$scope.filter = {
			title: '',
			range: {
				startDate: moment(min ? min : (new Date())),
				endDate: moment(max ? max : (new Date()))
			},
			range_enabled: false
		};
		$scope.$watch("filter.range", function (o, n) {
			if ($scope.filter.range_enabled)
				reloadTable(o, n);
		});
		$scope.$watch("filter.range_enabled", reloadTable);
		$scope.$watch("filter.title", reloadTable);

		//init table
		$scope.tableParams = new ngTableParams({
			page: 1,
			count: 10,
			sorting: {name: 'asc'}
		}, {
			total: data.length,
			getData: function ($defer, params) {
				var orderedData = data;
				orderedData = $scope.filter.title ? $filter('filter')(orderedData, {'title': $scope.filter.title}) : orderedData;
				if ($scope.filter.range && $scope.filter.range_enabled) {
					var startDate = new Date($scope.filter.range.startDate).valueOf();
					var endDate = new Date($scope.filter.range.endDate).valueOf();
					orderedData = $filter('filter')(orderedData, function (value) {
						return (value.uploaded >= startDate) && (value.uploaded <= endDate);
					});
				}
				orderedData = params.sorting() ? $filter('orderBy')(orderedData, params.orderBy()) : orderedData;
				params.total(orderedData.length);
				$scope.docs = orderedData;
				$defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
			}
//				,groupBy: function(item) {
//					return 'First letter "' + item.title[0] + '"';
//				}
		});
	};

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

	$scope.load = function () {
		$scope.loading = true;
		DocsService.list({},
			function (fulldata) {
				$scope.initData(fulldata);
				$scope.loading = false;

			},
			function (err) {
				$scope.loading = false;
				if (err.status == 401) {
					AuthenticationService.reset();
					$state.go('login');
				}
			});
	};

	$scope.load();

});

app.controller('DocsUploadController', function ($scope) {
	'use strict';
	//we use the components from the front end
});

var editModalDialog = function ($modal, data, templateUrl, cb) {
	var modalInstance = $modal.open({
		templateUrl: templateUrl,
		controller: function ($scope, $modalInstance, data) {

			$scope.data = data;

			$scope.ok = function (form) {
				if (form.$valid)
					$modalInstance.close($scope.data);
			};

			$scope.cancel = function () {
				$modalInstance.dismiss('cancel');
			};
		},
		resolve: {
			data: function () {
				return data;
			}
		}
	});

	modalInstance.result.then(function (data) {
		cb(data);
	}, function () {
//			$log.info('Modal dismissed at: ' + new Date());
	});
};

var deleteModalDialog = function ($modal, data, templateUrl, cb) {
	var modalInstance = $modal.open({
		templateUrl: templateUrl,
		controller: function ($scope, $modalInstance, data) {
			$scope.data = data;
			$scope.ok = function () {
				$modalInstance.close($scope.data);
			};
			$scope.cancel = function () {
				$modalInstance.dismiss('cancel');
			};
		},
		resolve: {
			data: function () {
				return data;
			}
		}
	});

	modalInstance.result.then(function () {
		cb(data);
	}, function () {
//			$log.info('Modal dismissed at: ' + new Date());
	});
};

app.controller('UsersController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, UsersService) {
	'use strict';

	$scope.load = function () {
		$scope.loading = true;
		$scope.users = UsersService.list({},
			function (data) {
				$scope.loading = false;
			},
			function (err) {
				$scope.loading = false;
				if (err.status == 401) {
					AuthenticationService.reset();
					$state.go('login');
				}
			});
	};

	$scope.newDialog = function () {
		$scope.editDialog({role: AuthenticationService.userRoles.user.title, create: true});
	};

	$scope.editDialog = function (org_user) {
		editModalDialog($modal, {
			user: angular.copy(org_user),
			userRoles: AuthenticationService.userRolesList
		}, 'editUserDialog.html', function (data) {
			if (data) {
				if (!org_user.create) {
					org_user.$processing = true;
					UsersService.edit({id: org_user.id, user: data.user}, function (user) {
						$scope.users[$scope.users.indexOf(org_user)] = user;
					}, function (err) {
						org_user.$processing = false;
						alert(err.data);
					})
				} else {
					UsersService.add({user: data.user}, function (user) {
						$scope.users.push(user);
					}, function (err) {
						alert(err.data);
					})
				}
			}
		});
	};

	$scope.deleteDialog = function (user) {
		deleteModalDialog($modal, user, 'deleteUserDialog.html', function (ok) {
			if (!ok) return;
			user.$processing = true;
			UsersService.delete({id: user.id},
				function () {
					$scope.users = $scope.users.filter(function (u) {
						return u.id !== user.id;
					});
				}, function (err) {
					user.$processing = false;
					alert(err.data);
				}
			);
		});
	};

	$scope.load();

});

app.controller('TopicsController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, TopicsService) {
	'use strict';

	var reloadTable = function (o, n) {
		if (($scope) && (!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.fulldata = [];

	$scope.initData = function (data) {
		$scope.fulldata = data;
		// init filter
		var min = null;
		var max = 0;
		data.forEach(function (topic) {
			min = min ? Math.min(topic.created, min) : topic.created;
			max = Math.max(topic.created, max);
		});
		$scope.filter = {
			subject: '',
			label: '',
			description: '',
			range: {
				startDate: moment(min ? min : (new Date())),
				endDate: moment(max ? max : (new Date()))
			},
			range_enabled: false
		};
		$scope.$watch("filter.subject", reloadTable);
		$scope.$watch("filter.label", reloadTable);
		$scope.$watch("filter.description", reloadTable);
		$scope.$watch("filter.range_enabled", reloadTable);
		$scope.$watch("filter.range", function (o, n) {
			if ($scope.filter.range_enabled)
				reloadTable(o, n);
		});

		// init table
		$scope.tableParams = new ngTableParams({
				page: 1,
				count: 10,
				sorting: {label: 'asc'}
			},
			{
				total: $scope.fulldata.length,
				getData: function ($defer, params) {
					var orderedData = $scope.fulldata;
					orderedData = $scope.filter.subject ? $filter('filter')(orderedData, {'subject': $scope.filter.subject}) : orderedData;
					orderedData = $scope.filter.label ? $filter('filter')(orderedData, {'label': $scope.filter.label}) : orderedData;
					orderedData = $scope.filter.description ? $filter('filter')(orderedData, {'description': $scope.filter.description}) : orderedData;
					if ($scope.filter.range_enabled) {
						var startDate = new Date($scope.filter.range.startDate).valueOf();
						var endDate = new Date($scope.filter.range.endDate).valueOf();
						orderedData = $filter('filter')(orderedData, function (value) {
							return (value.created >= startDate) && (value.created <= endDate);
						});
					}
					orderedData = params.sorting() ? $filter('orderBy')(orderedData, params.orderBy()) : orderedData;
					params.total(orderedData.length); // set total for recalc pagination
					$scope.topics = orderedData;
					$defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
				}
//				,groupBy: function(item) {
//					return 'First letter "' + item.title[0] + '"';
//				}
			});
	};

	$scope.load = function () {
		$scope.loading = true;
		TopicsService.list({},
			function (data) {
				$scope.initData(data);
				$scope.loading = false;

			},
			function (err) {
				$scope.loading = false;
				if (err.status == 401) {
					AuthenticationService.reset();
					$state.go('login');
				}
			});
	};

	$scope.newDialog = function () {
		$scope.editDialog({create: true});
	};

	$scope.editDialog = function (org_topic) {
		editModalDialog($modal, {
			topic: angular.copy(org_topic)
		}, 'editTopicDialog.html', function (data) {
			if (data) {
				if (!org_topic.create) {
					org_topic.$processing = true;
					TopicsService.edit({topic: data.topic}, function (topic) {
						$scope.fulldata[$scope.fulldata.indexOf(org_topic)] = topic;
						$scope.tableParams.reload();
					}, function (err) {
						org_topic.$processing = false;
						alert(err.data);
					})
				} else {
					TopicsService.add({topic: data.topic}, function (topic) {
						$scope.fulldata.push(topic);
						$scope.tableParams.reload();
					}, function (err) {
						alert(err.data);
					})
				}
			}
		});
	};

	$scope.deleteDialog = function (topic) {
		deleteModalDialog($modal, topic, 'deleteTopicDialog.html', function (ok) {
			if (!ok) return;
			topic.$processing = true;
			TopicsService.delete({id: topic.id},
				function () {
					$scope.fulldata = $scope.fulldata.filter(function (t) {
						return topic.id !== t.id;
					});
					$scope.tableParams.reload();
				}, function (err) {
					topic.$processing = false;
					alert(err.data);
				}
			);
		});
	};

	$scope.load();

});

app.controller('OrganisationsController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, OrganisationsService) {
	'use strict';

	var reloadTable = function (o, n) {
		if (($scope) && (!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.fulldata = [];

	$scope.initData = function (data) {
		$scope.fulldata = data;
		// init filter
		var min = null;
		var max = 0;
		data.forEach(function (org) {
			min = min ? Math.min(org.created, min) : org.created;
			max = Math.max(org.created, max);
		});
		$scope.filter = {
			name: '',
			fullname: '',
			description: '',
			range: {
				startDate: moment(min ? min : (new Date())),
				endDate: moment(max ? max : (new Date()))
			},
			range_enabled: false
		};
		$scope.$watch("filter.name", reloadTable);
		$scope.$watch("filter.fullname", reloadTable);
		$scope.$watch("filter.description", reloadTable);
		$scope.$watch("filter.range_enabled", reloadTable);
		$scope.$watch("filter.range", function (o, n) {
			if ($scope.filter.range_enabled)
				reloadTable(o, n);
		});

		// init table
		$scope.tableParams = new ngTableParams({
			page: 1,
			count: 10,
			sorting: {label: 'asc'}
		}, {
			total: $scope.fulldata.length,
			getData: function ($defer, params) {
				var orderedData = $scope.fulldata;
				orderedData = $scope.filter.name ? $filter('filter')(orderedData, {'name': $scope.filter.name}) : orderedData;
				orderedData = $scope.filter.fullname ? $filter('filter')(orderedData, {'fullname': $scope.filter.fullname}) : orderedData;
				orderedData = $scope.filter.description ? $filter('filter')(orderedData, {'description': $scope.filter.description}) : orderedData;
				if ($scope.filter.range_enabled) {
					var startDate = new Date($scope.filter.range.startDate).valueOf();
					var endDate = new Date($scope.filter.range.endDate).valueOf();
					orderedData = $filter('filter')(orderedData, function (value) {
						return (value.created >= startDate) && (value.created <= endDate);
					});
				}
				orderedData = params.sorting() ? $filter('orderBy')(orderedData, params.orderBy()) : orderedData;
				params.total(orderedData.length); // set total for recalc pagination
				$scope.organisations = orderedData;
				$defer.resolve(orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count()));
			}
//				,groupBy: function(item) {
//					return 'First letter "' + item.title[0] + '"';
//				}
		});
	};

	$scope.load = function () {
		$scope.loading = true;
		OrganisationsService.list({},
			function (data) {
				$scope.initData(data);
				$scope.loading = false;

			},
			function (err) {
				$scope.loading = false;
				if (err.status == 401) {
					AuthenticationService.reset();
					$state.go('login');
				}
			});
	};

	$scope.newDialog = function () {
		$scope.editDialog({create: true});
	};

	$scope.editDialog = function (org_org) {
		editModalDialog($modal, {
			organisation: angular.copy(org_org)
		}, 'editOrganisationDialog.html', function (data) {
			if (data) {
				if (!org_org.create) {
					org_org.$processing = true;
					OrganisationsService.edit({organisation: data.organisation}, function (organisation) {
						$scope.fulldata[$scope.fulldata.indexOf(org_org)] = organisation;
						$scope.tableParams.reload();
					}, function (err) {
						org_org.$processing = false;
						alert(err.data);
					})
				} else {
					OrganisationsService.add({organisation: data.organisation}, function (organisation) {
						$scope.fulldata.push(organisation);
						$scope.tableParams.reload();
					}, function (err) {
						alert(err.data);
					})
				}
			}
		});
	};

	$scope.deleteDialog = function (organisation) {
		deleteModalDialog($modal, organisation, 'deleteOrganisationDialog.html', function (ok) {
			if (!ok) return;
			organisation.$processing = true;
			OrganisationsService.delete({id: organisation.id},
				function () {
					$scope.fulldata = $scope.fulldata.filter(function (o) {
						return organisation.id !== o.id;
					});
					$scope.tableParams.reload();
				}, function (err) {
					organisation.$processing = false;
					alert(err.data);
				}
			);
		});
	};

	$scope.load();

});
