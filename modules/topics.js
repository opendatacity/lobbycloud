#!/usr/bin/env node

/* require npm modules */
var elasticsearch = require("elasticsearch");
var mongojs = require("mongojs");

/* require local modules */
var slugmaker = require("./slugmaker");

module.exports = function(opts){

	var topics = this;

	/* set up mongodb */
	var db = new mongojs(opts.db);

	/* set up elasticsearch */
	var es = new elasticsearch.Client(opts.elasticsearch.connect);
	
	var cache = {};

	db.collection("topics").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("topics").ensureIndex("created", {"background": true});

	/* check if a topic exists */
	topics.check = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, true);
		db.collection("topics").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};
	
	/* add a topic */
	topics.add = function(data, callback){

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
		
		topics.check(topic.id, function(err, exists){
			if (err) return callback(err);
			if (exists) return callback(new Error("Topic already exists"));
			
			/* insert topic to database */
			db.collection("topics").save(topic, function(err, result){
				if (err) return callback(err);

				/* cache it */
				cache[topic.id] = result;

				/* add to elasticsearch */
				es.create({
					index: opts.elasticsearch.index,
					type: 'topic',
					id: topic.id,
					body: {
						label: data.label,
						subject: data.subject
					}
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null, result);
				});
			});
		});
	};

	/* delete a topic */
	topics.delete = function(id, callback){
		id = slugmaker(id);

		/* check if topic exists */
		topics.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(null); // be graceful

			db.collection("topics").remove({id: id}, true, function(err, res){
				if (err) return callback(err);

				/* remove from cache */
				if (cache.hasOwnProperty(id)) delete cache[id];

				/* remove from elasticsearch */
				es.delete({
					index: opts.elasticsearch.index,
					type: 'topic',
					id: id,
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null);
				});
			});
		});
	};

	/* update a topic */
	topics.update = function(id, data, callback){

		id = slugmaker(id);

		var update = {};
		if (data.hasOwnProperty("label")) update.label = data.label;
		if (data.hasOwnProperty("subject")) update.subject = data.subject;
		if (data.hasOwnProperty("description")) update.description = data.description;

		/* check if nothing to update */
		if (Object.keys(update).length === 0) return callback(null);
		
		/* check if topic exists */
		topics.check(topic.id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("Topic does not exists"));
		
			/* update database */
			db.collection("topics").findAndModify({"query":{"id":id},"update":{"$set":update},"new":true}, function(err, doc){
				if (err) return callback(err);

				/* update cache */
				cache[id] = doc;
				
				/* check if elasticsearch doesn't need an update */
				if (!update.hasOwnProperty("label") && !update.hasOwnProperty("subject")) return callback(null, doc);
				
				/* update elasticsearch index */
				es.update({
					index: opts.elasticsearch.index,
					type: 'topic',
					id: topic.id,
					body: {
						doc: {
							label: update.label,
							subject: update.subject
						}
					}
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null, doc);
				});
			});
		});
		
	};

	/* get a topic by id */
	topics.get = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("topics").findOne({id: id}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("Topic does not exist"));
			cache[id] = result;
			callback(null, result);
		});
	};

	/* get topics by an array of ids */
	topics.list = function(ids, callback){
		var list = [];
		var query = [];
		ids.forEach(function(id){
			if (cache.hasOwnProperty(id)) {
				list.push(cache[id]);
			} else {
				query.push(id);
			}
		});
		/* got all from cache? */
		if (query.length === 0) return callback(null, list);
		/* get rest from mongodb */
		db.collection("topics").find({id: {"$in": query}}, function(err, result){
			if (err) return callback(err);
			result.forEach(function(r){
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			callback(null, list);
		});
		
	};

	/* get all topics — rather don't use this */
	topics.all = function(callback) {
		db.collection("topics").find(function(err,results){
			if (err) return callback(err);
			results.forEach(function(user){
				cache[user.id] = user;
			});
			callback(null, results);
		});
	};

	/* find topics by a query on label and subject */
	topics.find = function(q, callback){
		es.search({
			q: q,
			index: opts.elasticsearch.index,
			type: 'topic',
		}, function (err, result) {
			if (err) return callback(err);
			if (result.hits.total === 0) return callback(null, []);

			var hits = {};
			result.hits.hits.forEach(function(hit){
				hits[hit._id] = hit._score;
			});
			
			topics.list(Object.keys(hits), function(err, result){

				if (err) return callback(err);

				/* add score to result */
				result.map(function(r){ r.score = hits[r.id]; });
				
				/* sort by score */
				result.sort(function(a,b){ return (b.score-a.score) });
				
				/* call back */
				callback(null, result);
				
			});
			
		});
	};

	return topics;

};
