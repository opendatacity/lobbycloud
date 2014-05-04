module.exports = function (lobbycloud, i18n) {
	var api = this;

	var validateUser = function (res, err, user, cb) {
		if ((!user) && (!err)) err = 'Unknown Error';
		if (err) return res.send(400, err.message || err);
		cb();
	};

	/* strips down user obj to values needed by ui */
	var prepareClientUser = function (user) {
		if (!user) return null;
		return {
			id: user.id,
			name: user.name,
			role: user.role,
			email: user.email,
			gravatar: user.gravatar,
			url: user.url || null, //convert false to null, because angular displays value of boolean instead of nothing in ui, and: input fields validation fails, because val is set
			description: user.description,
			organisation: user.organisation,
			location: user.location,
			verified: user.verified,
			created: new Date(user.created).valueOf()
		}
	};

	/* strips down organisation obj to values needed by ui */
	var prepareClientOrganisation = function (organisation) {
		if (!organisation) return null;
		return {
			id: organisation.id,
			name: organisation.name,
			fullname: organisation.fullname,
			url: organisation.url || null, //see desc above
			logo: organisation.logo || null, //see desc above
			description: organisation.description,
			created: new Date(organisation.created).valueOf()
		}
	};

	/* strips down user obj to values needed by ui */
	var prepareClientTopic = function (topic) {
		if (!topic) return null;
		return {
			id: topic.id,
			label: topic.label,
			subject: topic.subject,
			description: topic.description,
			created: new Date(topic.created).valueOf()
		}
	};

	var fillOrganisation = function (item, cb) {
		if (item.organisation && item.organisation.id) {
			lobbycloud.organisations.get(item.organisation.id, function (err, org) {
				if ((!err) && org) {
					item.organisation.id = org.id;
					item.organisation.label = org.name;
				}
				cb();
			});
		} else {
			if ((item.organisation) && (item.organisation.new)) {
				item.organisation = {
					label: item.organisation.new
				};
			}
			cb();
		}
	};

	var fillTopic = function (item, cb) {
		if (item.topic && item.topic.id) {
			lobbycloud.topics.get(item.topic.id, function (err, topic) {
				if ((!err) && topic) {
					item.topic.id = topic.id;
					item.topic.label = topic.label;
				}
				cb();
			});
		} else {
			if ((item.topic) && (item.topic.new)) {
				item.topic = {
					label: item.topic.new
				};
			}
			cb();
		}
	};

	/* strips down queue obj to values needed by ui */
	var prepareClientQueue = function (item, full, callback) {

		if (!item) return callback(null);
		var qitem = {
			id: item.id,
			user: item.user,
			orig: item.orig,
			lang: item.lang,
			stage: item.stage,
			topic: item.topic,
			organisation: item.organisation,
			comment: item.comment,
			tags: item.tags,
			created: new Date(item.created).valueOf(),
			info: (item.data ? item.data.info : null),
			thumbs: (item.data ? item.data.thumbs : null),
			images: (full && item.data ? item.data.images : null),
			text: (full && item.data ? item.data.text : null)
		};

		fillTopic(qitem, function () {
			fillOrganisation(qitem, function () {
				callback(qitem);
			})
		});
	};


	/* strips down document obj to values needed by ui */
	var prepareClientDoc = function (doc, full, callback) {
		if (!doc) return callback(null);
		var d = {
			id: doc.id,
			user: doc.user,
			created: new Date(doc.created).valueOf(),
			updated: new Date(doc.updated).valueOf(),
			orig: doc.orig,
			lang: doc.lang,
			tags: doc.tags,
			topic: {id: doc.topic},
			organisation: {id: doc.organisation},
			stats: doc.stats,
			indexed: doc.indexed,
			stage: doc.stage,
			thumb: doc.thumb,
			info: (doc.data ? doc.data.info : null),
			thumbs: (doc.data ? doc.data.thumbs : null),
			images: (full && doc.data ? doc.data.images : null),
			text: (full && doc.data ? doc.data.text : null),
			changesets: (full && doc.changesets.length > 0 ? doc.changesets : null),
			comments: (full && doc.comments.length > 0 ? doc.comments : null),
			notes: (full && doc.notes.length > 0 ? doc.notes : null)
		};

		fillTopic(d, function () {
			fillOrganisation(d, function () {
				callback(d);
			})
		});
	};

	api.features = {
		'logout': {
			//logout
			access: lobbycloud.users.roles.user,
			execute: function (req, res) {
				if (req.user) {
					req.logout();
				}
				res.send(200);
			}
		},
		'langs': {
			//langs
			access: lobbycloud.users.roles.user,
			execute: function (req, res) {
				res.json(lobbycloud.lang.all());
			}
		},
		'invite.create': {
			//returns a string with a new invite code
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				res.json({invite: lobbycloud.invites.create(1)[0]});
			}
		},
		'docs': {
			//returns a json with documents for the ui list
			access: lobbycloud.users.roles.user,
			execute: function (req, res) {
				lobbycloud.documents.all(function (err, data) {
					if (err) return res.send(400, err.message || err);
					var result = [];
					var prepare = function (index) {
						if (index >= data.length) {
							return res.json(result);
						}
						prepareClientDoc(data[index], false, function (d) {
							result.push(d);
							prepare(index + 1);
						});
					};
					prepare(0);
				});
			}
		},
		'user': {
			//returns the current user as json
			access: lobbycloud.users.roles.user,
			execute: function (req, res) {
				res.json(prepareClientUser(req.user));
			}
		},
		'topics.index': {
			//returns a json with a very simple topics list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.topics.all(function (err, data) {
					if (err) return res.send(400, err.message || err);
					res.json(data.map(function (t) {
						return {id: t.id, label: t.label};
					}));
				});
			}
		},
		'topics.list': {
			//returns a json with a topic list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.topics.all(function (err, data) {
					if (err) return res.send(400, err.message || err);
					res.json(data.map(function (t) {
						return prepareClientTopic(t);
					}));
				});
			}
		},
		'topics.delete': {
			//delete topic, returns nothing if successfull
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.topics.delete(req.body.id, function (err) {
					if (err) return res.send(400, err.message || err);
					res.send(200);
				});
			}
		},
		'topics.add': {
			//new topic, returns new topic as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.topic)) return res.send(400);
				lobbycloud.topics.add(req.body.topic, function (err, topic) {
					if (err) return res.send(400, err.message || err);
					res.json(prepareClientTopic(topic));
				});
			}
		},
		'topics.update': {
			//change topic properties, returns changed topic as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.topic)) return res.send(400);
				lobbycloud.topics.update(req.body.topic.id, req.body.topic, function (err, topic) {
					if (err) return res.send(400, err.message || err);
					res.json(prepareClientTopic(topic));
				});
			}
		},
		'queue.list': {
			//returns a json with a organisation list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.queue.all(function (err, data) {
					var result = [];
					var prepare = function (index) {
						if (index >= data.length) {
							return res.json(result);
						}
						if (data[index].stage !== 1)
							return prepare(index + 1);
						prepareClientQueue(data[index], false, function (t) {
							result.push(t);
							prepare(index + 1);
						});
					};
					prepare(0);
				});
			}
		},
		'queue.get': {
			//returns a json with a queue item for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.queue.get(req.body.id, function (err, data) {
						if (err) return res.send(400, err.message || err);
						prepareClientQueue(data, true, function (qitem) {
							res.json(qitem);
						});
					}
				);
			}
		},
		'queue.update': {
			//updates a queue item & returns json with the changed
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id) || (!req.body.doc)) return res.send(400);
				//TODO: update method awaits id & label mixed, better use subobject as delivered
				req.body.doc.topic = req.body.doc.topic ? (req.body.doc.topic.id || req.body.doc.topic.new) : null;
				req.body.doc.organisation = req.body.doc.organisation ? (req.body.doc.organisation.id || req.body.doc.organisation.new) : null;
				lobbycloud.queue.update(req.body.id, req.body.doc, function (err, data) {
						if (err) return res.send(400, err.message || err);
						prepareClientQueue(data, true, function (qitem) {
							res.json(qitem);
						});
					}
				);
			}
		},
		'queue.accept': {
			//updates a queue item & returns nothing if successfull
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.queue.accept(req.body.id, function (err, data) {
						if (err) return res.send(400, err.message || err);
						res.send(200);
					}
				);
			}
		},
		'queue.decline': {
			//declines a queue item & returns nothing if successfull
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.queue.decline(req.body.id, function (err, data) {
						console.log(err);
						if (err) return res.send(400, err.message || err);
						res.send(200);
					}
				);
			}
		},
		'queue.delete': {
			//deletes a queue item
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.queue.delete(req.body.id, function (err, data) {
						if (err) return res.send(400, err.message || err);
						res.send(200);
					}
				);
			}
		},
		'organisations.index': {
			//returns a json with a very simple organisation list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.organisations.all(function (err, data) {
					if (err) return res.send(400, err.message || err);
					res.json(data.map(function (t) {
						return {id: t.id, label: t.name + ' - ' + t.fullname};
					}));
				});
			}
		},
		'organisations.list': {
			//returns a json with a organisation list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.organisations.all(function (err, data) {
					if (err) return res.send(400, err.message || err);
					res.json(data.map(function (t) {
						return prepareClientOrganisation(t);
					}));
				});
			}
		},
		'organisations.delete': {
			//delete organisation, returns nothing if successfull
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.organisations.delete(req.body.id, function (err) {
					if (err) return res.send(400, err.message || err);
					res.send(200);
				});
			}
		},
		'organisations.add': {
			//new organisation, returns new organisation as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.organisation)) return res.send(400);
				lobbycloud.organisations.add(req.body.organisation, function (err, organisation) {
					if (err) return res.send(400, err.message || err);
					res.json(prepareClientOrganisation(organisation));
				});
			}
		},
		'organisations.update': {
			//change organisation properties, returns changed user as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.organisation)) return res.send(400);
				lobbycloud.organisations.update(req.body.organisation.id, req.body.organisation, function (err, organisation) {
					if (err) return res.send(400, err.message || err);
					res.json(prepareClientOrganisation(organisation));
				});
			}
		},
		'users.list': {
			//returns a json with a user list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.users.list(null, null, function (err, users) {
					if (err) return res.send(400, err.message || err);
					var users = users.map(function (u) {
						return prepareClientUser(u);
					});
					if (req.user.role !== lobbycloud.users.roles.admin) {
						// only admins may display & edit other admins
						users = users.filter(function (u) {
							return u.role !== lobbycloud.users.role.admin;
						});
					}
					res.json(users);
				});
			}
		},
		'users.delete': {
			//delete user, returns nothing if successfull
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id)) return res.send(400);
				lobbycloud.users.get(req.body.id, function (err, user) {
					validateUser(res, err, user, function () {
						//only admins may delete admins
						if ((user.role === lobbycloud.users.roles.admin) && (req.user.role !== lobbycloud.users.roles.admin))
							return res.send(401);
						lobbycloud.users.delete(user.id, function (err) {
							if (err) return res.json(400, err.message);
							res.send(200);
						});
					});
				});
			}
		},
		'users.add': {
			//new user, returns new user as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.user)) return res.send(400);

				//only admins may add admins
				if ((req.body.user.role === lobbycloud.users.roles.admin) && (req.user.role !== lobbycloud.users.roles.admin))
					return res.send(401);

				lobbycloud.users.add(req.body.user, function (err, user) {
					validateUser(res, err, user, function () {
						res.json(prepareClientUser(user));
					});
				});
			}
		},
		'users.update': {
			//change user properties, returns changed user as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id) || (!req.body.user)) return res.send(400);
				lobbycloud.users.get(req.body.id, function (err, user) {
					validateUser(res, err, user, function () {

						//only admins may edit admins
						if ((req.body.user.role === lobbycloud.users.roles.admin) && (req.user.role !== lobbycloud.users.roles.admin))
							return res.send(401);

						lobbycloud.users.update(user.id, req.body.user, req.user.role, function (err, user) {
							validateUser(res, err, user, function () {
								res.json(prepareClientUser(user));
							});
						});
					});
				});
			}
		}
	};

	api.user = function (req, res) {
		res.json(prepareClientUser(req.user));
	};

	api.request = function (req, res) {
		var cmd = api.features[req.params.cmd];
		// check unknown command
		if (!cmd) return res.send(404);
		// check access level
		if (req.user.role === lobbycloud.users.roles.admin) {
			//admins go everywhere
		} else if (req.user.role === lobbycloud.users.roles.editor) {
			if (cmd.access === lobbycloud.users.roles.admin) return res.send(401);
		} else if (req.user.role === lobbycloud.users.roles.user) {
			if (cmd.access !== lobbycloud.users.roles.user) return res.send(401);
		} else {
			return res.send(401);
		}
		// wheeeeee
		cmd.execute(req, res);
	};

	return api;

}
;
