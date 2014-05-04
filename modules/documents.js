#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

module.exports = documents = function(config, db, l){
	
	var documents = this;

	var cache = {};

	var topics = l.topics;
	var organisations = l.organisations;

	db.collection("documents").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("documents").ensureIndex("created", {"background": true});
	/* waaaay more indexes! */

	/* check a document id */
	documents.checkid = function(id) {
		return /^([a-z0-9]{8})$/.test(id);
	};

	/* import a document from the queue */
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
					if (doc.organisation.hasOwnProperty("new")) {
						/* create organisation */
						return l.organisations.add({
							name: doc.organisation.new,
						}, function(err, org){
							if (err) _callback(new Error("organisation could not be created"));
							doc.organisation = org.id;
							_callback(null);
						});
					};
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
					if (doc.topic.hasOwnProperty("new")) {
						/* create organisation */
						return l.topic.add({
							label: doc.topic.new,
						}, function(err, topic){
							if (err) _callback(new Error("topic could not be created"));
							doc.topic = topic.id;
							_callback(null);
						});
					};
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
						db.collection("documents").save({
							id: doc.id,
							indexed: false,
							user: doc.user,
							source: doc.source,
							created: doc.created,
							updated: (new Date()),
							orig: doc.orig,
							lang: doc.lang,
							tags: doc.tags,
							topic: ((doc.topic && doc.topic.hasOwnProperty("id")) ? doc.topic.id : null),
							organisation: ((doc.organisation && doc.organisation.hasOwnProperty("id")) ? doc.organisation.id : null),
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
		if (typeof callback !== "function") var callback = function(){};
		if (!documents.checkid(id)) return callback(new Error("invaild id"));
		documents.get(id, function(err, doc){
			if (err) return callback(err);
			l.elastic.create('document', doc.id,{
				lang: doc.lang,
				user: doc.user,
				tags: doc.tags.join(','),
				topic: doc.topic,
				organisation: doc.organisation,
				created: doc.created,
				updated: doc.updated
				,
				text: doc.data.text
			}, function(err,resp){
				if (err) return console.log("[documents] creation of search index for ["+doc.id+"] failed", err);
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
			if (result.length === 0) return callback(null, []);
			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			/* add organisations and topics */
			documents.add_organisations(list, function(err, list){
				documents.add_topics(list, function(err, list){
					callback(null, list);
				});
			});
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
			if (result.length === 0) return callback(null, []);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});

			/* add organisations and topics */
			documents.add_organisations(list, function(err, list){
				documents.add_topics(list, function(err, list){
					callback(null, list);
				});
			});
		});
		
	};
	
	/* get documents for topic */
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
			if (result.length === 0) return callback(null, []);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});

			/* add organisations and topics */
			documents.add_organisations(list, function(err, list){
				documents.add_topics(list, function(err, list){
					callback(null, list);
				});
			});
		});
	};
	
	/* get documents for organisation */
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
			if (result.length === 0) return callback(null, []);

			var list = [];
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});

			/* add organisations and topics */
			documents.add_organisations(list, function(err, list){
				documents.add_topics(list, function(err, list){
					callback(null, list);
				});
			});
		});
	};
	
	/* add organisation data to an array of organisations */
	documents.add_organisations = function(list, callback) {
		if (list.length === 0) return callback(null, list);
		var _completed = 0;
		list.forEach(function(item){
			l.organisations.get(item.organisation, function(err, org){
				/* be fault tolerant */
				if (!err) item.organisation_data = org;
				_completed++;
				if (_completed === list.length) {
					callback(null, list);
				}
			});
		});	
	};
	
	/* add topic data to an array of organisations */
	documents.add_topics = function(list, callback) {
		if (list.length === 0) return callback(null, list);
		var _completed = 0;
		list.forEach(function(item){
			l.topics.get(item.topic, function(err, topic){
				/* be fault tolerant */
				if (!err) item.topic_data = topic;
				_completed++;
				if (_completed === list.length) {
					callback(null, list);
				}
			});
		});	
	};
	
	/* add organisation data to an array of organisations */
	documents.add_organisation = function(item, callback) {
		if (!item.hasOwnProperty("organisation") || item.organisation === null) return callback(null, item);
		l.organisations.get(item.organisation, function(err, org){
			/* be fault tolerant */
			if (!err) item.organisation_data = org;
			callback(null, item);
		});
	};
	
	/* add topic data to an array of organisations */
	documents.add_topic = function(item, callback) {
		if (!item.hasOwnProperty("topic") || item.topic === null) return callback(null, item);
		l.topics.get(item.topic, function(err, topic){
			/* be fault tolerant */
			if (!err) item.topic_data = topic;
			callback(null, item);
		});
	};

	/* increments stats.views by one */
	documents.count_view = function(id, callback) {
		db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$inc": {"stats.views": 1}}, "new": true}, function (err, doc) {
			if (err) return console.error("[document]", "count view", err);
			cache[id] = doc;
		});
	};

	/* increments stats.downloads by one */
	documents.count_download = function(id, callback) {
		db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$inc": {"stats.downloads": 1}}, "new": true}, function (err, doc) {
			if (err) return console.error("[document]", "count view", err);
			cache[id] = doc;
		});
	};
	
	/* returns a list of documents by ids */
	documents.list = function(ids, callback) {
		var list = [];
		var query = [];
		ids.forEach(function (id) {
			if (cache.hasOwnProperty(id)) {
				list.push(cache[id]);
			} else {
				query.push(id);
			}
		});
		/* got all from cache? */
		if (query.length === 0) return callback(null, list);
		/* get rest from mongodb */
		db.collection("documents").find({id: {"$in": query}}, function (err, result) {
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

	documents.search = function(q, callback) {
		l.elastic.search('document', q, 'text', function (err, hits) {
			if (err) return callback(err);
			var ids = Object.keys(hits);
			if (ids.length === 0) return callback(null, []);
			documents.list(ids, function (err, result) {
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

	return this;
	
};
