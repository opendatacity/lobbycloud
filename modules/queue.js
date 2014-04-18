#!/usr/bin/env node

/** a queue for uploaded or received documents **/

/* require node modules */
var path = require("path");
var crypto = require("crypto");

/* require npm modules */
var mongojs = require("mongojs");

/* require local modules */
var topics = require("./topics");

module.exports = queue = function(config, db, es, organisations, topics, users){
	
	var queue = this;

	var cache = {};

	db.collection("queue").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("queue").ensureIndex("created", {"background": true});
	db.collection("queue").ensureIndex("stage", {"background": true});

	/* generate a random id for a document */
	queue.rand = function() {
		var key = [];
		var chrs = "abcdefghijklmnopqrstuvwxyz0123456789";
		var rnd = crypto.randomBytes(8);
		while (key.length < 8) key.push(chrs[rnd[key.length]%chrs.length]);
		return key.join("");
	};

	/* generate and check a random id for a queue item */
	queue.idgen = function(callback) {
		var id = queue.rand();
		queue.check(id, function(err, exists){
			if (err) return callback(err);
			if (exists) return queue.idgen(callback);
			callback(null, id);
		});
	};

	/* check queue length */
	queue.length = function(stage, callback){
		
		/* check if stage argument is given */
		if (typeof stage === "function") {
			var callback = stage;
			var stage = null;
		}
		
		/* devise statement according to query */
		if (stage instanceof Array) {
			/* get all stages */
			var find = {"stage": {"$in": stage}};
		} else if (typeof stage === "string" || typeof stage === "number") {
			/* get particular stage */
			var find = {"stage": stage};
		} else {
			/* get just everything */
			var find = {};
		}
		
		db.collection("queue").find(find, {_id: 1}, function(err, result){
			if (err) return callback(err);
			callback(null, result.length);
		});
	};


	/* check if a document exists */
	queue.check = function(id, callback){
		if (cache.hasOwnProperty(id)) return callback(null, true);
		db.collection("queue").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0));
		});
	};

	/* doc: {"file","topic","organisation","tags","comment","source"; "state"} */
	queue.add = function(data, callback) {
	
		/* 
			stages: 
			0: new, just received
			1: extracted ready for review
			2: reviewed and accepted
			3: reviewed and declined
		*/
	
		var doc = {
			"stage": 0,
			"data": {},
			"created": (new Date()),
			"updated": (new Date())
		};
		
		/* check if file is specified */
		if (!data.hasOwnProperty("file") || typeof data.file !== "string" || data.file === "") return callback(new Error("Queue Item has no file"));
		
		/* check if document has a vald user */
		if (!data.hasOwnProperty("user") || typeof data.user !== "string" || data.user === "") return callback(new Error("Queue Item has no user"));
		users.exists(data.user, function(err, exists, user_id){
			
			if (!err) return callback(err);
			if (!exists) return callback(new Error("Queue Item user does not exist"));
			
			doc.user = user_id;
			
			/* check if specified file exists */
			fs.exists(data.file, function(exists){
				if (!exists) return callback(new Error("Queue Item file does not exist"));

				doc.file = data.file;

				/* check for topic */
				if (data.hasOwnProperty("topic") && typeof data.topic === "string" || data.topic !== "") {
					doc.topic = data.topic;
				} else {
					doc.topic = null;
				}
		
				/* check for organisation */
				if (data.hasOwnProperty("organisation") && typeof data.organisation === "string" || data.organisation !== "") {
					doc.organisation = data.organisation;
				} else {
					doc.organisation = null;
				}
		
				/* check for comment */
				if (data.hasOwnProperty("comment") && typeof data.comment === "string" || data.comment !== "") {
					doc.comment = data.comment;
				} else {
					doc.comment = null;
				}
		
				/* check for tags */
				if (data.hasOwnProperty("tags")) {
					if (data.tags instanceof Array) {
						/* everything is fine */
					} else if (data.tags instanceof String) {
						if (data.tags === "") {
							doc.tags = [];
						} else {
							/* split by linefeeds, returns, pounds, commas and semicolons */
							doc.tags = data.tags.split(/[,;\r\n\#]+/g).map(function(tag){ return tag.replace(/^\s+|\s+$/g,'') });
							/* if there is only one tag, this wasn't effective. split by any whitespace then */
							if (doc.tags.length === 1) doc.tags = doc.tags[0].split(/\s+/g);
						}
					} else {
						/* nope */
						doc.tags = [];
					}
				} else {
					doc.tags = [];
				}
		
				/* check if an organisation exists */
				var check_organisation = function(callback) {
					if (doc.organisation === null) callback();
					organisations.check(doc.organisation, function(err, exists, org_id){
						if (err) {
							doc.organisation = null;
							return callback();
						} else if (exists) {
							doc.organisation = {"id": org_id};
						} else {
							doc.organisation = {"new": doc.organisation};
						}
						callback();
					});
				}
		
				/* check if an organisation exists */
				var check_topic = function(callback) {
					if (doc.topic === null) callback();
					topics.check(doc.topic, function(err, exists, topic_id){
						if (err) {
							doc.topic = null;
							return callback();
						} else if (exists) {
							doc.topic = {"id": topic_id};
						} else {
							doc.topic = {"new": doc.topic};
						}
						callback();
					});
				}
		
				check_organisation(function(){
					check_topic(function(){
				
						/* generate an id */
						queue.genid(function(err,id){
							if (err) return callback(err);
							doc.id = id;
							/* add to database and call back */
							db.collection("queue").save(doc, function(err, result){
								if (err) return callback(err);

								/* cache it */
								cache[topic.id] = result;
							
								/* call back */
								callback(null, result);
								
								/* extract */
								extractor.extract(doc.file, function(err, data){
									if (err) return console.log("extraction error", err);

									doc.data = data;

									/* update data */
									db.collection("topics").findAndModify({"query":{"id":doc.id},"update":{"$set":{
										stage: 1,
										data: doc.data,
										updated: (new Date())
									}},"new":true}, function(err, doc){
										if (err) return callback(err);

										/* update cache */
										cache[id] = doc;
									
										/* notify */
										if (typeof queue.notify === "function") queue.notify(doc.id, 1, doc);
									
									});
									
								});
							
							});
							
						});
				
					});
					
				});
		
			});
			
		});
		
	};
	
	/* get complete queue by stage */
	queue.all = function(stage, callback) {
		
		/* check if stage argument is given */
		if (typeof stage === "function") {
			var callback = stage;
			var stage = null;
		}
		
		/* devise statement according to query */
		if (stage instanceof Array) {
			/* get all stages */
			var find = {"stage": {"$in": stage}};
		} else if (typeof stage === "string" || typeof stage === "number") {
			/* get particular stage */
			var find = {"stage": stage};
		} else {
			/* get just everything */
			var find = {};
		}
		
		/* get from collection */
		db.collection("queue").find(find, function(err, result){
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

	return this;
	
};
