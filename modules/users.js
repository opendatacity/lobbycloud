#!/usr/bin/env node

/* require node modules */
var crypto = require("crypto");

/* require npm modules */
var validator = require("validator");
var slugmaker = require("./slugmaker");
var mongojs = require("mongojs");
var _ = require("underscore");

/* prepare regexp */

module.exports = function(opts){
	
	var users = this;
	var db = new mongojs(opts.db);
	var cache = {};
	
	/* make sure indexes are there */
	db.collection("users").ensureIndex("id", {"unique": true, "background": true});
	db.collection("users").ensureIndex("apikey", {"unique": true, "background": true});
	db.collection("users").ensureIndex("created", {"background": true});
	
	/* generate password hash */
	users.password = function(password, opts, callback){
		
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
		if (!opts.hasOwnProperty("iterations")) opts.iterations = (10000+parseInt(crypto.randomBytes(2).toString("hex"),16)%1000);

		/* derive hash */
		crypto.pbkdf2(password, opts.salt, opts.iterations, 128, function(err, key){
			if (err) return callback(err);
			callback(null, "pbkdf2", key.toString("hex"), opts.salt, opts.iterations, (new Date().getTime())-starttime);
		});
		
	}
	
	/* check if user exists */
	users.check = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, true);
		db.collection("users").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0));
		});
	};

	/* add a user */
	users.add = function(user, callback){

		/* set defaults */
		_.defaults(user, {
			name: user.id,
			url: false,
			role: "user",
			description: "",
			apikey: crypto.randomBytes(8).toString("hex"),
			verification: crypto.randomBytes(8).toString("hex"),
			verified: false,
			created: (new Date())
		});

		/* unify user id */
		user.id = slugmaker(user.id);
		
		/* check email */
		if (!validator.isEmail(user.email)) return callback(new Error("Email address is invalid"));
		
		// FIXME: check mx for email domain

		/* check url */
		if (user.url && !validator.isURL(user.url, {
			protocols: ['http','https','gopher'], 
			require_tld: true, 
			require_protocol: true
		})) user.url = false;

		users.check(user.id, function(err, exists){
			if (err) return callback(err);
			if (exists) return callback(new Error("User already exists"));
			
			/* replace password */
			users.password(user.password, function(err, method, key, salt, it, time){
				
				if (err) return callback(err);

				user.password = [method, key, salt, it];
				
				/* insert user to database */
				db.collection("users").save(user, function(err, result){
					callback(err,result);
					console.log(err, result);
				});
				
			});
			
		});
	};

	/* get a user */
	users.get = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("users").findOne({id: id}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("user does not exist"));
			cache[id] = result;
			cache["apikey:"+result.apikey] = id;
			callback(null, result);
		});
	};

	/* check password */
	users.auth = function(id, pass, callback) {
		users.get(id, function(err, user){
			if (err) return callback(false);
			users.password(pass, {
				method: user.password[0],
				salt: user.password[2],
				iterations: user.password[3]
			}, function(err, method, hash, salt, iterations, time){
				if (err) return callback(false);
				if (hash !== user.password[1]) return callback(false);
				callback(true, user);
			});
		});
	};
	
	/* delete user */
	users.delete = function(id, callback) {
		id = slugmaker(id);
		db.collection("users").remove({id: id}, true, function(err, res){
			if (err) return callback(err);

			/* remove from cache */
			if (cache.hasOwnProperty(id)) delete cache[id];
			Object.keys(cache).forEach(function(k){
				if (k.test(/^apikey:/) && cache[k] === id) delete cache[k];
			});
			
			callback(null);
		});
	};
	
	/* update user */
	users.update = function(id, user, callback) {
		id = slugmaker(id);
		
		var update = {};
		if (user.hasOwnPropery("name")) update.name = user.name;
		if (user.hasOwnPropery("email") && validator.isEmail(user.email)) update.email = user.email;
		if (user.hasOwnPropery("url") && validator.isURL(user.url, {protocols: ['http','https','gopher'], require_tld: true, require_protocol: true})) update.url = user.url;
		if (user.hasOwnPropery("description")) update.description = user.description;
		if (user.hasOwnPropery("organisation")) update.organisation = user.organisation;

		/* check if nothing to update */
		if (Object.keys(update).length === 0) return callback(null);
		
		db.collection("users").update({id: id}, update, function(err, doc){
			if (err) return callback(err);
			cache[id] = doc;
			callback(null, doc);
		});
		
	};
	
	/* get all users, probably rather not use this */
	users.list = function(limit, skip, callback) {
		/* FIXME: limit and skip are not used */
		db.collection("users").find(function(err,results){
			if (err) return callback(err);
			results.forEach(function(user){
				cache[user.id] = user;
			});
			callback(null, results);
		});
	};
	
	/* change password */
	users.changepass = function(id, password, oldpassword, callback) {
		if (typeof oldpassword === "function") {
			/* just update the password */
			users.password(password, function(err, method, key, salt, it, time){
				db.collection("users").update({id: id}, {password: [method, key, salt, it]}, function(err, doc){
					if (err) return callback(err);
					cache[id] = doc;
					callback(null);
				});
			});
		} else {
			/* check password first */
			users.auth(id, password, function(auth){
				if (!auth) return callback(new Error("could not change password"));
				users.changepass(id, password, callback);
			});
		}
	};
	
	/* get user by apikey */
	users.apikey = function(apikey, callback) {
		var cacheid = "apikey:"+apikey;
		if (cache.hasOwnProperty(cacheid)) return users.get(cache[cacheid], callback)
		db.collection("users").findOne({apikey: apikey}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("apikey not exist"));
			cache[result.id] = result;
			cache[cacheid] = result.id;
			callback(null, result);
		});
	};



	/* user testing default user REMOVEME */
	users.initDefaultAdmin = function() {
		var defaultuser= {
			id:'admin',
			password:'admin',
			email:'admin@localhost',
			url: false,
			description: "",
			role:'admin',
			apikey: crypto.randomBytes(8).toString("hex"),
			verification: crypto.randomBytes(8).toString("hex"),
			verified : true,
			created: (new Date())
		};
		users.check(defaultuser.id, function(err, exists) {
			if (!exists)
				users.password(defaultuser.password, function(err, method, key, salt, it, time){
					if (err) console.log(err);
					defaultuser.password = [method, key, salt, it];
					db.collection("users").save(defaultuser, function(err, result){
						console.log(err, result);
					});
				});
		});
	};
//	users.initDefaultAdmin();

	return users;
	
};
