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

/* get local modules */
var lobbycloud = require("./modules/lobbycloud");

/* require config */
var config = require(path.resolve(__dirname, "config.js"), 20);

/* get an instance of lobbycloud */
var l = new lobbycloud(config);

/* signup database */
var signupdb = new sqlite3.Database(path.resolve(__dirname, config.signupdb));

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
	l.users.get(id, function (err, user) {
		if (err)
			done(null, false); //remove session (invalid username, e.g. after id change)
		else
			done(null, user);
	});
});

passport.use(new passportlocal.Strategy(function (username, password, done) {
	process.nextTick(function () {
		l.users.auth(username, password, function (result, user) {
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

app.configure(function() {

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
	var _mustache = mustache();
	if (config.debug) _mustache.cache = false;
	app.engine("mustache", _mustache);
	app.set("view engine", "mustache");
	app.set("views", path.resolve(__dirname, "assets/views"));

	/* serve assets */
	app.use('/assets', express.static(path.resolve(__dirname, 'assets')));

	/* serve stored files */
	app.use('/storage', express.static(path.resolve(__dirname, config.storage)));

	/* backend interface */
	app.use('/central', express.static(__dirname + '/backend/assets'));

	/* user logger */
	if (config.debug) app.use(express.logger("dev"));

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
			// FIXME: check redirect target
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
			"invited": ((invite) ? l.invites.check(invite) : false),
			"invite": invite,
			"message": message,
			"form": req.body
		});
	};

	if (!req.body || req.body.submit !== "1") return _form();
	if (!req.body.hasOwnProperty("username") || req.body.username === "") return _form(i18n.__("Please pick a username"));
	if (!req.body.hasOwnProperty("password") || req.body.password === "") return _form(i18n.__("Please pick a password"));
	if (req.body["password"] !== req.body["password-verify"]) return _form(i18n.__("Your passwords don't match"));

	l.users.add({
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
		l.invites.spend(invite);

		/* send validation email */
		l.users.send_mail(user, 'verify', function () {
			render(req, res, 'login', {});
		});
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

var send404 = function(req, res) {
	res.status(404);
	render(req, res, '404', {});
}

var sendProfile = function (profile, req, res) {
	render(req, res, 'profile', {
		"is_own": (profile) && (req.user) && (profile.id == req.user.id),
		"profile": profile,
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
	l.users.get(req.param("user"), function (err, profile) {
		if (!profile) return send404(req, res);
		sendProfile(profile, req, res);
	});
});

/* browse documents */
app.get('/imprint', function (req, res) {
	render(req, res, 'imprint', {});
});

/* engage */
app.get('/engage', function (req, res) {
	render(req, res, 'engage', {});
});

/* browse documents */
app.get('/about', function (req, res) {
	render(req, res, 'about', {});
});

/* browse documents */
app.get('/documents', function (req, res) {
	render(req, res, 'documents', {});
});

/* document */
app.get('/documents/:id', function (req, res) {
	render(req, res, 'documents', {});
});

/* browse topics */
app.get('/topics', function (req, res) {
	l.topics.all(function(err, topics){
		render(req, res, 'topics', {
			topics: {
				list: topics //FIXME: limits, etc
			}
		});
	})
});

/* topic */
app.get('/topics/:id', function (req, res) {
	render(req, res, 'topics', {});
});

/* browse organisations */
app.get('/organistions', function (req, res) {
	render(req, res, 'organistions', {});
});

/* organisation */
app.get('/organistions/:id', function (req, res) {
	render(req, res, 'organistions', {});
});

// if (!user) return 


/* upload */
app.get('/upload', function (req, res) {
	if (!req.user) return res.redirect('/login?redirect=/upload');
	l.queue.user(req.user.id, function(err, queue){
		queue.map(function(item){
			item["stage-"+item.stage] = true;
			item["cancelable"] = (item.stage < 3);
			item.created_formatted = moment(item.created).lang(req.locale||"en").format("YY-MM-DD HH:mm:ss");
			item.created_relative = moment(item.created).lang(req.locale||"en").fromNow();
			item.updated_relative = moment(item.created).lang(req.locale||"en").fromNow();
			if (item.stage === 1 || item.stage >= 3) item.processed = true;
		});
		render(req, res, 'upload', {
			queue: queue
		});
	});
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

		/* put file in storage */
		storage.save(req.files._upload.path, req.files._upload.extension, function (err, _filename) {

			if (err) {
				console.log("error", err); // FIXME: better logging
				return res.json({"status": "error"});
			}

			console.log("[new upload]", _filename);
			
			l.queue.add({
				file: _filename,
				orig: path.basename(req.files._upload.path),
				topic: (req.body.topic || null),
				organisation: (req.body.organisation || null),
				tags: (req.body.tags || null),
				comment: (req.body.comment || null),
				source: "upload,"+(req.headers['x-original-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress),
				user: req.user.id
			}, function(err, data){
								
				console.log("[upload queued]", _filename, data.id);

				if (err) {
					console.log("error", err); // FIXME: better logging
					return res.json({"status": "error"});
				}

				res.json({"status": "success"});
				
			});

		});

	});

});

/* invites testing endpoint REMOVEME */
app.get('/api/test/invites/:create?', function (req, res) {
	if (req.param("create")) l.invites.create(req.param("create"));
	res.json(l.invites.all());
});

/* manual validation e-mail request */
app.post('/users/verification/request', function (req, res) {
	// only logged-in users may request a confirmation mail
	if (!req.user) return res.send(401);
	/* send validation email */
	l.users.send_mail(req.user, 'verify', function (err, result) {
		if (err) res.send(400, err);
		else res.send(result);
	});
});

var render = function (req, res, name, opt) {
	var opt = (opt || {});
	opt._user = req.user;
	opt._url = config.url;
	opt._userrole = {};
	if (req.user) {
		opt._userrole[opt._user.role] = true;
		if (opt._user.role == l.users.roles.admin) {
			opt._userrole[l.users.roles.editor] = true;
			opt._userrole[l.users.roles.user] = true;
		}
		if (opt._user.role == l.users.roles.editor) {
			opt._userrole[l.users.roles.user] = true;
		}
	}
	opt._headers = {};
	opt._headers[name] = true;
	res.render(name, opt);
};

/* check validation e-mail key */
app.get('/users/verification/:key', function (req, res) {
	if (!req.param("key")) return res.send(400);
	l.users.verify_email(req.params.key, function (err, result) {
		render(req, res, 'generic', {
			"err": err,
			"result": result
		});
	});
});

/* passwort reset request */
app.post('/users/reset/request', function (req, res) {
	if ((!req.body) || (!req.body.email)) return res.send(400);
	l.users.email(req.body.email, function (err, user) {
		if (err || (!user)) return res.send(400);
		l.users.send_mail(user, 'reset', function (err, result) {
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
		l.users.password_reset(req.params.key, req.body.password, function (err, result) {
			render(req, res, 'generic', {
				"err": err,
				"result": result
			});
		});
	};

	var _change = function () {
		if ((!req.body.hasOwnProperty("password-old") || req.body["password-old"] === "")) return _form(i18n.__("Please enter your old password"));
		l.users.changepass(req.user.id, req.body.password, req.body["password-old"], function (err) {
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
	l.backendapi.user(req,res);
});

/* backend api */
app.post('/api/backend/:cmd', function (req, res) {
	if (!req.user) {
		res.send(401);
	} else {
		l.backendapi.request(req, res);
	}
});

/* dummy api endpoint */
app.get('/api/whatever', function (req, res) {
	res.json("not implemented");
});

/* topic suggestions */
app.all('/api/topic/suggest', function (req, res) {
	
	// FIXME: let this be done by someone who truly understands elasticsearch
	
	var q = (req.body.q || req.query.q || null).replace(/\*/g,'');
	
	if (q === null || q === "") return res.json([]);

	/* first just the query */
	l.topics.find(q, function(err, result){

		if (err) return res.json([]);
	
		if (result.length > 0) return res.json(result.map(function(r){
			return { id: r.id, label: r.label };
		}));
		
		/* then word beginning wildcard i guess */
		l.topics.find(q+"*", function(err, result){

			if (err) return res.json([]);
	
			if (result.length > 0) return res.json(result.map(function(r){
				return { id: r.id, label: r.label };
			}));
		
			/* finally wildcard yay! */
			l.topics.find("*"+q+"*", function(err, result){
				if (err) return res.json([]);
				if (result.length === 0) return res.json([]);

				return res.json(result.map(function(r){
					return { id: r.id, label: r.label };
				}));

			});

		});
				
	});
	
});

/* topic suggestions */
app.all('/api/organisation/suggest', function (req, res) {
	
	// FIXME: let this be done by someone who truly understands elasticsearch
	
	var q = (req.body.q || req.query.q || null).replace(/\*/g,'');
	
	if (q === null || q === "") return res.json([]);

	/* first just the query */
	l.organisations.find(q, function(err, result){

		if (err) return res.json([]);
	
		if (result.length > 0) return res.json(result.map(function(r){
			return { id: r.id, label: [r.name, r.fullname].join(" - ") };
		}));
		
		/* then word beginning wildcard i guess */
		l.organisations.find(q+"*", function(err, result){

			if (err) return res.json([]);
	
			if (result.length > 0) return res.json(result.map(function(r){
				return { id: r.id, label: [r.name, r.fullname].join(" - ") };
			}));
		
			/* finally wildcard yay! */
			l.organisations.find("*"+q+"*", function(err, result){
				if (err) return res.json([]);
				if (result.length === 0) return res.json([]);

				return res.json(result.map(function(r){
					return { id: r.id, label: [r.name, r.fullname].join(" - ") };
				}));

			});

		});
				
	});
	
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
