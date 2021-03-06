#!/usr/bin/env node

/* require npm modules */
var validator = require("validator");
var _ = require("underscore");

/* require local modules */
var slugmaker = require("./slugmaker");
var utils = require("./utils");

module.exports = orgs = function (opts, db, es) {

	var es_store = ["name", "fullname", "description", "created"];

	var organisations = this;

	var cache = {};

	db.collection("organisations").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("organisations").ensureIndex("created", {"background": true});

	/* check if organisation exists */
	organisations.check = function (s, callback) {
		var id = slugmaker(s);
		if (cache.hasOwnProperty(id)) return callback(null, true, id);
		db.collection("organisations").find({id: id}, {_id: 1}).limit(1, function (err, result) {
			if (err) return callback(err);
			if (result.length == 0) {
				db.collection("organisations").find({name: s}, {_id: 1}).limit(1, function (err, result) {
					if (err) return callback(err);
					callback(null, (result.length > 0), id);
				});
			} else
				callback(null, (result.length > 0), id);
		});
	};

	/* add an organisation */
	organisations.add = function (data, callback) {

		/* organisation object: id, name, fullname, description, url, logo, created */

		/* check if name was specified */
		if (!data.hasOwnProperty("name") || typeof data.name !== "string" || data.name === "") return callback(new Error("Organisation has no name"));

		/* check supplied url */
		if (data.url && !data.url.match(/^(http|https):\/\//)) data.url = "http://" + data.url;
		if (data.url && !validator.isURL(data.url, {
				protocols: ['http', 'https'],
				require_tld: true,
				require_protocol: true
			})) data.url = false;

		/* check supplied logo url */
		if (data.logo && !data.logo.match(/^(http|https):\/\//)) data.logo = "http://" + data.logo;
		if (data.logo && !validator.isURL(data.logo, {
				protocols: ['http', 'https'],
				require_tld: true,
				require_protocol: true
			})) data.logo = false;

		var org = {
			id: slugmaker(data.name),
			name: data.name,
			fullname: (data.fullname || data.name),
			description: (data.description || ""),
			url: data.url,
			logo: data.logo,
			created: (new Date())
		};

		organisations.check(org.id, function (err, exists) {
			if (err) return callback(err);
			if (exists) return callback(new Error("Organisation already exists"));

			/* insert organisation to database */
			db.collection("organisations").save(org, function (err, result) {
				if (err) return callback(err);

				/* cache it */
				cache[org.id] = result;

				//do not wait for elasticsearch and ignore it's errors
				callback(null, result);

				es.create('organisation', org.id, es.prepareFieldsObj(data, es_store));
			});
		});
	};

	/* delete an organisation */
	organisations.delete = function (id, callback) {
		id = slugmaker(id);

		/* check if organisation exists */
		organisations.check(id, function (err, exists) {
			if (err) return callback(err);
			if (!exists) return callback(null); // be graceful

			db.collection("organisations").remove({id: id}, true, function (err, res) {
				if (err) return callback(err);

				/* remove from cache */
				if (cache.hasOwnProperty(id)) delete cache[id];

				//do not wait for elasticsearch and ignore it's errors
				callback(null);

				es.delete('organisation', id);
			});
		});
	};

	/* update an organisation */
	organisations.update = function (id, data, callback) {

		id = slugmaker(id);

		var update = {};
		if (data.hasOwnProperty("name")) update.name = data.name;
		if (data.hasOwnProperty("fullname")) update.fullname = data.fullname;
		if (data.hasOwnProperty("description")) update.description = data.description;
		if (data.hasOwnProperty("url") && validator.isURL(data.url, {protocols: ['http', 'https'], require_tld: true, require_protocol: true})) update.url = data.url;
		if (data.hasOwnProperty("logo") && validator.isURL(data.logo, {protocols: ['http', 'https'], require_tld: true, require_protocol: true})) update.logo = data.logo;

		/* check if nothing to update */
		if (Object.keys(update).length === 0) return callback(null);

		/* check if organisation exists */
		organisations.check(id, function (err, exists) {
			if (err) return callback(err);
			if (!exists) return callback(new Error("Organisation does not exists"));

			/* update database */
			db.collection("organisations").findAndModify({"query": {"id": id}, "update": {"$set": update}, "new": true}, function (err, doc) {
				if (err) return callback(err);

				/* update cache */
				cache[id] = doc;

				//do not wait for elasticsearch and ignore it's errors
				callback(null, doc);

				/* update elasticsearch index */
				if (es.hasUpdateField(doc, es_store))
					es.update('organisation', id, es.prepareFieldsObj(doc, es_store));

			});
		});

	};

	/* get an organisation by id */
	organisations.get = function (id, callback) {
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("organisations").findOne({id: id}, function (err, result) {
			if (err) return callback(err);
			if (result === null) return callback(new Error("Organisation does not exist"));
			cache[id] = result;
			callback(null, result);
		});
	};

	/* get organisations by an array of ids */
	organisations.list = function (ids, callback) {
		var list = [];
		var query = [];
		ids = (ids || []).map(function (id) {
			if (id == null) return null;
			if (typeof id == "string")
				return id;
			return id.id;
		});
		ids.forEach(function (id) {
			if (cache.hasOwnProperty(id)) {
				list.push(cache[id]);
			} else if (id !== null) {
				query.push(id);
			}
		});
		/* got all from cache? */
		if (query.length === 0) return callback(null, list);
		/* get rest from mongodb */
		db.collection("organisations").find({id: {"$in": query}}, function (err, result) {
			if (err) return callback(err);
			result.forEach(function (r) {
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});

	};

	/* get all organisations — rather don't use this */
	organisations.all = function (callback) {
		db.collection("organisations").find(function (err, results) {
			if (err) return callback(err);
			results.forEach(function (user) {
				cache[user.id] = user;
			});
			callback(null, results);
		});
	};

	/* recreate elastic search index for all organisations */
	organisations.reindex = function (callback) {
		db.collection("organisations").find({}, function (err, result) {
			if (result.length === 0) return callback();
			var list = [];
			result.forEach(function (r) {
				list.push(r);
			});
			utils.queue(list, function (organisation, cb) {
				es.delete('organisation', organisation.id, function () {
					es.create('organisation', organisation.id, es.prepareFieldsObj(organisation, es_store), cb);
				});
			}, callback);
		});
	};

	/* find organisations by a query on name and fullname */
	organisations.suggest = function (q, callback) {
		es.suggest('organisation', q, ['name', 'fullname'], function (err, hits) {
			if (err) return callback(err);
			var ids = Object.keys(hits);
			if (ids.length === 0) return callback(null, []);
			organisations.list(ids, function (err, result) {
				if (err) return callback(err);
				/* add score to result */
				result.map(function (r) {
					r.score = hits[r.id];
				});
				/* sort by score */
				result.sort(function (a, b) {
					return (b.score - a.score)
				});
				/* call back */
				callback(null, result);
			});
		});
	};

	return organisations;

};
