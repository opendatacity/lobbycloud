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
var filesize = require("filesize");
var passport = require("passport");
var sqlite3 = require("sqlite3");
var mmmagic = require("mmmagic");
var mongojs = require("mongojs");
var express = require("express");
var multer = require("multer");
var clone = require("clone");
var moment = require("moment");
var i18n = require("i18n");

var utils = require("./modules/utils");

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
				done(null, false, {message: 'Invalid Credentials'});
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

/* http helpers */
var send404 = function (req, res) {
	if (config.debug) console.error("[404]", req.method, req.originalUrl);
	res.status(404);
	render(req, res, '404', {});
};

var send500 = function (req, res, err) {
	if (err) console.error("[500]", err);
	res.status(500);
	render(req, res, '500', {});
};

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

var render = function (req, res, name, opt) {
	var opt = (opt || {});
	opt._user = req.user;
	opt._url = config.url;
	opt._storage = config.storage;
	opt._userrole = {};
	if (req.user) {

		/* FIXME: this is ambiguous */
		opt._user._is_admin = (req.user.role === "admin");
		opt._user._is_editor = (req.user.role === "admin" || req.user.role === "editor");

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

/* launch express */
var app = express();

app.configure(function () {

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
		if (req.url === "/api/upload" || req.url === "/api/contribute") {
			console.log(err); // FIXME: do something that makes sense
			return res.json(500, {"status": "error"});
		}
		next(err);
	});

	/* user & session handling */
	app.use(express.cookieParser());
	app.use(express.session({secret: config.passport.secret, store: new (connectmongo(express))({db: config.db, auto_reconnect: true})}));
	app.use(passport.initialize());
	app.use(passport.session());

	/* auth by apikey */
	app.use(function (req, res, next) {
		if (req.user) return next();
		if (req.hasOwnProperty("body") && req.body.hasOwnProperty("apikey")) {
			var _apikey = req.body.apikey;
		} else if (req.hasOwnProperty("params") && req.params.hasOwnProperty("apikey")) {
			var _apikey = req.params.apikey;
		} else if (req.headers.hasOwnProperty("x-apikey")) {
			var _apikey = req.headers["x-apikey"];
		} else {
			return next();
		}
		l.users.apikey(_apikey, function (err, user) {
			if (err) return next();
			if (user) req.user = user;
			next();
		});
	});
});

/* routes */
app.get('/', function (req, res) {
	/* get topics */
	l.topics.latest(3, function (err, topics) {
		l.documents.latest(15, function (err, docs) {
			if (err) return send500(req, res, err);
			render(req, res, 'index', {
				topics: topics,
				documents: docs
			});
		});
	});
});

/* redirects */
app.get('/research', function (req, res) {
	res.redirect("/search");
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

/* contributions */
app.get('/contribute/:id?', function (req, res) {
	if (!req.user) return render(req, res, 'contribute', {});
	l.queue.user(req.user.id, function (err, queue) {

		queue = queue.filter(function (item) {
			return ((item.stage !== l.stages.CANCELLED) && (item.stage !== l.stages.ACCEPTED));
		});

		/* check for empty queue */
		if (queue.length === 0) return render(req, res, 'contribute', {});

		queue.map(function (item) {
			item["stage-" + item.stage] = true;
			item["cancelable"] = l.stages.canCancel(item.stage);
			item["editable"] = l.stages.canUpdate(item.stage);
			item["acceptable"] = l.stages.canAccept(item.stage);
			item.created_unix = moment(item.created).unix();
			item.created_formatted = moment(item.created).lang(req.locale || "en").format("YY-MM-DD HH:mm");
			item.created_relative = moment(item.created).lang(req.locale || "en").fromNow();
			item.updated_relative = moment(item.updated).lang(req.locale || "en").fromNow();
			item.processed = l.stages.isProcessed(item.stage);
		});

		/* show queue index */
		if (!req.param("id")) return render(req, res, 'contribute', {queue: {items: queue}});

		l.queue.check(req.param("id"), function (err, exists, id) {
			if (err) return send500(req, res, err);
			if (!exists) return send404(req, res);
			l.queue.get(id, function (err, doc) {
				if (err) return send500(req, res, err);
				/* check privileges */
				if (doc.user.role === "user" && doc.user !== req.user.id) return send500(req, res, new Error("access violation: user " + req.user.id + " (" + req.user.role + ") tried to access queue item " + id));
				if (!l.stages.canUpdate(doc.stage)) return send500(req, res, new Error("stage violation: document " + id + " stage " + doc.stage));

				/* tags */
				doc.tags_value = doc.tags.join(",");

				doc.organisations_value = (doc.organisations || []).map(function (o, i) {
					return (o.label || o.name);
				}).join(",");

				doc.topics_value = (doc.topics || []).map(function (o) {
					return o.label;
				}).join(",");

				/* lang */
				if (doc.lang && l.lang.check(doc.lang)) {
					doc.lang_name = l.lang.get(doc.lang);
				}
				/* render form */
				render(req, res, 'contribute', {
					queue: {items: queue},
					edit: doc
				});
			});
		});
	});
});

/* contribution update */
app.post('/contribute/:id/update', function (req, res) {

	/* only for users */
	if (!req.user) return res.redirect("/contribute");

	l.queue.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);

		l.queue.get(id, function (err, doc) {
			if (err) return send500(req, res, err);

			/* check privileges */
			if (doc.user.role === "user" && doc.user !== req.user.id) return send500(req, res, new Error("access violation: user " + req.user.id + " (" + req.user.role + ") tried to access queue item " + id));
			if (!l.stages.canUpdate(doc.stage)) return send500(req, res, new Error("stage violation: document " + id + " stage " + doc.stage));

			l.queue.update(id, {
				topics: (req.body.topics || "").split(','),
				organisations: (req.body.organisations || "").split(','),
				tags: (req.body.tags || null),
				lang: (req.body.lang || null),
				comment: (req.body.comment || null)
			}, function (err, data) {
				if (err) return send500(req, res, err);

				/* redirect to index :) */
				res.redirect("/contribute#" + id);

			});

		});

	});

});

/* cancel */
app.get('/contribute/:id/cancel', function (req, res) {
	/* only for users */
	if (!req.user) return res.redirect("/contribute");

	l.queue.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);
		l.queue.get(id, function (err, doc) {
			if (err) return send500(req, res, err);
			/* check privileges */
			if (doc.user.role === "user" && doc.user !== req.user.id) return send500(req, res, new Error("access violation: user " + req.user.id + " (" + req.user.role + ") tried to access queue item " + id));
			if (!l.stages.canCancel(doc.stage)) return send500(req, res, new Error("stage violation: document " + id + " stage " + doc.stage));
			queue.cancel(id, function (err) {
				if (err) return send500(req, res, err);
				/* redirect to index :) */
				res.redirect("/contribute");
			});
		});
	});
});

/* quick accept for admins and so */
app.get('/contribute/:id/accept', function (req, res) {
	/* only for users */
	if (!req.user) return res.redirect("/contribute");

	l.queue.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);

		l.queue.get(id, function (err, doc) {
			if (err) return send500(req, res, err);

			/* check privileges */
			if (doc.user.role === "user" && doc.user !== req.user.id) return send500(req, res, new Error("access violation: user " + req.user.id + " (" + req.user.role + ") tried to access queue item " + id));
			if (!l.queue.canAccept(doc.stage)) return send500(req, res, new Error("stage violation: document " + id + " stage " + doc.stage));

			l.queue.accept(req.param("id"), function (err) {
				if (err) return send500(req, res, err);
				/* redirect to index :) */
				res.redirect("/contribute");
			});
		});
	});
});

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

/* about */
app.get('/about', function (req, res) {
	render(req, res, 'about', {});
});

/* contribution guidelines */
app.get('/contribution-guidelines', function (req, res) {
	render(req, res, 'contribution-guidelines', {});
});

/* browse documents */
app.get('/documents', function (req, res) {
	l.documents.all(function (err, docs) {
		if (err) return send500(req, res, err);
		docs.forEach(function (doc) {
			doc.created_ago = moment(doc.created).lang(req.locale || "en").calendar(true);
		});
		render(req, res, 'documents', {
			error: err,
			documents: docs
		});
	});
});

/* document */
app.get('/document/:id', function (req, res) {
	l.documents.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);
		l.documents.get(id, function (err, doc) {
			if (err) return send500(req, res, err);
			if (doc.topics.length > 0) doc.topics[(doc.topics.length - 1)].last = true;
			if (doc.organisations.length > 0) doc.organisations[(doc.organisations.length - 1)].last = true;
			doc.has_organisations = (doc.organisations.length > 0);
			doc.has_topics = (doc.topics.length > 0);
			doc.has_topics_or_organisations = (doc.has_topics || doc.has_organisations);
			doc.has_topics_and_organisations = (doc.has_topics && doc.has_organisations);

			/* prepare some stuff */
			doc.data.text_lines = doc.data.text.split(/\n/g);
			doc.data.info.size_readable = filesize(doc.data.info.size);
			doc.data.info.creationdate_readable = moment(doc.data.info.creationdate).lang(req.locale || "en").format("LLL");
			doc.data.info.moddate_readable = moment(doc.data.info.moddate).lang(req.locale || "en").format("LLL");

			/* render */
			render(req, res, 'document', {
				error: err,
				document: doc
			});
			/* count the view */
			l.documents.count_view(id);
		});
	});
});

/* download document */
app.get('/document/:id/download', function (req, res) {
	l.documents.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);
		l.documents.get(id, function (err, doc) {
			if (err) return send500(req, res, err);
			// FIXME: put this in some lib
			var _file = path.resolve(__dirname, config.storage, doc.file);
			fs.exists(_file, function (exists) {
				if (!exists) return send404(req, res);
				res.setHeader('Content-disposition', 'attachment; filename=' + doc.orig);
				res.setHeader('Content-type', "application/pdf"); // FIXME: get this from db
				fs.createReadStream(_file).pipe(res);
				/* count the download */
				l.documents.count_download(id);
			});
		});
	});
});

/* browse topics */
app.get('/topics', function (req, res) {
	l.topics.all(function (err, topics) {
		render(req, res, 'topics', {
			topics: {
				list: topics //FIXME: limits, etc
			}
		});
	})
});

/* topic */
app.get('/topic/:id', function (req, res) {
	l.topics.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);
		l.topics.get(id, function (err, topic) {
			if (err) return send500(req, res, err);
			/* get documents for organisation */
			l.documents.by_topic(id, function (err, docs) {
				if (err) return send500(req, res, err);
				docs.map(function (doc) {
					doc.created_ago = moment(doc.created).lang(req.locale || "en").calendar(true);
				});
				render(req, res, 'topic', {
					topic: topic,
					documents: docs
				});
			});
		});
	});
});

/* browse organisations */
app.get('/organisations', function (req, res) {
	l.organisations.all(function (err, orgs) {
		if (err) send404(req, res);

		/* sort alphabetically */
		var _list = {};
		var _letters = [];
		var _orgs = [];
		orgs.forEach(function (org) {

			/* remove fullname if same ar organisation name */
			if (org.hasOwnProperty("fullname") && org.fullname === org.name) org.fullname = null;

			var _name = (org.hasOwnProperty("fullname") && org.fullname !== null) ? org.fullname : org.name;
			var _letter = _name.substr(0, 1).toUpperCase();
			if (!_list.hasOwnProperty(_letter)) _list[_letter] = [];
			_list[_letter].push(org);
			if (_letters.indexOf(_letter) < 0) _letters.push(_letter);
		});
		_letters = _letters.sort();
		var _break = Math.floor(_letters.length / 3);
		var _breakidx = 0;
		_letters.forEach(function (letter) {
			_orgs.push({
				letter: letter,
				items: _list[letter]
			});
			_breakidx++;
			if (_breakidx >= _break) {
				_orgs.push({
					break: true
				});
				_breakidx = 0;
			}
		});
		render(req, res, 'organisations', {
			organisations: _orgs
		});
	});
});

/* organisation */
app.get('/organisation/:id', function (req, res) {
	l.organisations.check(req.param("id"), function (err, exists, id) {
		if (err) return send500(req, res, err);
		if (!exists) return send404(req, res);
		l.organisations.get(id, function (err, org) {
			if (err) return send500(req, res, err);
			/* get documents for organisation */
			l.documents.by_organisation(id, function (err, docs) {
				if (err) return send500(req, res, err);
				docs.map(function (doc) {
					doc.created_ago = moment(doc.created).lang(req.locale || "en").calendar(true);
				});
				render(req, res, 'organisation', {
					organisation: org,
					documents: docs
				});
			});
		});
	});
});

/* search */
app.all('/search', function (req, res) {
	var q = (req.body.query || req.query.query || "").replace(/\*/g, '');
	if (q === null || q === "") return render(req, res, 'search', {});
	l.documents.search(q, function (err, docs) {
		render(req, res, 'search', {
			query: q,
			items: docs || []
		});
	});
});

/**
 API
 **/

/* api index FIXME: doc here */
app.get('/api/', function (req, res) {
	res.json("not implemented yet");
});

/* contribute. it's like upload, but different */
app.post('/api/contribute', function (req, res) {

	if (!req.user) return res.json({"status": "error", "message": i18n.__("Please log in to upload files")});

	if (!req.files.hasOwnProperty("_upload")) return res.json({"status": "error", "message": i18n.__("No files were received")});

	/* check client mimetype, just to sort out all the crap */
	if (config.upload.mimetypes.indexOf(req.files._upload.mimetype) < 0 && config.upload.fileext.indexOf(req.files._upload.extension) < 0) {
		return res.json({"status": "error", "message": i18n.__("This is not a PDF file")});
	}

	/* don't take chances with data from the internet and check the mimetype for real */
	magic.detectFile(req.files._upload.path, function (err, _mimetype) {

		if (err) {
			return res.json({"status": "error", "message": i18n.__("This is not a PDF file")});
		}

		if (config.upload.mimetypes.indexOf(_mimetype) < 0) {
			return res.json({"status": "error", "message": i18n.__("This is not a PDF file")});
		}

		/* put file in storage */
		storage.save(req.files._upload.path, req.files._upload.extension, function (err, _filename) {

			if (err) {
				console.error("[contribute]", err); // FIXME: better logging
				return res.json({"status": "error", "message": i18n.__("File could not be saved")});
			}

			console.log("[contribute]", "new upload", _filename);

			l.queue.add({
				file: _filename,
				orig: path.basename(req.files._upload.path),
				topics: (req.body.topics || null),
				organisations: (req.body.organisations || null),
				tags: (req.body.tags || null),
				lang: (req.body.lang || null),
				comment: (req.body.comment || null),
				source: "upload," + (req.headers['x-original-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress),
				user: req.user.id
			}, function (err, data) {

				if (err) {
					console.error("[contribute]", "adding to queue failed:", err); // FIXME: better logging
					return res.json({"status": "error"});
				}

				console.log("[contribute]", "queued:", data.id, _filename);

				res.json({"status": "success", "id": data.id});

			});

		});

	});

});

/* upload */
app.post('/api/upload', function (req, res) {

	if (!req.user) return res.json({"status": "error", "message": i18n.__("Please log in to upload files")});

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
				topics: (req.body.topics || null),
				organisations: (req.body.organisations || null),
				tags: (req.body.tags || null),
				lang: (req.body.lang || null),
				comment: (req.body.comment || null),
				source: "upload," + (req.headers['x-original-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress),
				user: req.user.id
			}, function (err, data) {

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

/* passwort reset */
app.all('/users/reset/:key', function (req, res) {
	if (req.method !== "GET" && req.method !== "POST") return send500();

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
});

/* backend api login */
app.post('/api/backend/login', passport.authenticate('local', {}), function (req, res) {
	l.backendapi.user(req, res);
});

/* backend api */
app.post('/api/backend/:cmd', function (req, res) {
	if (!req.user) {
		res.send(401);
	} else {
		l.backendapi.request(req, res);
	}
});

/* topic suggestions */
app.all('/api/topic/suggest', function (req, res) {
	res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
	var q = (req.body.q || req.query.q || "").replace(/\*/g, '');
	if (q === null || q === "") return res.json([]);
	l.topics.suggest(q, function (err, result) {
		if (result && (result.length > 0)) {
			return res.json(result.map(function (r) {
				return {id: r.id, label: r.label};
			}));
		}
		res.json([]);
	});
});

/* topic suggestions */
app.all('/api/organisation/suggest', function (req, res) {
	res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
	var q = (req.body.q || req.query.q || "").replace(/\*/g, '');
	if (q === null || q === "") return res.json([]);
	l.organisations.suggest(q, function (err, result) {
		if (result && (result.length > 0)) {
			return res.json(result.map(function (r) {
				return {id: r.id, label: [r.name, r.fullname].join(" - ")};
			}));
		}
		res.json([]);
	});
});

/* default */
app.all('*', function (req, res) {
	send404(req, res);
});

/* listen */
var start = function () {
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
};

l.upgrade(function (err) {
	//l.reindex(function(){});
	if (!err)
		start();
});

/* gracefully shutdown on exit */
process.on("exit", function () {
	db.close(function () {
		console.log("database connection closed.")
	});
	app.__server.close(function () {
		console.log("socket closed.")
	});
});
