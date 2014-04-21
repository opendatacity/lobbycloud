#!/usr/bin/env node

/* require node modules */
var crypto = require("crypto");

/* require npm modules */
var validator = require("validator");
var slugmaker = require("./slugmaker");
var mongojs = require("mongojs");
var _ = require("underscore");

/* prepare regexp */

module.exports = function (opts, db, es, mailqueue, i18n) {

	var users = this;

	var cache = {};

	/* make sure indexes are there */
	db.collection("users").ensureIndex("id", {"unique": true, "background": true});
	db.collection("users").ensureIndex("apikey", {"unique": true, "background": true});
	db.collection("users").ensureIndex("created", {"background": true});

	users.roles = {
		admin: "admin",
		user: "user",
		editor: "editor"
	};

	/* generate password hash */
	users.password = function (password, opts, callback) {

		/* opts is optional */
		if (typeof callback === "undefined" && typeof opts === "function") {
			var callback = opts;
			var opts = {};
		}

		/* get starttime for time measurement */
		var starttime = (new Date().getTime());

		/* get hex representation of password */
		var password = Buffer(password, 'binary').toString("hex");

		/* generate random salt if none given */
		if (!opts.hasOwnProperty("salt")) opts.salt = crypto.randomBytes(128).toString("hex");

		/* set number of iterations to somthing between 10000 and 10999 if none given */
		if (!opts.hasOwnProperty("iterations")) opts.iterations = (10000 + parseInt(crypto.randomBytes(2).toString("hex"), 16) % 1000);

		/* derive hash */
		crypto.pbkdf2(password, opts.salt, opts.iterations, 128, function (err, key) {
			if (err) return callback(err);
			callback(null, "pbkdf2", key.toString("hex"), opts.salt, opts.iterations, (new Date().getTime()) - starttime);
		});

	};

	/* check if user exists */
	users.check = function (id, callback) {
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, true);
		db.collection("users").find({id: id}, {_id: 1}).limit(1, function (err, result) {
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};

	/* add a user */
	users.add = function (user, callback) {

		/* set defaults */
		_.defaults(user, {
			name: user.id,
			url: null,
			role: "user",
			description: "",
			location: "",
			organisation: "",
			apikey: crypto.randomBytes(8).toString("hex"),
			verification: crypto.randomBytes(8).toString("hex"),
			verified: false,
			created: (new Date())
		});

		/* unify user id */
		user.id = slugmaker(user.id);

		/* check email */
		if (!validator.isEmail(user.email)) return callback(new Error("Email address is invalid"));

		/* generate gravatar hash for email */
		user.gravatar = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');

		// FIXME: check mx for email domain

		/* check url */
		if (user.url && !user.url.match(/^(http|https|gopher):\/\//)) user.url = "http://" + user.url;
		if (user.url && !validator.isURL(user.url, {
			protocols: ['http', 'https', 'gopher'],
			require_tld: true,
			require_protocol: true
		})) user.url = false;

		users.check(user.id, function (err, exists) {
			if (err) return callback(err);
			if (exists) return callback(new Error("User already exists"));

			/* replace password */
			users.password(user.password, function (err, method, key, salt, it, time) {

				if (err) return callback(err);

				user.password = [method, key, salt, it];
				/* insert user to database */
				db.collection("users").save(user, function (err, doc) {
					if (!err)
						cache[doc.id] = doc;
					callback(err, doc);
				});

			});

		});
	};

	/* get a user */
	users.get = function (id, callback) {
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("users").findOne({id: id}, function (err, result) {
			if (err) return callback(err);
			if (result === null) return callback("user does not exist");
			cache[id] = result;
			cache["apikey:" + result.apikey] = id;
			/* fix missing gravatar */
			if (!result.hasOwnProperty("gravatar")) {
				result.gravatar = crypto.createHash('md5').update(result.email.toLowerCase()).digest('hex');
				db.collection("users").findAndModify({query: {id: id}, update: {$set: {gravatar: result.gravatar}}, new: false}, function (err) {
				});
			}
			callback(null, result);
		});
	};

	/* check password */
	users.auth = function (id, pass, callback) {
		users.get(id, function (err, user) {
			if (err) return callback(false);
			cache[user.id] = user;
			if (typeof pass == 'string') {
				users.password(pass, {
					method: user.password[0],
					salt: user.password[2],
					iterations: user.password[3]
				}, function (err, method, hash, salt, iterations, time) {
					if (err) return callback(false);
					if (hash !== user.password[1]) return callback(false);
					callback(true, user);
				});
			} else {
				if (pass[1] !== user.password[1]) return callback(false);
				callback(true, user);
			}
		});
	};

	/* delete user */
	users.delete = function (id, callback) {
		id = slugmaker(id);
		db.collection("users").remove({id: id}, true, function (err, res) {
			if (err) return callback(err);

			/* remove from cache */
			if (cache.hasOwnProperty(id)) delete cache[id];
			Object.keys(cache).forEach(function (k) {
				if ((k.test) && k.test(/^apikey:/) && cache[k] === id) delete cache[k];
			});

			callback(null);
		});
	};

	/* update user */
	users.update = function (id, user, accessrole, callback) {

		var id = slugmaker(id);

		var update = {};
		if (user.hasOwnProperty("id")) update.id = user.id;
		if (user.hasOwnProperty("name")) update.name = user.name;
		if (user.hasOwnProperty("email") && validator.isEmail(user.email)) update.email = user.email;
		if (user.hasOwnProperty("url") && validator.isURL(user.url, {protocols: ['http', 'https', 'gopher'], require_tld: true, require_protocol: true})) update.url = user.url;
		if (user.hasOwnProperty("description")) update.description = user.description;
		if (user.hasOwnProperty("location")) update.location = user.location;
		if (user.hasOwnProperty("organisation")) update.organisation = user.organisation;
		if (user.hasOwnProperty("email")) {
			update.gravatar = crypto.createHash('md5').update(user.email.toLowerCase()).digest('hex');
			update.verified = false;
		}

		var _updateUser = function () {
			/* check if nothing to update */
			if (Object.keys(update).length === 0) return callback(null);
			db.collection("users").findAndModify({query: {id: id}, update: {$set: update}, new: true}, function (err, doc) {
				if (err) return callback(err);
				cache[doc.id] = doc;
				callback(err, doc);
			});
		};

		if (user.hasOwnProperty("password") && (accessrole === users.roles.admin)) {
			/* replace password */
			users.password(user.password, function (err, method, key, salt, it, time) {
				if (err) return callback(err);
				update.password = [method, key, salt, it];
				_updateUser();
			});
		} else {
			_updateUser();
		}
	};

	/* get all users, probably rather not use this */
	users.list = function (limit, skip, callback) {
		/* FIXME: limit and skip are not used */
		db.collection("users").find(function (err, results) {
			if (err) return callback(err);
			results.forEach(function (user) {
				cache[user.id] = user;
			});
			callback(null, results);
		});
	};

	/* get user by apikey */
	users.apikey = function (apikey, callback) {
		var cacheid = "apikey:" + apikey;
		if (cache.hasOwnProperty(cacheid)) return users.get(cache[cacheid], callback)
		db.collection("users").findOne({apikey: apikey}, function (err, result) {
			if (err) return callback(err);
			if (result === null) return callback(new Error("apikey not exist"));
			cache[result.id] = result;
			cache[cacheid] = result.id;
			callback(null, result);
		});
	};

	/* get user by email */
	users.email = function (email, callback) {
		db.collection("users").findOne({email: email}, function (err, doc) {
			if (err) return callback(err);
			cache[doc.id] = doc;
			callback(null, doc);
		});
	};

	/* send user e-mail  */
	users.send_mail = function (user, type, cb) {
		mailqueue.send(user, type, function (err, success) {
			if (err)
				cb(i18n.__("Error occured. mail not sent"));
			else if (!success)
				cb(i18n.__("Last mail sent too soon, please wait"));
			else cb(null, i18n.__("Mail queued. Please wait a moment and check your e-mail inbox"))
		})
	};

	/* check user e-mail validation */
	users.verify_email = function (linkkey, cb) {
		mailqueue.pop(linkkey, function (task) {
			if (!task) return cb(new Error(i18n.__("Link expired, invalid or does not exists")));
			users.get(task.id, function (err, user) {
				if (err || (!user) || (task.email !== user.email))
					return cb(new Error(i18n.__("Link is invalid")));
				db.collection("users").findAndModify({query: {id: user.id}, update: {$set: {verified: true}}, new: true}, function (err, doc) {
					if (err) return cb(new Error(i18n.__("Internal Error :(")));
					cache[doc.id] = doc;
					cb(null, i18n.__("Thank you. Your email adress is now validated."));
				});
			});
		});
	};

	/* change password */
	users.changepass = function (id, password, oldpassword, callback) {
		users.auth(id, oldpassword, function (success, user) {
			if (!user) return callback(new Error("could not change password"));
			users.password(password, function (err, method, key, salt, it, time) {
				db.collection("users").findAndModify({query: {id: id}, update: {$set: {password: [method, key, salt, it]}}, new: true}, function (err, doc) {
					if (err) return callback(err);
					cache[id] = doc;
					callback(null, doc);
				});
			});
		});
	};

	/* check new passwort request */
	users.password_reset = function (linkkey, password, cb) {
		mailqueue.pop(linkkey, function (task) {
			if (!task) return cb(new Error(i18n.__("Link expired, invalid or does not exists")));
			users.get(task.id, function (err, user) {
				if (err || (!user))
					return cb(new Error(i18n.__("Link is invalid")));
				users.changepass(user.id, password, user.password, function (err, result) {
					cb(err, result ? i18n.__("Password successfully changed.") : '');
				});
			});
		});
	};

	/* user testing default user REMOVEME */
	users.initDefaultAdmin = function () {
		var defaultuser = {
			id: 'admin',
			password: 'admin',
			email: 'admin@localhost',
			url: null,
			description: "",
			role: 'admin',
			apikey: crypto.randomBytes(8).toString("hex"),
			verification: crypto.randomBytes(8).toString("hex"),
			verified: false,
			created: (new Date())
		};
		users.check(defaultuser.id, function (err, exists) {
			if (!exists)
				users.password(defaultuser.password, function (err, method, key, salt, it, time) {
					if (err) console.log(err);
					defaultuser.password = [method, key, salt, it];
					db.collection("users").save(defaultuser, function (err, result) {
						console.log(err, result);
					});
				});
		});
	};
//	db.collection("users").remove();
//	users.initDefaultAdmin();

	return users;

};
