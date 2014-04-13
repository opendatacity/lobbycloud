#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var url = require("url");
var path = require("path");

/* require npm modules */
var passportlocal = require("passport-local");
var mustache = require("mustache-express");
var filedump = require("filedump");
var sqlite3 = require("sqlite3");
var mmmagic = require("mmmagic");
var mongojs = require("mongojs");
var express = require("express");
var multer = require("multer");
var i18n = require("i18n");
var passport = require('passport');

/* require config */
var config = require(path.resolve(__dirname, "config.js"), 20);

/* signup database */
var signupdb = new sqlite3.Database(path.resolve(__dirname, config.signupdb));

/* require local modules */
var invites = require("./modules/invites")(path.resolve(__dirname, config.invitedb));
var users = require("./modules/users")({db: config.db});

/* mockup docs */
var mockupdocs = require('./modules/mockdocs')();

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
		done(err, user);
	});
});

passport.use(new passportlocal.Strategy(function (username, password, done) {
	process.nextTick(function () {
		users.auth(username, password, function (result, user) {
			if (!result) {
				done(err);
			} else if (!user) {
				done(null, false, { message: 'Invalid Credentials'});
			} else {
				done(null, user);
			}
		});
	});
}));

/* helper function for tags */
var _totags = function(tags) {
	switch (typeof tags) {
		case "string":
			return tags.toLowerCase().replace(/[^a-z\u00df-\u00f6\u00f8-\u00ff #,;˜/]/g,'').split(/\s*[,#;\/\s]+\s*/g).map(function(t){
				return t.replace(/^\s+|\s+$/g,'');
			}).filter(function(t){
				return (t !== "");
			});
		break;
		case "object":
			return tags.map(function(t){
				return t.toLowerCase().replace(/[^a-z\u00df-\u00f6\u00f8-\u00ff ]/g,'').replace(/^\s+|\s+$/g,'');
			}).filter(function(t){
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

app.configure(function(){

	/* user logger */
	app.use(express.logger('dev'));

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
		rename: function(fieldname, filename) {
			return (filename.replace(/\W+/g, '-').toLowerCase()+'-'+Date.now());
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
	app.use(function(req, res, next) {
		res.locals.__ = function(){
			return function (text, render) {
				return i18n.__.apply(req, arguments);
			};
		};
		next();
	});

	/* upload error handler */
	app.use(function(err, req, res, next){
		if (req.url === "/api/upload") {
			console.log(err); // FIXME: do something that makes sense
			return res.json(500, {"status":"error"});
		}
		next(err);
	});

	/* user & session handling */
	app.use(express.cookieParser());
	app.use(express.session({ secret: config.passport.secret, store: new express.session.MemoryStore }));
	app.use(passport.initialize());
	app.use(passport.session());

});

/* routes */
app.get('/', function(req, res){
	res.render('index', {
		"_user": req.user,
		"url": config.url
	});
});

/* sign up */
app.all('/signup/:invite?', function(req, res){
	var invite = (req.param("invite") || req.body.invite || req.query.invite || null)
	res.render('signup', {
		"_user": req.user,
		"headers": {
			"signup": true
		},
		"url": config.url,
		"invited": invites.check(invite),
		"invite": invite
	});
});

/* beta sign up */
app.post('/beta', function(req, res){
	signupdb.run("INSERT INTO signup (date, name, email, motivation) VALUES (?, ?, ?, ?);", [
		parseInt((new Date()).getTime()/1000,10),
		req.body.name,
		req.body.email,
		req.body.motivation
	], function(err){
		res.render('beta', {
			"url": config.url,
			"thankyou": (err === null),
			"error": (err !== null)
		});
	});
});

/* upload */
app.get('/upload', function(req, res){
	res.render('upload', {
		"_user": req.user,
		"headers": {
			"upload": true
		},
		"url": config.url
	});
});

/**
	API
**/

/* api index */
app.get('/api/', function(req, res){
	res.json("not implemented");
});

/* upload */
app.post('/api/upload', function(req, res){

	if (!req.files.hasOwnProperty("_upload")) return res.json({"status":"error"});

	/* check client mimetype, just to sort out all the crap */
	if (config.upload.mimetypes.indexOf(req.files._upload.mimetype) < 0 && config.upload.fileext.indexOf(req.files._upload.extension) < 0) {
		console.log("error", "not a pdf"); // FIXME: better logging
		return res.json({"status":"error"});
	}

	/* don't take chances with data from the internet and check the mimetype for real */
	magic.detectFile(req.files._upload.path, function(err, _mimetype) {

		if (err) {
			console.log("error", err); // FIXME: better logging
			return res.json({"status":"error"});
		}

		if (config.upload.mimetypes.indexOf(_mimetype) < 0) {
			console.log("error", "not a pdf, for real"); // FIXME: better logging
			return res.json({"status":"error"});
		}

		/* prepare the user */
		/* FIXME: integrate user */
		var _user = false;
		var _ip = (req.headers['x-original-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress);

		/* put file in storage */
		storage.save(req.files._upload.path, req.files._upload.extension, function(err, _filename){

			if (err) {
				console.log("error", err); // FIXME: better logging
				return res.json({"status":"error"});
			}

			/* put document into database */
			db.collection("documents").save({
				status: 0,
				active: false,
				created: new Date(),
				file: {
					name: req.files._upload.originalname,
					file: _filename,
					mimetype: _mimetype,
				},
				source: {
					interface: "api",
					user: _user,
					trace: _ip,
					topic: (req.body.topic || false),
					comment: (req.body.comment || false),
					tags: _totags(req.body.tags)
				}
			}, function(err) {
				if (err) {
					console.log("error", err); // FIXME: better logging
					return res.json({"status":"error"});
				}

				res.json({"status":"success"});
				console.log("upload", _filename);

				// FIXME: trigger processing

			});

		});

	});

});

/* invites testing endpoint REMOVEME */
app.get('/api/test/invites/:create?', function(req, res){
	if (req.param("create")) invites.create(req.param("create"));
	res.json(invites.all());
});

/* dummy api endpoint */
app.get('/api/whatever', function(req, res){
	res.json("not implemented");
});

/* login */
app.post('/api/login',
	passport.authenticate('local', {}),
	function (req, res) {
		res.json(req.user);
	}
);

/* logout */
app.post('/api/logout', function (req, res) {
	if (req.user) {
		req.logout();
	}
	res.send(200);
});

/* protected backend api */

app.post('/api/admin/:cmd', function (req, res) {
	if ((!req.user) || (req.user.role !== 'admin')) {
		res.send(401);
	} else {
		switch (req.params.cmd) {
			case 'users':
				users.list(null, null, function (err, data) {
					var data = data.map(function(user){
						return {
							id:user.id,
							name:user.name,
							role:user.role,
							verified:user.verified,
							created:user.created
						}
					});
					res.json(data);
				});
				break;
			case 'docs':
				mockupdocs.listDocs(function (err, data) {
					res.json(data);
				});
				break;
			case 'users.delete':
				users.delete(req.body.id, function (err) {
					res.json(err ? 400 : 200, err);
				});
				break;
			case 'users.add':
				users.add(req.body.user, function (err, user) {
					if (err)
						res.send(400, err);
					else
						res.json(user);
				});
				break;
			case 'users.update':
				users.update(req.body.user, function (err, user) {
					if (err)
						res.send(400, err);
					else
						res.json(user);
				});
				break;
			default :
				res.send(404);
				break;
		}
	}
});



/* default */
app.all('*', function(req, res){
	res.redirect('/');
});

/* listen */
if (config.listen.hasOwnProperty("socket")) {
	var mask = process.umask(0);
	if (fs.existsSync(config.listen.socket)) {
		console.log("unlinking old socket");
		fs.unlinkSync(config.listen.socket);
	};
	app.listen(config.listen.socket, function(){
      if (mask) { process.umask(mask); mask = null; }
		console.log("server listening on socket", config.listen.socket);
	});
} else if (config.listen.hasOwnProperty("host")){
	app.listen(config.listen.port, config.listen.host, function(){
		console.log("server listening on", [config.listen.host, config.listen.port].join(":"));
	});
} else {
	app.listen(config.listen.port, function(){
		console.log("server listening on", ["*", config.listen.port].join(":"));
	});
}

/* gracefully shutdown on exit */
process.on("exit", function(){
	db.close(function(){
		console.log("database connection closed.")
	});
	app.close(function(){
		console.log("socket closed.")
	});
});
