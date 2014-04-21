module.exports = function (lobbycloud, i18n) {
	var api = this;

	var validateUser = function (res, err, user, cb) {
		if ((!user) && (!err)) err = 'Unknown Error';
		if (err) return res.send(400, err.toString());
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
			url: user.url,
			description: user.description,
			organisation: user.organisation,
			location: user.location,
			verified: user.verified,
			created: user.created
		}
	};

	var prepareClientOrganisation = function (organisation) {
		if (!organisation) return null;
		return {
			id: organisation.id,
			name: organisation.name,
			fullname: organisation.fullname,
			url: organisation.url,
			logo: organisation.logo,
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
				lobbycloud.mockupdocs.listDocs(function (err, data) {
					res.json(data);
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
		'topics': {
			//returns a json with a topic list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.topics.all(function (err, data) {
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
					if (err) return res.json(400, err.message);
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
					if (err) return res.send(400, err.message);
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
					if (err) return res.send(400, err.message);
					res.json(prepareClientTopic(topic));
				});
			}
		},
		'organisations': {
			//returns a json with a organisation list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.organisations.all(function (err, data) {
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
					if (err) return res.json(400, err.message);
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
					if (err) return res.send(400, err.message);
					res.json(prepareClientOrganisation(organisation));
				});
			}
		},
		'organisations.update': {
			//change organisation properties, returns changed user as json
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.topic)) return res.send(400);
				lobbycloud.organisations.update(req.body.organisation.id, req.body.organisation, function (err, organisation) {
					if (err) return res.send(400, err.message);
					res.json(prepareClientOrganisation(organisation));
				});
			}
		},
		'users': {
			//returns a json with a user list for the ui
			access: lobbycloud.users.roles.editor,
			execute: function (req, res) {
				lobbycloud.users.list(null, null, function (err, users) {
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

};
