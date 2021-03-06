#!/usr/bin/env node

/* require local modules */
var slugmaker = require("./slugmaker");
var utils = require("./utils");

module.exports = function (opts, db, es) {

	var topics = this;

	var es_store = ["label", "subject", "description", "created"];

	var cache = {};

	db.collection("topics").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("topics").ensureIndex("created", {"background": true});

	/* check if a topic exists */
	topics.check = function (s, callback) {
		var id = slugmaker(s);
		if (!id) return callback(new Error("Invalid ID"));
		if (cache.hasOwnProperty(id)) return callback(null, true, id);
		db.collection("topics").find({id: id}, {_id: 1}).limit(1, function (err, result) {
			if (err) return callback(err);
			if (result.length == 0) {
				db.collection("topics").find({label: s}, {_id: 1}).limit(1, function (err, result) {
					if (err) return callback(err);
					callback(null, (result.length > 0), id);
				});
			} else
				callback(null, (result.length > 0), id);
		});
	};

	/* add a topic */
	topics.add = function (data, callback) {

		/* topic object: id, label, subject, description created */

		/* check if label was specified */
		if (!data.hasOwnProperty("label") || typeof data.label !== "string" || data.label === "") return callback(new Error("Topic has no label"));

		var topic = {
			id: slugmaker(data.label),
			label: data.label,
			subject: (data.subject || data.label),
			description: (data.description || ""),
			created: (new Date())
		};

		topics.check(topic.id, function (err, exists) {
			if (err) return callback(err);
			if (exists) return callback(new Error("Topic already exists"));

			/* insert topic to database */
			db.collection("topics").save(topic, function (err, doc) {
				if (err) return callback(err);

				/* cache it */
				cache[topic.id] = doc;

				//do not wait for elasticsearch and ignore it's errors
				callback(null, doc);

				es.create('topic', topic.id, es.prepareFieldsObj(doc, es_store));
			});
		});
	};

	/* delete a topic */
	topics.delete = function (id, callback) {
		id = slugmaker(id);

		/* check if topic exists */
		topics.check(id, function (err, exists) {
			if (err) return callback(err);
			if (!exists) return callback(null); // be graceful

			db.collection("topics").remove({id: id}, true, function (err, res) {
				if (err) return callback(err);

				/* remove from cache */
				if (cache.hasOwnProperty(id)) delete cache[id];

				//do not wait for elasticsearch and ignore it's errors
				callback(null);

				es.delete('topic', id);
			});
		});
	};

	/* update a topic */
	topics.update = function (id, data, callback) {

		id = slugmaker(id);

		var update = {};
		if (data.hasOwnProperty("label")) update.label = data.label;
		if (data.hasOwnProperty("subject")) update.subject = data.subject;
		if (data.hasOwnProperty("description")) update.description = data.description;

		/* check if nothing to update */
		if (Object.keys(update).length === 0) return callback(null);

		/* check if topic exists */
		topics.check(id, function (err, exists) {
			if (err) return callback(err);
			if (!exists) return callback(new Error("Topic does not exists"));

			/* update database */
			db.collection("topics").findAndModify({"query": {"id": id}, "update": {"$set": update}, "new": true}, function (err, doc) {
				if (err) return callback(err);

				/* update cache */
				cache[id] = doc;

				//do not wait for elasticsearch and ignore it's errors
				callback(null, doc);

				/* update elasticsearch index */
				if (es.hasUpdateField(doc, es_store))
					es.update('topic', id, es.prepareFieldsObj(doc, es_store));
			});
		});

	};

	/* get a topic by id */
	topics.get = function (id, callback) {
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("topics").findOne({id: id}, function (err, result) {
			if (err) return callback(err);
			if (result === null) return callback(new Error("Topic does not exist"));
			cache[id] = result;
			callback(null, result);
		});
	};

	/* get topics by an array of ids */
	topics.list = function (ids, callback) {
		var list = [];
		var query = [];
		ids = (ids || []).map(function (id) {
			if (!id) return null;
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
		db.collection("topics").find({id: {"$in": query}}, function (err, result) {
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

	/* get all topics — rather don't use this */
	topics.all = function (callback) {
		db.collection("topics").find(function (err, results) {
			if (err) return callback(err);
			results.forEach(function (r) {
				cache[r.id] = r;
			});
			callback(null, results);
		});
	};

	/* get latest topics */
	topics.latest = function (num, callback) {
		if (typeof num === "function") {
			var callback = num;
			var num = 1;
		}
		db.collection("topics").find().sort({"created": -1}).limit(num, function (err, result) {
			if (err) return callback(err);
			result.forEach(function (r) {
				cache[r.id] = r;
			});
			callback(null, result);
		});
	};

	/* recreate elastic search index for all topics */
	topics.reindex = function (callback) {
		db.collection("topics").find({}, function (err, result) {
			if (result.length === 0) return callback();
			var list = [];
			result.forEach(function (r) {
				list.push(r);
			});
			utils.queue(list, function (topic, cb) {
				es.delete('topic', topic.id, function () {
					es.create('topic', topic.id, es.prepareFieldsObj(topic, es_store), cb);
				});
			}, callback);
		});
	};

	/* find topics by a query on label and subject */
	topics.suggest = function (q, callback) {
		es.suggest('topic', q, ['label', 'subject'], function (err, hits) {
			if (err) return callback(err);
			var ids = Object.keys(hits);
			if (ids.length === 0) return callback(null, []);
			topics.list(ids, function (err, result) {
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

	return topics;

};
