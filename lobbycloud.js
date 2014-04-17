#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var url = require("url");
var path = require("path");

/* require npm modules */
var passportlocal = require("passport-local");
var connectmongo = require("connect-mongo");
var mustache = require("mustache-express");
var filedump = require("filedump");
var passport = require("passport");
var sqlite3 = require("sqlite3");
var mmmagic = require("mmmagic");
var mongojs = require("mongojs");
var express = require("express");
var multer = require("multer");
var moment = require("moment");
var i18n = require("i18n");

/* require config */
var config = require(path.resolve(__dirname, "config.js"), 20);

/* signup database */
var signupdb = new sqlite3.Database(path.resolve(__dirname, config.signupdb));

/* require local modules */
var emails = {
	"verify": {
		urlpath: "/users/verification/",
		emailbodies: {
			en: fs.readFileSync(path.resolve(__dirname, './assets/mails/verification.mustache')).toString(),
			de: fs.readFileSync(path.resolve(__dirname, './assets/mails/verification-de.mustache')).toString()
		},
		body: function () {
			return emails.verify.emailbodies[i18n.getLocale()];
		},
		title: function (task) {
			return i18n.__("[LobbyCloud] Please verify your email '%s'", task.email);
		}
	},
	"reset": {
		urlpath: "/users/reset/",
		emailbodies: {
			en: fs.readFileSync(path.resolve(__dirname, './assets/mails/reset.mustache')).toString(),
			de: fs.readFileSync(path.resolve(__dirname, './assets/mails/reset-de.mustache')).toString()
		},
		body: function () {
			return emails.reset.emailbodies[i18n.getLocale()];
		},
		title: function (task) {
			return i18n.__("[LobbyCloud] Password reset");
		}
	}
};
var invites = new (require("./modules/invites"))(path.resolve(__dirname, config.invitedb));
var mailqueue = new (require("./modules/mailqueue"))(config.mails, config.url, emails);
var users = new (require("./modules/users"))({db: config.db}, mailqueue, i18n);
/* mockup docs */
var mockupdocs = require('./modules/mockdocs')();

/* backendapi */
var backendapi = new (require("./modules/backendapi"))(users, mockupdocs, invites, i18n);

/* configure storage */
var storage = new filedump(path.resolve(__dirname, config.storage));

/* database connection */
var db = mongojs(config.db);

/* mime magic */
var magic = new mmmagic.Magic(mmmagic.MAGIC_MIME_TYPE);

/* configure i18n */
i18n.configure({
	locales: config.locales,
	cookie: 'lang',
	directory: path.resolve(__dirname, "assets/locales")
});

/* configure passport */
passport.serializeUser(function (user, done) {
	done(null, user.id);
});

passport.deserializeUser(function (id, done) {
	users.get(id, function (err, user) {
		if (err)
			done(null, false); //remove session (invalid username, e.g. after id change)
		else
			done(null, user);
	});
});

passport.use(new passportlocal.Strategy(function (username, password, done) {
	process.nextTick(function () {
		users.auth(username, password, function (result, user) {
			if ((!result) || (!user)) {
				done(null, false, { message: 'Invalid Credentials'});
			} else {
				done(null, user);
			}
		});
	});
}));

/* helper function for tags */
var _totags = function (tags) {
	switch (typeof tags) {
		case "string":
			return tags.toLowerCase().replace(/[^a-z\u00df-\u00f6\u00f8-\u00ff #,;˜/]/g, '').split(/\s*[,#;\/\s]+\s*/g).map(function (t) {
				return t.replace(/^\s+|\s+$/g, '');
			}).filter(function (t) {
				return (t !== "");
			});
			break;
		case "object":
			return tags.map(function (t) {
				return t.toLowerCase().replace(/[^a-z\u00df-\u00f6\u00f8-\u00ff ]/g, '').replace(/^\s+|\s+$/g, '');
			}).filter(function (t) {
				return (t !== "");
			});
			break;
		default:
			return [];
			break;
	}
};

/* launch express */
var app = express();

app.configure(function () {

	/* user logger */
	if (config.debug) app.use(express.logger("dev"));

	/* enable compression */
	app.use(express.compress());

	/* parse json and urlencoded post data */
	app.use(express.json());
	app.use(express.urlencoded());

	/* parse multipart post data, used for uploads */
	app.use(multer({
		dest: path.resolve(__dirname, config.upload.tmp),
		limit: {
			fileSize: config.upload.filesize
		},
		rename: function (fieldname, filename) {
			return (filename.replace(/\W+/g, '-').toLowerCase() + '-' + Date.now());
		}
	}));

	/* use mustache as view engine */
	app.engine("mustache", mustache());
	app.set("view engine", "mustache");
	app.set("views", path.resolve(__dirname, "assets/views"));

	/* serve assets */
	app.use('/assets', express.static(path.resolve(__dirname, 'assets')));

	/* backend interface */
	app.use('/central', express.static(__dirname + '/backend/assets'));

	/* internationalization */
	app.use(i18n.init);
	app.use(function (req, res, next) {
		res.locals.__ = function () {
			return function (text, render) {
				return i18n.__.apply(req, arguments);
			};
		};
		next();
	});

	/* upload error handler */
	app.use(function (err, req, res, next) {
		if (req.url === "/api/upload") {
			console.log(err); // FIXME: do something that makes sense
			return res.json(500, {"status": "error"});
		}
		next(err);
	});

	/* user & session handling */
	app.use(express.cookieParser());
	app.use(express.session({ secret: config.passport.secret, store: new (connectmongo(express))({ db: config.db }) }));
	app.use(passport.initialize());
	app.use(passport.session());

});

/* routes */
app.get('/', function (req, res) {
	render(req, res, 'index', {});
});

/* frontend login & logout */
app.get('/login', function (req, res) {
	render(req, res, 'login', {
		"redirect": req.query.redirect
	});
});

app.post('/login', function (req, res, next) {
	passport.authenticate('local', function (err, user, info) {
		if (err) return next(err);
		var redirect = (req.body && req.body.redirect && req.body.redirect.toString().length > 0) ? req.body.redirect.toString() : null;
		if (!user) return res.redirect('/login' + (redirect ? '?redirect=' + redirect : ''));
		req.logIn(user, function (err) {
			if (err) return next(err);
			res.redirect(redirect ? redirect : '/');
		});
	})(req, res, next);
});

app.get('/logout', function (req, res) {
	if (req.user) req.logout();
	res.redirect('/');
});

/* sign up */
app.all('/signup/:invite?', function (req, res) {

	/* logged in users dont need to sign up */
	if (req.user) return res.redirect("/");

	var invite = (req.param("invite") || req.body.invite || req.query.invite || null)

	var _form = function (message) {
		render(req, res, 'signup', {
			"invited": ((invite) ? invites.check(invite) : false),
			"invite": invite,
			"message": message,
			"form": req.body
		});
	};

	if (!req.body || req.body.submit !== "1") return _form();
	if (!req.body.hasOwnProperty("username") || req.body.username === "") return _form(i18n.__("Please pick a username"));
	if (!req.body.hasOwnProperty("password") || req.body.password === "") return _form(i18n.__("Please pick a password"));
	if (req.body["password"] !== req.body["password-verify"]) return _form(i18n.__("Your passwords don't match"));

	users.add({
		id: req.body.username,
		password: req.body.password,
		email: req.body.email,
		name: req.body.name,
		organisation: req.body.organisation,
		description: req.body.description,
		location: req.body.location,
		url: req.body.website
	}, function (err, user) {
		if (err) return _form(err.message);

		/* invalidate invite */
		invites.spend(invite);

		/* send validation email */
		users.send_verify_email(user);

		/* show login form */
		render(req, res, 'login', {});
	});

});

/* beta sign up */
app.post('/beta', function (req, res) {
	signupdb.run("INSERT INTO signup (date, name, email, motivation) VALUES (?, ?, ?, ?);", [
		parseInt((new Date()).getTime() / 1000, 10),
		req.body.name,
		req.body.email,
		req.body.motivation
	], function (err) {
		render(req, res, 'beta', {
			"thankyou": (err === null),
			"error": (err !== null)
		});
	});
});

var sendProfile = function (profile, req, res) {
	render(req, res, 'profile', {
		"is_own": (profile) && (req.user) && (profile.id == req.user.id),
		"profile": ((profile) ? users.prepareClientUser(profile) : null),
		"moment": function () {
			return function (text, render) {
				return moment(new Date(render(text))).format("LLL");
			}
		}
	});
};

/* profile */
app.get('/profile', function (req, res) {
	sendProfile(req.user, req, res);
});

/* user profile */
app.get('/profile/:user', function (req, res) {
	users.get(req.param("user"), function (err, profile) {
		sendProfile(profile, req, res);
	});
});

/* upload */
app.get('/upload', function (req, res) {
	render(req, res, 'upload', {});
});

/**
 API
 **/

/* api index */
app.get('/api/', function (req, res) {
	res.json("not implemented");
});

/* upload */
app.post('/api/upload', function (req, res) {

	if (!req.files.hasOwnProperty("_upload")) return res.json({"status": "error"});

	/* check client mimetype, just to sort out all the crap */
	if (config.upload.mimetypes.indexOf(req.files._upload.mimetype) < 0 && config.upload.fileext.indexOf(req.files._upload.extension) < 0) {
		console.log("error", "not a pdf"); // FIXME: better logging
		return res.json({"status": "error"});
	}

	/* don't take chances with data from the internet and check the mimetype for real */
	magic.detectFile(req.files._upload.path, function (err, _mimetype) {

		if (err) {
			console.log("error", err); // FIXME: better logging
			return res.json({"status": "error"});
		}

		if (config.upload.mimetypes.indexOf(_mimetype) < 0) {
			console.log("error", "not a pdf, for real"); // FIXME: better logging
			return res.json({"status": "error"});
		}

		/* prepare the user */
		/* FIXME: integrate user */
		var _user = false;
		var _ip = (req.headers['x-original-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress);

		/* put file in storage */
		storage.save(req.files._upload.path, req.files._upload.extension, function (err, _filename) {

			if (err) {
				console.log("error", err); // FIXME: better logging
				return res.json({"status": "error"});
			}

			/* put document into database */
			db.collection("documents").save({
				status: 0,
				active: false,
				created: new Date(),
				file: {
					name: req.files._upload.originalname,
					file: _filename,
					mimetype: _mimetype
				},
				source: {
					interface: "api",
					user: _user,
					trace: _ip,
					topic: (req.body.topic || false),
					comment: (req.body.comment || false),
					tags: _totags(req.body.tags)
				}
			}, function (err) {
				if (err) {
					console.log("error", err); // FIXME: better logging
					return res.json({"status": "error"});
				}

				res.json({"status": "success"});
				console.log("upload", _filename);

				// FIXME: trigger processing

			});

		});

	});

});

/* invites testing endpoint REMOVEME */
app.get('/api/test/invites/:create?', function (req, res) {
	if (req.param("create")) invites.create(req.param("create"));
	res.json(invites.all());
});

/* manual validation e-mail request */
app.post('/users/verification/request', function (req, res) {
	// only logged-in users may request a confirmation mail
	if (!req.user) return res.send(401);
	/* send validation email */
	users.send_mail(req.user, 'verify', function (err, result) {
		if (err) res.send(400, err);
		else res.send(result);
	});
});

var render = function (req, res, name, opt) {
	opt._user = req.user;
	opt._url = config.url;
	opt._userrole = {};
	if (req.user) {
		opt._userrole[opt._user.role] = true;
		if (opt._user.role == users.roles.admin) {
			opt._userrole[users.roles.editor] = true;
			opt._userrole[users.roles.user] = true;
		}
		if (opt._user.role == users.roles.editor) {
			opt._userrole[users.roles.user] = true;
		}
	}
	opt._headers = {};
	opt._headers[name] = true;
	res.render(name, opt);
};

/* check validation e-mail key */
app.get('/users/verification/:key', function (req, res) {
	if (!req.param("key")) return res.send(400);
	users.verify_email(req.params.key, function (err, result) {
		render(req, res, 'generic', {
			"err": err,
			"result": result
		});
	});
});

/* passwort reset request */
app.post('/users/reset/request', function (req, res) {
	if ((!req.body) || (!req.body.email)) return res.send(400);
	users.email(req.body.email, function (err, user) {
		if (err || (!user)) return res.send(400);
		users.send_mail(user, 'reset', function (err, result) {
			render(req, res, 'generic', {
				"err": err,
				"result": result
			});
		});
	});
});

var resetPasswordCmd = function (req, res) {
	var _form = function (message) {
		render(req, res, 'reset', {
			"message": message,
			"needs_old_password": needsold,
			"key": req.params.key
		});
	};

	var _reset = function () {
		users.password_reset(req.params.key, req.body.password, function (err, result) {
			render(req, res, 'generic', {
				"err": err,
				"result": result
			});
		});
	};

	var _change = function () {
		if ((!req.body.hasOwnProperty("password-old") || req.body["password-old"] === "")) return _form(i18n.__("Please enter your old password"));
		users.changepass(req.user.id, req.body.password, req.body["password-old"], function (err) {
			if (err) return _form(i18n.__("Old password is invalid"));
			render(req, res, 'generic', {
				"result": i18n.__("Password changed")
			});
		});
	};

	if (!req.param("key")) return res.send(400);
	var needsold = false;
	if (req.params.key == 'password') {
		if (req.user)
			needsold = true;
		else
			return res.send(400);
	}
	if ((!req.body) || (Object.keys(req.body).length == 0)) {
		return _form();
	}
	if (!req.body.hasOwnProperty("password") || req.body.password === "") return _form(i18n.__("Please pick a password"));
	if (req.body["password"] !== req.body["password-verify"]) return _form(i18n.__("Your passwords don't match"));
	if (needsold) {
		_change();
	} else {
		_reset();
	}
};

/* passwort reset site */
app.get('/users/reset/:key', resetPasswordCmd);

/* passwort reset */
app.post('/users/reset/:key', resetPasswordCmd);

/* backend api login */
app.post('/api/backend/login', passport.authenticate('local', {}), function (req, res) {
	res.json(users.prepareClientUser(req.user));
});

/* backend api */
app.post('/api/backend/:cmd', function (req, res) {
	if (!req.user) {
		res.send(401);
	} else {
		backendapi.request(req, res);
	}
});

/* dummy api endpoint */
app.get('/api/whatever', function (req, res) {
	res.json("not implemented");
});

/* default */
app.all('*', function (req, res) {
	res.redirect('/');
});

/* listen */
if (config.listen.hasOwnProperty("socket")) {
	var mask = process.umask(0);
	if (fs.existsSync(config.listen.socket)) {
		console.log("unlinking old socket");
		fs.unlinkSync(config.listen.socket);
	}
	app.__server = app.listen(config.listen.socket, function () {
		if (mask) {
			process.umask(mask);
			mask = null;
		}
		console.log("server listening on socket", config.listen.socket);
	});
} else if (config.listen.hasOwnProperty("host")) {
	app.__server = app.listen(config.listen.port, config.listen.host, function () {
		console.log("server listening on", [config.listen.host, config.listen.port].join(":"));
	});
} else {
	app.__server = app.listen(config.listen.port, function () {
		console.log("server listening on", ["*", config.listen.port].join(":"));
	});
}

/* gracefully shutdown on exit */
process.on("exit", function () {
	db.close(function () {
		console.log("database connection closed.")
	});
	app.__server.close(function () {
		console.log("socket closed.")
	});
});
