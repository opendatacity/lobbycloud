var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	passport = require('passport'),
	util = require('util'),
	url = require('url'),
	LocalStrategy = require('passport-local').Strategy,
	sessionstore = new express.session.MemoryStore;
var
	config = require('./config.js'),
	userRoles = require('./assets/js/roles').userRoles,
	Docs = require('./modules/docs').Docs,
	Users = require('./modules/users').Users;
var
	docs = new Docs(),
	users = new Users();

passport.serializeUser(function (user, done) {
	done(null, user.id);
});

passport.deserializeUser(function (id, done) {
	users.getUserById(id, function (err, user) {
		done(err, user);
	});
});

passport.use(new LocalStrategy(function (username, password, done) {
	process.nextTick(function () {
		users.validateUser(username, password, function (err, user) {
			if (err) {
				return done(err);
			}
			if (!user) {
				console.error('[LobbyCloudCentral] Auth failed ' + username);
				return done(null, false, { message: 'Invalid Credentials'});
			}
			return done(null, user);
		});

	});
}));

app.configure('all', function () {
	app.use(express.compress());
	app.use(express.favicon(__dirname + '/assets/img/favicon.ico'));
	app.use('/', express.static(__dirname + '/assets'));
	if (config.debug) {
		app.use(express.logger('dev'));
		console.log('Debugging Mode');
	}
	app.use(express.cookieParser());
	app.use(express.json());
	app.use(express.urlencoded());
	app.use(express.methodOverride());
	app.use(express.session({ secret: 'keyboard cat is so super happy', store: sessionstore }));
	app.use(passport.initialize());
	app.use(passport.session());
});

app.post('/api/login',
	passport.authenticate('local', {}),
	function (req, res) {
		res.json(users.getUser(req.user));
	}
);

app.post('/api/logout', function (req, res) {
	if (req.user) {
		req.logout();
	}
	res.send(200);
});

app.get('/api/docs/list', function (req, res) {
	if (!req.user) {
		res.send(401);
	} else {
		docs.getDocs(function (data) {
			res.json(data);
		});
	}
});

app.post('/api/admin/:cmd', function (req, res) {
	if ((!req.user) || (req.user.role !== userRoles.admin)) {
		res.send(401);
	} else {
		switch (req.params.cmd) {
			case 'users':
				users.getUsers(function (data) {
					res.json(data);
				});
				break;
			case 'groups':
				users.getGroups(function (data) {
					res.json(data);
				});
				break;
			case 'deleteUser':
				users.deleteUser(req.body.id, function (err) {
					res.json(err ? 400 : 200, err);
				});
				break;
			case 'addUser':
				users.addUser(req.body.user, function (err, user) {
					if (err)
						res.send(400, err);
					else
						res.json(user);
				});
				break;
			case 'editUser':
				users.editUser(req.body.user, function (err, user) {
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

server.listen(config.server_settings.port, config.server_settings.listento);
console.log('[LobbyCloudCentral] Server running away at ' + config.server_settings.listento + ':' + config.server_settings.port);
