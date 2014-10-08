'use strict';

/* Controllers */

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
var listModalDialog = function ($modal, data, cb) {
	var modalInstance = $modal.open({
		templateUrl: 'partials/list.html',
		controller: function ($scope, $modalInstance, data) {

			$scope.data = data;

			$scope.ok = function () {
				$modalInstance.close($scope.data.selected);
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
var okcancelModalDialog = function ($modal, data, cb) {
	var modalInstance = $modal.open({
		templateUrl: 'partials/ask.html',
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
var orderLabels = function (list, prop, asc) {
	list.sort(function (a, b) {
		var as = a[prop].map(function (o) {
			return o.label
		}).join(',');
		var bs = b[prop].map(function (o) {
			return o.label
		}).join(',');
		if (as < bs)
			return asc ? -1 : 1;
		if (as > bs)
			return asc ? 1 : -1;
		return 0;
	});
};

app.controller('BodyController', function ($scope, $state, $window, AuthenticationService, gettextCatalog) {
	'use strict';

	gettextCatalog.debug = false;

	$scope.accessLevels = routingConfig.accessLevels;
	$scope.setLang = function (lng, noreload) {
		$window.moment.lang(lng.substr(0, 2));
		gettextCatalog.currentLanguage = lng;
		if (!noreload)
			$state.go($state.$current, null, {reload: true});
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
	$(window).resize();
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

	$scope.tablecolumns = [
		{
			sortable: 'orig',
			name: 'Filename'
		},
		{
			sortable: 'created',
			name: 'Uploaded'
		},
		{
			sortable: 'topics',
			name: 'Topic'
		},
		{
			sortable: 'organisations',
			name: 'Organisation'
		},
		{
			sortable: 'info.pages',
			name: 'Pages'
		}
	];

	$scope.alldocs = [];

	$scope.quickfilter = '';
	$scope.filterQuick = function () {
		$scope.tableParams.reload();
	};

	$scope.initData = function (data) {
		//init filter
		$scope.alldocs = data;
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
			sorting: {created: 'desc'}
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
				if ($scope.quickfilter.length > 0) {
					orderedData = $filter('filter')(orderedData, function (value) {
						return (value.orig
							+ value.topics.map(function (o) {
								return o.label
							}).join(',')
							+ value.organisations.map(function (o) {
								return o.label
							}).join(',')
							+ value.tags.join(',')
							).indexOf($scope.quickfilter) >= 0;
					});
				}
				var sort = params.sorting();
				if (sort)
					if (sort.organisations) {
						orderLabels(orderedData, 'organisations', sort.organisations === "asc");
					} else if (sort.topics) {
						orderLabels(orderedData, 'topics', sort.topics === "asc");
					} else
						orderedData = $filter('orderBy')(orderedData, params.orderBy());
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

	$scope.depublishDialog = function (doc) {

	};

	//startup
	$scope.load();
	$scope.resize();
});

app.controller('QueueController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, QueueService) {
	'use strict';

	var reloadTable = function (o, n) {
		if ((!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.tablecolumns = [
		{
			sortable: 'orig',
			name: 'Filename'
		},
		{
			sortable: 'created',
			name: 'Uploaded'
		},
		{
			sortable: 'topics',
			name: 'Topic'
		},
		{
			sortable: 'organisations',
			name: 'Organisation'
		},
		{
			sortable: 'info.pages',
			name: 'Pages'
		}
	];

	$scope.alldocs = [];
	$scope.quickfilter = '';
	$scope.filterQuick = function () {
		$scope.tableParams.reload();
	};

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
			sorting: {created: 'desc'}
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
				if ($scope.quickfilter.length > 0) {
					orderedData = $filter('filter')(orderedData, function (value) {
						return (value.orig
							+ value.topics.map(function (o) {
								return o.label
							}).join(',')
							+ value.organisations.map(function (o) {
								return o.label
							}).join(',')
							+ value.tags.join(',')
							).indexOf($scope.quickfilter) >= 0;
					});
				}

				var sort = params.sorting();
				if (sort)
					if (sort.organisations) {
						orderLabels(orderedData, 'organisations', sort.organisations === "asc");
					} else if (sort.topics) {
						orderLabels(orderedData, 'topics', sort.topics === "asc");
					} else
						orderedData = $filter('orderBy')(orderedData, params.orderBy());
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

	//check if doc can be accepted
	$scope.canPublish = function (doc) {
		return (
		(doc) &&
		(doc.topics.length > 0) &&
		(doc.organisations.length > 0) &&
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

	$scope.declineDialog = function (doc) {
		okcancelModalDialog($modal, {
			headline: 'Decline Document',
			question: 'Are you sure to decline ' + doc.orig + '?'
		}, function (ok) {
			if (!ok) return;
			$scope.decline(doc);
		});
	};

	$scope.deleteDialog = function (doc) {
		okcancelModalDialog($modal, {
			headline: 'Delete Document',
			question: 'Are you sure to delete ' + doc.orig + '?'

		}, function (ok) {
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

	//startup
	$scope.load();
	$scope.resize();
});

app.controller('DocController', function ($scope, $state, $stateParams, $timeout, $modal, AuthenticationService, QueueService, DocsService, TopicsService, OrganisationsService, LangsService) {
	'use strict';

	$scope.isQueue = ($state.current.name !== "docitem");

	var service = $scope.isQueue ? QueueService : DocsService;

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

	$scope.typeaheadOptionsOrgs = {
		minLength: 3,
		highlight: true
	};

	$scope.typeaheadOptionsLang = {
		minLength: 1,
		highlight: true
	};
	$scope.datasetOrganisation = dataset('organisation');
	$scope.datasetTopic = dataset('topic');

	$scope.edit = {
		organisation: {
			label: ''
		},
		topic: {
			label: ''
		},
		tag: ''
	};

	var select = function (sender, object, suggestion, daset) {
		if (daset) {
			$scope.edit[daset.prop] = suggestion;
		}
	};

	$scope.canSelectOrganisation = function () {
		return (
		$scope.doc &&
		($scope.edit.organisation.id) &&
		($scope.doc.organisations.filter(function (o) {
			return o.id == $scope.edit.organisation.id
		}).length == 0)
		);
	};

	$scope.selectOrganisation = function () {
		if ($scope.canSelectOrganisation()) {
			$scope.doc.organisations.push({
				id: $scope.edit.organisation.id,
				label: $scope.edit.organisation.label
			});
			$scope.edit.organisation.label = '';
			$scope.edit.organisation.id = '';
		}
	};

	$scope.canSelectTopic = function () {
		return (
		$scope.doc &&
		($scope.edit.topic.id) &&
		($scope.doc.topics.filter(function (o) {
			return o.id == $scope.edit.topic.id
		}).length == 0)
		);
	};

	$scope.canSelectTag = function () {
		return (
		$scope.doc &&
		($scope.edit.tag.length > 0) &&
		($scope.doc.tags.filter(function (o) {
			return o == $scope.edit.tag
		}).length == 0)
		);
	};

	$scope.selectTag = function () {
		if ($scope.canSelectTag()) {
			$scope.doc.tags.push($scope.edit.tag);
			$scope.edit.tag = '';
		}
	};

	$scope.selectTopic = function () {
		if ($scope.canSelectTopic()) {
			$scope.doc.topics.push({
				id: $scope.edit.topic.id,
				label: $scope.edit.topic.label
			});
			$scope.edit.topic.label = '';
			$scope.edit.topic.id = '';
		}
	};

	$scope.$on("typeahead:enter", function (sender, event, value, daset) {
		if (daset.prop == 'organisation') $scope.selectOrganisation();
		if (daset.prop == 'topic') $scope.selectTopic();
	});
	$scope.$on("typeahead:selected", select);
	$scope.$on("typeahead:autocompleted", select);
	$scope.$on("typeahead:changed", function (sender, value, daset) {
		if (daset.prop == 'organisation') {
			$scope.edit[daset.prop].id = '';
		}
	});

	////cache all languages
	////TODO: cache global
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
		//expand img urls
		if (data.images) {
			data.images.forEach(function (i) {
				i.file = '../storage/' + i.file;
			})
		}
		data.tags = data.tags || [];
		data.organisations = data.organisations || [];
		data.topics = data.topics || [];
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
			service.item({id: $stateParams.id},
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
		$scope.selectTag();
		$scope.selectTopic();
		$scope.selectOrganisation();
		$scope.sending = true;
		var doc = $scope.doc;
		var update = {
			tags: doc.tags,
			comment: doc.comment,
			lang: doc.lang.id,
			organisations: doc.organisations,
			topics: doc.topics
		};
		service.update({id: $stateParams.id, doc: update},
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

	//decline the document
	$scope.decline = function () {
		$scope.update(function () {
			$scope.sending = true;
			QueueService.decline({id: $stateParams.id},
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
		//return (
		//($scope.doc) &&
		//(($scope.edit.topic && $scope.edit.topic.id) || ($scope.doc.topics.length > 0)) &&
		//(($scope.edit.organisation && $scope.edit.organisation.id) || ($scope.doc.organisations.length > 0)) &&
		//($scope.doc.lang) &&
		//($scope.doc.lang.id)
		//);
		return true;
	};

	$scope.addOrganisationDialog = function () {
		editModalDialog($modal, {
			organisation: {
				create: true,
				name: $scope.edit.organisation.label
			}
		}, 'partials/organisation.html', function (data) {
			if (data) {
				OrganisationsService.add({organisation: data.organisation}, function (org) {
					$scope.edit.organisation = {
						id: org.id,
						label: org.name
					}
				}, function (err) {
					alert(err.data);
				})
			}
		});
	};

	$scope.selectOrganisationDialog = function () {

		OrganisationsService.index(function (list) {
			list.sort(function (a, b) {
				if (a.label < b.label)
					return -1;
				if (a.label > b.label)
					return 1;
				return 0;
			});
			listModalDialog($modal, {
				list: list,
				prop: 'Organisation',
				selected: $scope.edit.organisation
			}, function (data) {
				if (data) {
					$scope.edit.organisation = data;
				}
			});

		}, function (err) {
			alert(err.data);
		});
	};

	$scope.removeOrganisation = function (o) {
		$scope.doc.organisations = $scope.doc.organisations.filter(function (eo) {
			return eo !== o;
		})
	};

	$scope.removeTopic = function (o) {
		$scope.doc.topics = $scope.doc.topics.filter(function (eo) {
			return eo !== o;
		})
	};

	$scope.removeTag = function (o) {
		$scope.doc.tags = $scope.doc.tags.filter(function (eo) {
			return eo !== o;
		})
	};

	$scope.selectTopicDialog = function () {

		TopicsService.index(function (list) {
			list.sort(function (a, b) {
				if (a.label < b.label)
					return -1;
				if (a.label > b.label)
					return 1;
				return 0;
			});
			listModalDialog($modal, {
				list: list,
				prop: 'Topics',
				selected: $scope.edit.topic
			}, function (data) {
				if (data) {
					$scope.edit.topic = data;
				}
			});

		}, function (err) {
			alert(err.data);
		});
	};

	$scope.createTopicDialog = function () {
		editModalDialog($modal, {
			topic: {
				create: true,
				label: $scope.edit.topic.label
			}
		}, 'partials/topic.html', function (data) {
			if (data) {
				TopicsService.add({topic: data.topic}, function (topic) {
					$scope.edit.topic = topic;
				}, function (err) {
					alert(err.data);
				});
			}
		});
	};

	$scope.selectLanguageDialog = function () {

		listModalDialog($modal, {
			list: $scope.langs,
			prop: 'Language',
			selected: $scope.doc.lang
		}, function (data) {
			if (data) {
				$scope.doc.lang = data;
				$scope.lang = data.label;
			}
		});

	};

	//startup
	$scope.load();
	$scope.resize();

});

app.controller('DocsUploadController', function ($scope) {
	'use strict';
	//we use the components from the front end
});

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
		}, 'partials/user.html', function (data) {
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
		okcancelModalDialog($modal, {
			headline: 'Delete User',
			question: 'Are you sure to delete ' + user.id + '?'
		}, function (ok) {
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

	//startup
	$scope.load();
	$scope.resize();
});

app.controller('TopicsController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, TopicsService) {
	'use strict';

	var reloadTable = function (o, n) {
		if (($scope) && (!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.tablecolumns = [
		{
			sortable: 'label',
			name: 'Label'
		},
		{
			sortable: 'subject',
			name: 'Subject'
		},
		{
			sortable: 'description',
			name: 'Description'
		},
		{
			sortable: 'created',
			name: 'Created'
		}
	];

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
		okcancelModalDialog($modal, {
			headline: 'Delete Topic',
			question: 'Are you sure to delete ' + topic.label + '?'
		}, function (ok) {
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

	//startup
	$scope.load();
	$scope.resize();

});

app.controller('OrganisationsController', function ($scope, $state, $modal, $filter, ngTableParams, AuthenticationService, OrganisationsService) {
	'use strict';

	var reloadTable = function (o, n) {
		if (($scope) && (!$scope.loading) && ($scope.tableParams) && (n !== undefined) && (o !== undefined) && (o !== n)) {
			$scope.tableParams.reload();
		}
	};

	$scope.tablecolumns = [
		{
			sortable: 'name',
			name: 'Name'
		},
		{
			sortable: 'fullname',
			name: 'Full name'
		},
		{
			sortable: 'description',
			name: 'Description'
		},
		{
			sortable: 'created',
			name: 'Created'
		}
	];

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
			sorting: {name: 'asc'}
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
		okcancelModalDialog($modal, {
			headline: 'Delete Organisation',
			question: 'Are you sure to delete ' + organisation.name + '?'
		}, function (ok) {
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

	//startup
	$scope.load();
	$scope.resize();

});
