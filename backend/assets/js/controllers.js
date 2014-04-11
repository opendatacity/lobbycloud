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
	$scope.account = AuthenticationService.user;
});

app.controller('UsersController', function ($scope, $state, AdminService, AuthenticationService) {
	'use strict';
	$scope.account = AuthenticationService.user;

	$scope.getUserByID = function (id) {
		return $scope.users.filter(function (user) {
			return user.id === id;
		})[0]
	};

	$scope.users = AdminService.users({},
		function (data) {
		},
		function (err) {
			if (err.status == 401) {
				AuthenticationService.reset();
				$state.go('login');
			}
		});
});


var ModalInstanceCtrl = function ($scope, $modalInstance, user) {

	$scope.user = user;
	$scope.selected = {
		user: $scope.user
	};

	$scope.ok = function () {
		$modalInstance.close($scope.selected.user);
	};

	$scope.cancel = function () {
		$modalInstance.dismiss('cancel');
	};
};

app.controller('UserListController', function ($scope, $modal, AuthenticationService, AdminService) {
	'use strict';

	var deleteUser = function (user) {
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

	var updateUser = function (edit_user, org_user) {
		if (org_user) {
			org_user.processing = true;
			AdminService.editUser({user: edit_user}, function (user) {
				$scope.users[$scope.users.indexOf(org_user)] = user;
			}, function (err) {
				org_user.processing = false;
				alert(err.data);
			})
		} else {
			AdminService.addUser({user: edit_user}, function (user) {
				$scope.users.push(user);
			}, function (err) {
				alert(err.data);
			})
		}
	};

	$scope.editUserDialog = function (org_user) {
		var user = org_user ? angular.copy(org_user) : {role: AuthenticationService.userRoles.user, create:true};
		user.role = AuthenticationService.userRoles[user.role.title];

		var modalInstance = $modal.open({
			templateUrl: 'partials/admin/user.html',
			controller: ModalInstanceCtrl,
			resolve: {
				user: function () {
					return user;
				}
			}
		});

		modalInstance.result.then(function (user) {
			updateUser(user, org_user);
		}, function () {
//			$log.info('Modal dismissed at: ' + new Date());
		});
	};

	$scope.deleteUserDialog = function (org_user) {
		var modalInstance = $modal.open({
			templateUrl: 'deleteUserDialog.html',
			controller: ModalInstanceCtrl,
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


app.controller('DocsController', function ($scope, AuthenticationService) {
	'use strict';
	$scope.account = AuthenticationService.user;
});

app.controller('DocsListController', function ($scope, $state, $filter, $templateCache, ngTableParams, gettextCatalog, AuthenticationService, DocsService) {
	'use strict';

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


app.controller('DocsUploadController', function ($scope, $upload) {
	'use strict';

	$scope.uploads = [];

	$scope.onFileSelect = function ($files) {

		for (var i = 0; i < $files.length; i++) {
			var up = {
				file: $files[i],
				progress: 0,
				uploading: true
			};
			up.upload = $upload.upload({
				url: 'server/upload/url', //upload.php script, node.js route, or servlet url
				// method: POST or PUT,
				// headers: {'header-key': 'header-value'},
				// withCredentials: true,
//				data: {myObj: $scope.myModelObj},
				file: up.file // or list of files: $files for html5 only
				/* set the file formData name ('Content-Desposition'). Default is 'file' */
				//fileFormDataName: myFile, //or a list of names for multiple files (html5).
				/* customize how data is added to formData. See #40#issuecomment-28612000 for sample code */
				//formDataAppender: function(formData, key, val){}
			}).progress(function (evt) {
				up.progress = parseInt(100.0 * evt.loaded / evt.total);
			}).success(function (data, status, headers, config) {
				up.progress = 100;
				up.success = true;
				up.uploading = false;
			});
			$scope.uploads.push(up);
			//.error(...)
			//.then(success, error, progress);
			//.xhr(function(xhr){xhr.upload.addEventListener(...)})// access and attach any event listener to XMLHttpRequest.
		}

//		/* alternative way of uploading, send the file binary with the file's content-type.
//		 Could be used to upload files to CouchDB, imgur, etc... html5 FileReader is needed.
//		 It could also be used to monitor the progress of a normal http post/put request with large data*/
//		// $scope.upload = $upload.http({...})  see 88#issuecomment-31366487 for sample code.
	};
})
;
