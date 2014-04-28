#!/usr/bin/env node

/** a queue for uploaded or received documents **/

/* require node modules */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

/* require npm modules */
var mongojs = require("mongojs");

/* require local modules */
var extractor = require("./extractor");
var slugmaker = require("./slugmaker");

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

module.exports = queue = function(config, db, es, organisations, topics, users){
	
	var queue = this;

	/* set up extractor */
	var ex = extractor(path.resolve(__root, config.storage));

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
		if (cache.hasOwnProperty(id)) return callback(null, true, id);
		db.collection("queue").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};

	/* doc: {"file","topic","organisation","tags","comment","user","source";"state"} */
	queue.add = function(data, callback) {
	
		/* 
			stages: 
			0: new, just received
			1: extracted ready for review
			2: extraction failed
			3: reviewed and accepted
			4: reviewed and declined
			5: cancelled by user
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
		users.check(data.user, function(err, exists, user_id){

			if (err) return callback(err);
			if (!exists) return callback(new Error("Queue Item user does not exist"));
			
			doc.user = user_id;
			
			/* check if specified file exists */
			fs.exists(path.resolve(__root, config.storage, data.file), function(exists){
				if (!exists) return callback(new Error("Queue Item file does not exist"));

				doc.file = data.file;

				/* check for original filename */
				if (data.hasOwnProperty("orig") && typeof data.source === "orig" || data.source !== "") {
					doc.orig = data.orig;
				} else {
					doc.orig = null;
				}

				/* check for source */
				if (data.hasOwnProperty("source") && typeof data.source === "string" || data.source !== "") {
					doc.source = data.source;
				} else {
					doc.source = null;
				}

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
				var check_organisation = function(_callback) {
					if (doc.organisation === null) return _callback();
					organisations.check(doc.organisation, function(err, exists, org_id){
						if (err) {
							doc.organisation = null;
							return _callback();
						} else if (exists) {
							doc.organisation = {"id": org_id};
						} else {
							doc.organisation = {"new": doc.organisation};
						}
						_callback();
					});
				}
		
				/* check if an organisation exists */
				var check_topic = function(_callback) {
					if (doc.topic === null) return _callback();
					topics.check(doc.topic, function(err, exists, topic_id){
						if (err) {
							doc.topic = null;
							return _callback();
						} else if (exists) {
							doc.topic = {"id": topic_id};
						} else {
							doc.topic = {"new": doc.topic};
						}
						_callback();
					});
				}
		
				check_organisation(function(){
					check_topic(function(){
				
						/* generate an id */
						queue.idgen(function(err,id){
							if (err) return callback(err);
							doc.id = id;

							/* add to database and call back */
							db.collection("queue").save(doc, function(err, result){

								if (err) return callback(err);

								/* cache it */
								cache[doc.id] = result;
							
								/* call back */
								callback(null, result);
								
								/* extract */
								ex.extract(path.resolve(__root, config.storage, doc.file), function(err, data){
									if (err) {

										/* set database to failed extraction */
										db.collection("queue").findAndModify({"query":{"id":doc.id},"update":{"$set":{
											stage: 2,
											data: {
												error: err.message
											},
											updated: (new Date())
										}},"new":true}, function(err, doc){
											if (err) return console.log("extraction error", err); // FIXME: better error handling

											/* update cache */
											cache[id] = doc;

											/* notify */
											if (typeof queue.notify === "function") queue.notify(doc.id, 2, doc);

										});

										/* don't proceed */
										return console.log("extraction error", err); // FIXME: better error handling
									}

									console.log("[queue]", "convert finished for doc", doc.id);

									doc.data = data;

									/* update data */
									db.collection("queue").findAndModify({"query":{"id":doc.id},"update":{"$set":{
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
	
	/* get by id */
	queue.get = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("queue").findOne({id: id}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("Queue item does not exist"));
			cache[id] = result;
			callback(null, result);
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

	/* get queue for user */
	queue.user = function(user, callback) {

		/* devise statement according to query */
		if (user instanceof Array) {
			/* get all stages */
			var find = {"user": {"$in": user}};
		} else if (typeof user === "string") {
			/* get particular stage */
			var find = {"user": user};
		} else {
			/* nope */
			return callback(new Error("No user specified"));
		}
		
		// FIXME: cache the result
		
		/* get from collection */
		db.collection("queue").find(find, function(err, result){
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
	}

	return this;
	
};
