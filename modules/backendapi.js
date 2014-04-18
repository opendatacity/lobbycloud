module.exports = function (users, mockupdocs, invites, i18n) {
	var api = this;

	var validateUser = function (err, user, cb) {
		if ((!user) && (!err)) err = 'Unknown Error';
		if (err || (!user)) return res.send(400, err.toString()); // FIXME: there is no var res at this point
		cb();
	};

	api.features = {
		'logout': {
			//logout
			access: users.roles.user,
			execute: function (req, res) {
				if (req.user) {
					req.logout();
				}
				res.send(200);
			}
		},
		'invite.create': {
			//returns a string with a new invite code
			access: users.roles.editor,
			execute: function (req, res) {
				res.json({invite: invites.create(1)[0]});
			}
		},
		'docs': {
			//returns a json with documents for the ui list
			access: users.roles.user,
			execute: function (req, res) {
				mockupdocs.listDocs(function (err, data) {
					res.json(data);
				});
			}
		},
		'user': {
			//returns the current user as json
			access: users.roles.user,
			execute: function (req, res) {
				res.json(users.prepareClientUser(req.user));
			}
		},
		'users': {
			//returns a json with user for the ui list
			access: users.roles.editor,
			execute: function (req, res) {
				users.list(null, null, function (err, data) {
					var data = data.map(function (user) {
						return users.prepareClientUser(user);
					});
					if (req.user.role !== users.roles.admin) {
						// only admins may display & edit other admins
						data = data.filter(function (user) {
							return user.role !== users.role.admin;
						});
					}
					res.json(data);
				});
			}
		},
		'users.delete': {
			//delete user, returns nothing if successfull
			access: users.roles.editor,
			execute: function (req, res) {
				users.get(req.body.id, function (err, user) {
					validateUser(err, user, function () {

						//only admins may delete admins
						if ((user.role === users.roles.admin) && (req.user.role !== users.roles.admin))
							return res.send(401);

						users.delete(user.id, function (err) {
							if (err) return res.json(400, err.message);
							res.json(200);
						});
					});
				});
			}
		},
		'users.add': {
			//new user, returns new user as json
			access: users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.user)) return res.send(400);

				//only admins may add admins
				if ((req.body.user.role === users.roles.admin) && (req.user.role !== users.roles.admin))
					return res.send(401);

				users.add(req.body.user, function (err, user) {
					validateUser(err, user, function () {
						res.json(users.prepareClientUser(user));
					});
				});
			}
		},
		'users.update': {
			//change user properties, returns changed user as json
			access: users.roles.editor,
			execute: function (req, res) {
				if ((!req.body) || (!req.body.id) || (!req.body.user)) return res.send(400);
				users.get(req.body.id, function (err, user) {
					validateUser(err, user, function () {

						//only admins may edit admins
						if ((req.body.user.role === users.roles.admin) && (req.user.role !== users.roles.admin))
							return res.send(401);

						users.update(user.id, req.body.user, req.user.role, function (err, user) {
							validateUser(err, user, function () {
								res.json(users.prepareClientUser(user));
							});
						});
					});
				});
			}
		}
	};

	api.request = function (req, res) {
		var cmd = api.features[req.params.cmd];
		// check unknown command
		if (!cmd) return res.send(404);
		// check access level
		if (req.user.role === users.roles.admin) {
			//admins go everywhere
		} else if (req.user.role === users.roles.editor) {
			if (cmd.access === users.roles.admin) return res.send(401);
		} else if (req.user.role === users.roles.user) {
			if (cmd.access !== users.roles.user) return res.send(401);
		} else {
			return res.send(401);
		}
		// wheeeeee
		cmd.execute(req, res);
	};

	return api;

};
