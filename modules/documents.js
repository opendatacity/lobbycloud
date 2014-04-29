#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

module.exports = documents = function(config, db, es, l){
	
	var documents = this;

	var cache = {};

	var topics = l.topics;
	var organisations = l.organisations;

	db.collection("documents").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("documents").ensureIndex("created", {"background": true});
	/* waaaay more indexes! */

	documents.checkid = function(id) {
		return /^([a-z0-9]{8})$/.test(id);
	};

	documents.import = function(id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		l.queue.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("not in queue"));
			l.queue.get(id, function(err, doc){
				if (err) return callback(err);
				if (!doc.hasOwnProperty("stage") || doc.stage !== 3) return callback(new Error("queue item is not approved"));
				
				/* check if organisation is an id */
				if (doc.hasOwnProperty("organisation") && doc.organisation !== null && !doc.organisation.hasOwnProperty("id")) return callback(new Error("organisation must be specified by id"));

				/* check if topic is an id */
				if (doc.hasOwnProperty("topic") && doc.topic !== null && !doc.topic.hasOwnProperty("id")) return callback(new Error("topic must be specified by id"));
				
				/* check if an organisation exists */
				var check_organisation = function(_callback) {
					if (doc.organisation === null) return _callback(null);
					if (!doc.organisation.hasOwnProperty("id")) return _callback(new Error("organisation has to be created"));
					organisations.check(doc.organisation.id, function(err, exists){
						if (err) return _callback(new Error(err));
						if (!exists) return _callback(new Error("organisation does not exist"));
						_callback(null);
					});
				};
		
				/* check if a topic exists */
				var check_topic = function(_callback) {
					if (doc.topic === null) return _callback(null);
					if (!doc.topic.hasOwnProperty("id")) return _callback(new Error("topic has to be created"));
					l.topics.check(doc.topic.id, function(err, exists){
						if (err) return _callback(new Error(err));
						if (!exists) return _callback(new Error("topic does not exist"));
						_callback(null);
					});
				};
		
				check_organisation(function(err){
					if (err) return callback(err);
					check_topic(function(err){
						if (err) return callback(err);

						/* save */
						db.collection("queue").save({
							id: doc.id,
							indexed: false,
							user: doc.user,
							source: doc.source,
							created: doc.created,
							updated: (new Date()),
							orig: doc.orig,
							lang: doc.lang,
							tags: doc.tags,
							topic: (doc.topic.id || null),
							organisation: (doc.organisation.id || null),
							comments: [], // comments without places
							notes: [], // comments with places
							changesets: [], // for lobbyplag
							stats: {
								downloads: 0,
								views: 0,
								comments: 0,
								notes: 0
							},
							file: doc.file,
							thumb: doc.data.thumbs[0].file,
							data: doc.data,
						}, function(err, result){
							if (err) return callback(err);

							/* cache it */
							cache[doc.id] = result;
						
							/* call back */
							callback(null, result);

							/* build index */
							documents.index(doc.id);

						});
					});
				});
			});
		});
	};

	/* create elastic search index for document */
	documents.index = function(id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		return callback(new Error("not implemented yet"));
		documents.get(id, function(err, doc){
			if (err) return callback(err);
			es.update({
				index: opts.elasticsearch.index,
				type: 'document',
				id: doc.id,
				upsert: {
					lang: doc.lang,
					user: doc.user,
					tags: doc.tags,
					topic: doc.topic,
					organisation: doc.organisation,
					created: doc.created,
					updated: doc.updated,
					text: doc.data.text
				}
			}, function (err, resp) {
				if (err) return calback(err);
				if (config.debug) console.log("[documents] created new search index for ["+doc.id+"]");

				// FIXME: seperate indexes for comments and notes

				/* update indexed flag */
				db.collection("documents").findAndModify({"query":{"id":id},"update":{"$set":{"indexed":true}},"new":true}, function(err, doc){
					if (err) return callback(err);
					
					/* update cache */
					cache[id] = doc;

					/* call back */
					callback(null);
				});
			});
		});
	};

	/* check if a document exists */
	documents.check = function(id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		if (cache.hasOwnProperty(id)) return callback(null, true, id);
		db.collection("documents").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};

	/* update a document */
	documents.update = function(id, data, callback) {
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		callback(new Error("not implemented yet"));
	};

	/* delete a document */
	documents.delete = function(id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		callback(new Error("not implemented yet"));
	};
	
	/* get by id */
	documents.get = function(id, callback){
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("documents").findOne({id: id}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("document does not exist"));
			cache[id] = result;
			callback(null, result);
		});
	};

	/* get complete documents by stage */
	documents.all = function(callback) {	
		db.collection("documents").find({}, function(err, result){
			if (err) return callback(err);
			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});
	};

	/* get documents for user */
	documents.by_user = function(user_id, callback) {

		/* devise statement according to query */
		if (user_id instanceof Array) {
			/* get all stages */
			var find = {"user": {"$in": user_id}};
		} else if (typeof user_id === "string") {
			/* get particular stage */
			var find = {"user": user_id};
		} else {
			/* nope */
			return callback(new Error("no user specified"));
		}
		
		/* get from collection */
		db.collection("documents").find(find, function(err, result){
			if (err) return callback(err);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});
		
	};
	
	documents.by_topic = function(topic_id, callback) {

		/* devise statement according to query */
		if (topic_id instanceof Array) {
			/* get all stages */
			var find = {"topic": {"$in": topic_id}};
		} else if (typeof topic_id === "string") {
			/* get particular stage */
			var find = {"topic": topic_id};
		} else {
			/* nope */
			return callback(new Error("no topic specified"));
		}
		
		/* get from collection */
		db.collection("documents").find(find, function(err, result){
			if (err) return callback(err);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});
	};
	
	documents.by_organisation = function(organisation_id, callback) {

		/* devise statement according to query */
		if (organisation_id instanceof Array) {
			var find = {"organisation": {"$in": organisation_id}};
		} else if (typeof organisation_id === "string") {
			var find = {"organisation": organisation_id};
		} else {
			return callback(new Error("no organisation specified"));
		}
		
		/* get from collection */
		db.collection("documents").find(find, function(err, result){
			if (err) return callback(err);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});
	};

	return this;
	
};