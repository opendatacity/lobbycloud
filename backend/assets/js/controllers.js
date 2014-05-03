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

//	$scope.setLang('de_DE', true);

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
			if (doc.thumbs) {
				doc.thumbs.forEach(function (thumb) {
					thumb.file = '../storage/' + thumb.file;
				})
			}
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

app.controller('QueueController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, QueueService) {
	'use strict';

	var reloadTable = function (o, n) {
		if ((!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.alldocs = [];

	$scope.initData = function (data) {
		$scope.alldocs = data;
		//init filter
		var min = null;
		var max = 0;
		data.forEach(function (doc) {
			min = min ? Math.min(doc.uploaded, min) : doc.uploaded;
			max = Math.max(doc.uploaded, max);
			if (doc.thumbs) {
				doc.thumbs.forEach(function (thumb) {
					thumb.file = '../storage/' + thumb.file;
				})
			}
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
				var orderedData = $scope.alldocs;
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
		QueueService.list({},
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

	//check if doc can be accepted
	$scope.canPublish = function (doc) {
		return (
			(doc) &&
			(doc.topic) &&
			(doc.topic.id) &&
			(doc.organisation) &&
			(doc.organisation.id) &&
			(doc.lang)
			);
	};

	$scope.decline = function (doc) {
		doc.$processing = true;
		QueueService.decline({id: doc.id},
			function () {
				$scope.alldocs = $scope.alldocs.filter(function (d) {
					return d.id !== doc.id;
				});
				$scope.tableParams.reload();
			}, function (err) {
				doc.$processing = false;
				alert(err.data);
			}
		);
	};

	$scope.deleteDialog = function (doc) {
		deleteModalDialog($modal, doc, 'deleteQueueItemDialog.html', function (ok) {
			if (!ok) return;
			doc.$processing = true;
			QueueService.delete({id: doc.id},
				function () {
					$scope.alldocs = $scope.alldocs.filter(function (d) {
						return d.id !== doc.id;
					});
					$scope.tableParams.reload();
				}, function (err) {
					doc.$processing = false;
					alert(err.data);
				}
			);
		});
	};


});

app.controller('QueueItemController', function ($scope, $state, $stateParams, $timeout, $modal, AuthenticationService, QueueService, TopicsService, OrganisationsService, LangsService) {
	'use strict';

	//typeahead callbacks
	var dataset = function (prop) {
		return {
			prop: prop,
			displayKey: "label",
			source: function (query, callback) {
				$.get("/api/" + prop + "/suggest", {q: query}, callback, "json");
			}
		};
	};

	$scope.typeaheadOptions = {
		minLength: 3,
		highlight: true
	};
	$scope.typeaheadOptions2 = {
		minLength: 1,
		highlight: true
	};
	$scope.datasetOrganisation = dataset('organisation');
	$scope.datasetTopic = dataset('topic');

	var select = function (sender, object, suggestion, daset) {
		if ($scope.doc && daset)
			$scope.doc[daset.prop] = suggestion;
	};
	$scope.$on("typeahead:selected", select);
	$scope.$on("typeahead:autocompleted", select);
	$scope.$on("typeahead:changed", function (sender, value, daset) {
		if ($scope.doc && daset)
			$scope.doc[daset.prop].id = '';
	});

	//cache all languages
	//TODO: cache global
	$scope.langs = [];

	//typeahead dataset language
	$scope.datasetLangs = {
		prop: 'lang',
		displayKey: "label",
		source: function (query, callback) {
			query = query.toLowerCase();
			callback($scope.langs.filter(function (l) {
				return (query == l.id) || (l.label.toLowerCase().indexOf(query) >= 0);
			}));
		}
	};

	$scope.initData = function (data) {
		//prepare language select
		$scope.langs.forEach(function (l) {
			if (l.id === data.lang) {
				$scope.lang = l.label;
				data.lang = l;
			}
		});
		if ((!data.lang) || (!data.lang.id)) {
			$scope.lang = data.lang;
			data.lang = {label: data.lang};
		}
		//prepare tags edit
		data.tags = data.tags ? data.tags.join(',') : '';
		//expand img urls
		if (data.images) {
			data.images.forEach(function (i) {
				i.file = '../storage/' + i.file;
			})
		}
		$scope.doc = data;
	};

	//load languages & doc
	$scope.load = function () {

		var noneLang = {id: '', label: 'None'};
		var loadLangs = function (cb) {
			LangsService.list({},
				function (data) {
					data.unshift(noneLang);
					$scope.langs = data;
					cb();
				},
				function (err) {
					cb();
				});
		};

		$scope.loading = true;
		loadLangs(function () {
			QueueService.item({id: $stateParams.id},
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
		});
	};

	//update the document
	$scope.update = function (success) {
		$scope.sending = true;
		var doc = $scope.doc;
		var update = {
			tags: (doc.tags || '').split(','),
			comment: doc.comment,
			lang: doc.lang.id
		};
		if (doc.organisation) {
			update.organisation = (doc.organisation.id ? {id: doc.organisation.id} : {new: doc.organisation.label});
		}
		if (doc.topic) {
			update.topic = (doc.topic.id ? {id: doc.topic.id} : {new: doc.topic.label});
		}
		QueueService.update({id: $stateParams.id, doc: update},
			function (data) {
				$scope.initData(data);
				$scope.sending = false;
				if (success) {
					success();
				}
			},
			function (err) {
				$scope.sending = false;
				if (err.status == 401) {
					AuthenticationService.reset();
					$state.go('login');
				} else if (err.status == 400) {
					$scope.errormessage = err.data;
				}
			});
	};

	//accept the document
	$scope.accept = function () {
		if (!$scope.canPublish()) return;
		$scope.update(function () {
			$scope.sending = true;
			QueueService.accept({id: $stateParams.id},
				function () {
					$state.go('queue');
					$scope.sending = false;
				},
				function (err) {
					$scope.sending = false;
					if (err.status == 401) {
						AuthenticationService.reset();
						$state.go('login');
					} else if (err.status == 400) {
						$scope.errormessage = err.data;
					}
				});
		});
	};

	//check if doc can be accepted
	$scope.canPublish = function () {
		return (
			($scope.doc) &&
			($scope.doc.topic) &&
			($scope.doc.topic.id) &&
			($scope.doc.organisation) &&
			($scope.doc.organisation.id) &&
			($scope.doc.lang) &&
			($scope.doc.lang.id)
			);
	};

	$scope.addOrganisationDialog = function () {
		editModalDialog($modal, {
			organisation: {
				create:true,
				name: $scope.doc.organisation.label
			}
		}, 'partials/organisation.html', function (data) {
			if (data) {
				OrganisationsService.add({organisation: data.organisation}, function (org) {
					$scope.doc.organisation = {
						id: org.id,
						label: org.name
					}
				}, function (err) {
					alert(err.data);
				})
			}
		});
	};

	$scope.addTopicDialog = function () {
		editModalDialog($modal, {
			topic: {
				create:true,
				label: $scope.doc.topic.label
			}
		}, 'partials/topic.html', function (data) {
			if (data) {
				TopicsService.add({topic: data.topic}, function (topic) {
					$scope.doc.topic = topic;
				}, function (err) {
					alert(err.data);
				});
			}
		});
	};

	//startup
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
		}, 'partials/topic.html', function (data) {
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
		}, 'partials/organisation.html', function (data) {
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
