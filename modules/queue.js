#!/usr/bin/env node

/* 
 *	a queue for uploaded or received documents
 *
 *	stages: 
 *	0: new, just received
 *	1: extracted ready for review
 *	2: extraction failed
 *	3: reviewed and accepted
 *	4: reviewed and declined
 *	5: cancelled by user
 *
 */

/* require node modules */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

/* require local modules */
var extractor = require("./extractor");
var slugmaker = require("./slugmaker");

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

module.exports = queue = function(config, db, l){
	
	var queue = this;

	/* other modules */
	var organisations = l.organisations;
	var documents = l.documents;
	var topics = l.topics;
	var users = l.users;

	/* set up extractor */
	var ex = extractor(path.resolve(__root, config.storage), config.debug);

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
				if (data.hasOwnProperty("orig") && typeof data.orig === "string" && data.orig !== "") {
					doc.orig = data.orig;
				} else {
					doc.orig = null;
				}

				/* check for language */
				if (data.hasOwnProperty("lang") && typeof data.lang === "string" && data.lang !== "" && l.lang.check(data.lang)) {
					doc.lang = data.lang;
				} else {
					doc.lang = null;
				}
				
				/* check for source */
				if (data.hasOwnProperty("source") && typeof data.source === "string" && data.source !== "") {
					doc.source = data.source;
				} else {
					doc.source = null;
				}

				/* check for topics */
				doc.topics = [];
				if (data.hasOwnProperty("topic") && typeof data.topic === "string" && data.topic !== "") {
					doc.topics.push(data.topic);
				};
				if (data.hasOwnProperty("topics") && (data.topics instanceof Array)) {
					data.topics.forEach(function(topic){
						if (typeof topic === "string" && topic !== "") doc.topics.push(topic);
					});
				};
		
				/* check for organisations */
				doc.organisations = [];
				if (data.hasOwnProperty("organisation") && typeof data.organisation === "string" && data.organisation !== "") {
					doc.organisations.push(data.organisation);
				};
				if (data.hasOwnProperty("organisations") && (data.organisations instanceof Array)) {
					data.organisations.forEach(function(organisation){
						if (typeof organisation === "string" && organisation !== "") doc.organisations.push(organisation);
					});
				};
		
				/* check for comment */
				if (data.hasOwnProperty("comment") && typeof data.comment === "string" && data.comment !== "") {
					doc.comment = data.comment;
				} else {
					doc.comment = null;
				}
		
				/* check for tags */
				if (data.hasOwnProperty("tags")) {
					if (data.tags instanceof Array) {
						/* everything is fine */
						doc.tags = data.tags;
					} else if (typeof data.tags === "string") {
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
		
				/* check any organisation for its existance */
				var check_organisations = function(_callback) {
					if (doc.organisations.length === 0) return _callback();
					var _checked = 0;
					doc.organisations.forEach(function(organisation, index){
						organisations.check(organisation, function(err, exists, org_id){
							_checked++;
							if (err) {
								doc.organisations[index] = null;
							} else if (exists) {
								doc.organisations[index] = {"id": org_id};
							} else {
								doc.organisations[index] = {"new": doc.organisation};
							}
							if (_checked === doc.organisations.length) {
								doc.organisations.filter(function(organisation){ return (organisation !== null); });
								_callback();
							}
						});
					});
				};
		
				/* check any topic for its existance */
				var check_topics = function(_callback) {
					if (doc.topics.length === 0) return _callback();
					var _checked = 0;
					doc.topics.forEach(function(topic, index){
						topics.check(topic, function(err, exists, topic_id){
							_checked++;
							if (err) {
								doc.topics[index] = null;
							} else if (exists) {
								doc.topics[index] = {"id": topic_id};
							} else {
								doc.topics[index] = {"new": topic};
							}
							if (_checked === doc.topics.length) {
								doc.topics.filter(function(topic){ return (topic !== null); });
								_callback();
							}
						});
					});
				};
		
				check_organisations(function(){
					check_topics(function(){
				
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
											if (err) return console.error("[queue]", "extraction error", err); // FIXME: better error handling

											/* update cache */
											cache[id] = doc;

											/* notify */
											if (typeof queue.notify === "function") queue.notify(doc.id, 2, doc);

										});

										/* don't proceed */
										if (err) return console.error("[queue]", "extraction error", err); // FIXME: better error handling
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
	
	/* update (status) of queue element */
	/* updatable data: stage, tags, topic, organisation, lang, comment; only if stage <2 */
	queue.update = function(id, data, callback) {
		id = slugmaker(id);
		
		/* check if queue item exists */
		queue.check(id, function(err, exists){
			if (err || !exists) return callback((err || new Error("Thie queue item does not exist")));
			
			/* get doc to check stage */
			queue.get(id, function(err, doc){
				if (err) return callback(err);
				
				/* check stage */
				if (doc.stage > 1) return callback(new Error("The document can not be updated"));
								
				var update = {};
								
				/* check stage */
				if (data.hasOwnProperty("stage")) {
					data.stage = parseInt(data.stage,10);
					if (data.stage > 0 && data.stage <= 5) {
						update.stage = data.stage;
					}
				}
				
				/* check tags */
				if (data.hasOwnProperty("tags")) {
					if (data.tags instanceof Array) {
						/* everything is fine */
						update.tags = data.tags;
					} else if (typeof data.tags === "string") {
						if (data.tags !== "") {
							/* split by linefeeds, returns, pounds, commas and semicolons */
							update.tags = data.tags.split(/[,;\r\n\#]+/g).map(function(tag){ return tag.replace(/^\s+|\s+$/g,'') });
							/* if there is only one tag, this wasn't effective. split by any whitespace then */
							if (update.tags.length === 1) update.tags = update.tags[0].split(/\s+/g);
						}
					}
				}

				/* check for language */
				if (data.hasOwnProperty("lang") && typeof data.lang === "string" && data.lang !== "" && l.lang.check(data.lang)) {
					update.lang = data.lang;
				}

				/* check for comment */
				if (data.hasOwnProperty("comment") && typeof data.comment === "string" && data.comment !== "") {
					update.comment = data.comment;
				}

				/* check any unchecked organisation for its existance */
				var check_organisations = function(_callback) {
					if (!data.hasOwnProperty("organisations")) return _callback();
					if (!data.organisations instanceof Array) data.organisations = [data.organisations];
					var _checked = 0;
					data.organisations.forEach(function(organisation, index){
						if (typeof organisation === "object" && (organisation.hasOwnProperty("id") || organisation.hasOwnProperty("new"))) {
							_checked++;
							if (_checked === data.organisations.length) {
								update.organisations = data.organisations.filter(function(organisation){ return (organisation !== null); });
								_callback();
							}
						} else {
							organisations.check(organisation, function(err, exists, org_id){
								_checked++;
								if (err) {
									data.organisations[index] = null;
								} else if (exists) {
									data.organisations[index] = {"id": org_id};
								} else {
									data.organisations[index] = {"new": organisation};
								}
								if (_checked === data.organisations.length) {
									update.organisations = data.organisations.filter(function(organisation){ return (organisation !== null); });
									_callback();
								}
							});
						}
					});
				};
		
				/* check any unchecked topic for its existance */
				var check_topics = function(_callback) {
					if (!data.hasOwnProperty("topics")) return _callback();
					if (!data.topics instanceof Array) data.topics = [data.topics];
					var _checked = 0;
					data.topics.forEach(function(topic, index){
						if (typeof topic === "object" && (topic.hasOwnProperty("id") || topic.hasOwnProperty("new"))) {
							_checked++;
							if (_checked === data.topics.length) {
								update.topics=data.topics.filter(function(topic){ return (topic !== null); });
								_callback();
							}
						} else {
							topics.check(topic, function(err, exists, topic_id){
								_checked++;
								if (err) {
									data.topics[index] = null;
								} else if (exists) {
									data.topics[index] = {"id": topic_id};
								} else {
									data.topics[index] = {"new": topic};
								}
								if (_checked === data.topics.length) {
									update.topics=data.topics.filter(function(topic){ return (topic !== null); });
									_callback();
								}
							});
						}
					});
				};
		
				check_organisations(function(){
					check_topics(function(){

						// FIXME: check if anything to update
						/* set last modified */
						update.updated = (new Date());

						db.collection("queue").findAndModify({"query":{"id":id},"update":{"$set":update},"new":true}, function(err, doc){
							if (err) return callback(err);

							/* update cache */
							cache[id] = doc;

							/* call back */
							callback(null, doc);

						});

					});
				});
				
			});
			
		});
		
	};

	/* accept */
	queue.accept = function(id, callback) {
		queue.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("this queue element does not exist"));
			queue.get(id, function(err, doc){
				if (err) return callback(err);
				
				/* check for stage */
				if (doc.stage !== 1) return callback(new Error("this queue element cannot be accepted"));
				
				/* check if organisations are set */
				if (!doc.hasOwnProperty("organisations") ||
					doc.organisations == null ||
					doc.organisations.length ==0 ||
					doc.organisations.filter(function(o){return o.id}).length!==doc.organisations.length
				) return callback(new Error("organisations must be specified"));

				/* check if topics are set */
				if (!doc.hasOwnProperty("topics") ||
					doc.topics == null ||
					doc.topics.length ==0 ||
					doc.topics.filter(function(o){return o.id}).length!==doc.topics.length
				) return callback(new Error("topics must be specified"));


				/* update to stage 3 */
				queue.update(id, {stage: 3}, function(err, doc){
					if (err) return callback(err);

					/* import document */
					l.documents.import(id, function(err){
						if (err) {
							/* roll back stage */
							if (config.debug) console.error("[queue] failed accepting", id);
							if (config.debug) console.error("[queue]", err);
							// FIXME: update manually
							
							return db.collection("queue").findAndModify({"query":{"id":id},"update":{"$set":{"stage":1}},"new":true}, function(_err, doc){
								if (_err) {
									/* we are in deep trouble now */
									console.error("[queue]", "could not roll back stage for queue item", id)
									console.error("[queue]", _err);
									return callback(_err); 
								}
								/* update cache */
								cache[id] = doc;

								/* call back with original error */
								callback(err);

							});
							
						};
						
						/* yay */
						if (config.debug) console.log("[queue]", "accepted", id);
						callback(null, id);
					});
				});
			});
		});
	};
	
	/* decline */
	queue.decline = function(id, callback) {
		queue.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("this queue element does not exist"));
			queue.get(id, function(err, doc){
				if (err) return callback(err);
				if (doc.stage >= 3) return callback("this queue element cannot be declined");
				queue.update(id, {stage: 4}, function(err, doc){
					if (err) return callback(err);
					if (config.debug) console.log("[queue]", "declined", id);
					callback(null, id);
				});
			});
		});
	};

	/* cancel */
	queue.cancel = function(id, callback) {
		queue.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("this queue element does not exist"));
			queue.get(id, function(err, doc){
				if (err) return callback(err);
				if (doc.stage >= 3) return callback("this queue element cannot be cancelled");
				queue.update(id, {stage: 5}, function(err, doc){
					if (err) return callback(err);
					if (config.debug) console.log("[queue] cancelled", id);
					callback(null, id);
				});
			});
		});
	};

	/* don't use this un public, update queue element to stage 4 or 5 instead */
	queue.delete = function(id, callback) {
		queue.get(id, function(err, doc){
			if (err) return callback(err);
			/* get all files to delete */
			var files = [];
			files.push(doc.file);
			files.push(doc.data.hashthumb);
			doc.data.thumbs.forEach(function(thumb){
				files.push(thumb.file);
			});
			doc.data.images.forEach(function(image){
				files.push(image.file);
			});
			/* delete from mongodb */
			db.collection("queue").remove({id: id}, true, function(err, res){
				if (err) return callback(err);
				/* delete from cache */
				if (cache.hasOwnProperty(id)) delete cache[id];
				/* delete files */
				var counter = files.length;
				files.forEach(function(file){
					fs.unlink(path.resolve(__root, config.storage, file), function(err){
						if (err) console.log("[queue]","could not delete", file, err); // FIXME: deal with undeleted files
						counter--;
						if (counter === 0) {
							/* call back */
							callback(null);
						}
					});
				});
			});
		});
	};
	
	/* clean accepted, cancelled and declined elements from queue */
	queue.clean = function(callback) {
		callback(true); // FIXME: implement this for realz
	}

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
		db.collection("queue").find(find).sort({"created": -1}, function(err, result){
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
