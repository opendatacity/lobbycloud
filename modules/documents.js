#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var utils = require("./utils");

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

module.exports = documents = function (config, db, l) {

	var documents = this;

	var cache = {};

	var topics = l.topics;
	var organisations = l.organisations;

	db.collection("documents").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("documents").ensureIndex("created", {"background": true});
	/* waaaay more indexes! */

	documents.upgrade = function (cb) {
		/* fix documents without topics and organisations fields */
		db.collection("documents").find({"topics": {"$exists": false}}, function (err, result) {
			if (err) return;
			var _docs = [];
			result.forEach(function (doc) {
				doc.organisations = [doc.organisation];
				doc.topics = [doc.topic];
				_docs.push(doc);
			});
			l.prepareDocs(_docs, function (err, docs) {
				if (err) {
					console.log('[update docs] error resolving topics or organisation', err);
					return cb(err);
				}
				utils.queue(docs, function (doc, callback) {
					db.collection("documents").findAndModify({
						"query": {"id": doc.id}, "update": {
							"$set": {
								"topics": doc.topics.map(function (o) {
									return o.id;
								}),
								"organisations": doc.organisations.map(function (o) {
									return o.id;
								})
							},
							"$unset": {
								"topic": "",
								"organisation": ""
							}
						}, "new": true
					}, function (err, doc) {
						if (err) {
							console.log('[update docs] error updating topics or organisation', err);
							return cb(err);
						}
						/* update elasticsearch index */
						documents.index(doc.id, function (err) {
							if (err) {
								console.log('[update docs] error updating index for topics or organisation', err);
								return cb(err);
							}
							if (config.debug) console.log("[documents] fixed document [" + doc.id + "]");
							callback();
						});
					});
				}, cb);
			});
		});
	};

	/* check a document id */
	documents.checkid = function (id) {
		return /^([a-z0-9]{8})$/.test(id);
	};

	/* import a document from the queue */
	documents.import = function (id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		l.queue.check(id, function (err, exists) {
			if (err) return callback(err);
			if (!exists) return callback(new Error("not in queue"));
			l.queue.get(id, function (err, doc) {
				if (err) return callback(err);
				if (!doc.hasOwnProperty("stage") || doc.stage !== 3) return callback(new Error("queue item is not approved"));

				/* check if organisation is an id */
				if (doc.hasOwnProperty("organisations") && (!(doc.organisations instanceof Array))) return callback(new Error("organisations must be an array"));

				/* check if topic is an id */
				if (doc.hasOwnProperty("topics") && (!(doc.topics instanceof Array))) return callback(new Error("topcis must be an array"));

				/* check organisations for existance */
				var check_organisations = function (_callback) {
					if (doc.organisations.length === 0) return _callback(null);
					var _checked = 0;
					var _error = null;
					doc.organisations.forEach(function (organisation, index) {
						if (organisation.hasOwnProperty("new")) {
							/* create organisation */
							return l.organisations.add({
								name: organisation.new,
							}, function (err, org) {
								_checked++;
								if (err) {
									_error = new Error("organisation could not be created");
								} else {
									doc.organisations[index] = org.id;
								}
								if (_checked === doc.organisations.length) {
									_callback(_error);
								}
							});
						} else if (organisation.hasOwnProperty("id")) {
							organisations.check(organisation.id, function (err, exists) {
								_checked++;
								if (err) {
									_error = (new Error(err));
								} else if (!exists) {
									_error = (new Error("organisation does not exist"));
								}
								if (_checked === doc.organisations.length) {
									_callback(_error);
								}
							});
						} else {
							_checked++;
							_error = (new Error("organisation has to be created"));
							if (_checked === doc.organisations.length) {
								_callback(_error);
							}
						}
					});
				};

				/* check topics for existance */
				var check_topics = function (_callback) {
					if (doc.topics.length === 0) return _callback(null);
					var _checked = 0;
					var _error = null;
					doc.topics.forEach(function (topic, index) {
						if (topic.hasOwnProperty("new")) {
							/* create topic */
							return l.topics.add({
								name: topic.new,
							}, function (err, top) {
								_checked++;
								if (err) {
									_error = new Error("topic could not be created");
								} else {
									doc.topics[index] = top.id;
								}
								if (_checked === doc.topics.length) {
									_callback(_error);
								}
							});
						} else if (topic.hasOwnProperty("id")) {
							topics.check(topic.id, function (err, exists) {
								_checked++;
								if (err) {
									_error = (new Error(err));
								} else if (!exists) {
									_error = (new Error("topic does not exist"));
								}
								if (_checked === doc.topics.length) {
									_callback(_error);
								}
							});
						} else {
							_checked++;
							_error = (new Error("topic has to be created"));
							if (_checked === doc.topics.length) {
								_callback(_error);
							}
						}
					});
				};

				check_organisations(function (err) {
					if (err) return callback(err);
					check_topics(function (err) {
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
							topics: doc.topics,
							organisations: doc.organisations,
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
						}, function (err, result) {
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
	documents.index = function (id, callback) {
		if (typeof callback !== "function") var callback = function () {
		};
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		documents.get(id, function (err, doc) {
			if (err) return callback(err);
			l.elastic.delete('document', doc.id, function () {
				l.elastic.create('document', doc.id, {
					lang: doc.lang,
					user: doc.user,
					tags: doc.tags.join(','),
					topics: doc.topics.map(function (o) {
						return o.label;
					}).join(','),
					organisations: doc.organisations.map(function (o) {
						return o.label;
					}).join(','),
					created: doc.created,
					updated: doc.updated,
					text: doc.data.text
				}, function (err, resp) {
					if (err) {
						console.log("[documents] creation of search index for [" + doc.id + "] failed", err);
						return callback(err);
					}
					if (config.debug) console.log("[documents] created new search index for [" + doc.id + "]");

					// FIXME: seperate indexes for comments and notes

					/* update indexed flag */
					db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$set": {"indexed": true}}, "new": true}, function (err, doc) {
						if (err) return callback(err);
						/* update cache */
						cache[id] = doc;
						/* call back */
						callback(null);
					});
				});
			});
		});
	};

	/* recreate elastic search index for all documents */
	documents.reindex = function (callback) {
		db.collection("documents").find({}, {id: 1}, function (err, result) {
			if (result.length === 0) return callback();
			var ids = [];
			result.forEach(function (r) {
				ids.push(r.id);
			});
			utils.queue(ids, documents.index, callback);
		});
	};

	/* check if a document exists */
	documents.check = function (id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		if (cache.hasOwnProperty(id)) return callback(null, true, id);
		db.collection("documents").find({id: id}, {_id: 1}).limit(1, function (err, result) {
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};

	/* update a document */
	documents.update = function (id, data, callback) {
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		documents.get(id, function (err, doc) {
			if (err) return callback(err);

			var update = {};

			/* check tags */
			if (data.hasOwnProperty("tags")) {
				if (data.tags instanceof Array) {
					/* everything is fine */
					update.tags = data.tags;
				} else if (typeof data.tags === "string") {
					if (data.tags !== "") {
						/* split by linefeeds, returns, pounds, commas and semicolons */
						update.tags = data.tags.split(/[,;\r\n\#]+/g).map(function (tag) {
							return tag.replace(/^\s+|\s+$/g, '')
						});
						/* if there is only one tag, this wasn't effective. split by any whitespace then */
						if (update.tags.length === 1) update.tags = update.tags[0].split(/\s+/g);
					}
				}
				if ((update.tags) && (
					update.tags.filter(function (o) {
						return (typeof o === "string");
					}).length !== update.tags.length
					)) {
					return callback(new Error("invalid tag"));
				}
			}

			/* check for language */
			if (data.hasOwnProperty("lang")) {
				if (typeof data.lang === "string" && data.lang !== "" && l.lang.check(data.lang)) {
					update.lang = data.lang;
				} else
					return callback(new Error("invalid language"));
			}

			/* check for comment */
			if (data.hasOwnProperty("comment")) {
				if (typeof data.comment === "string" && data.comment !== "") {
					update.comment = data.comment;
				} else
					return callback(new Error("invalid language"));
			}

			/* check any unchecked organisation for its existance */
			var check_organisations = function (_callback) {
				if (!data.hasOwnProperty("organisations")) return _callback();
				if (!data.organisations instanceof Array) data.organisations = [data.organisations];
				update.organisations = [];
				utils.queue(data.organisations, function (organisation, cb) {
					var check = (typeof organisation === "object" && organisation.hasOwnProperty("id")) ? organisation.id : organisation;
					l.organisations.check(check, function (err, exists, org_id) {
						if ((err) || (!exists)) return callback(new Error("invalid organisation"));
						update.organisations.push(org_id);
						cb();
					});
				}, function () {
					update.organisations = data.organisations.filter(function (organisation) {
						return (organisation !== null);
					}).map(function (organisation) {
						return organisation.id;
					});
					_callback();
				});
			};

			/* check any unchecked topic for its existance */
			var check_topics = function (_callback) {
				if (!data.hasOwnProperty("topics")) return _callback();
				if (!data.topics instanceof Array) data.topics = [data.topics];
				update.topics = [];
				utils.queue(data.topics, function (topic, cb) {
					var check = (typeof topic === "object" && topic.hasOwnProperty("id")) ? topic.id : topic;
					l.organisations.check(check, function (err, exists, org_id) {
						if ((err) || (!exists)) return callback(new Error("invalid topic"));
						update.push(org_id);
						data.topics[index] = {"id": org_id};
						cb();
					});
				}, function () {
					update.topics = data.topics.filter(function (topic) {
						return (topic !== null);
					}).map(function (topic) {
						return topic.id;
					});
					_callback();
				});
			};

			check_organisations(function () {
				check_topics(function () {

					// FIXME: check if anything to update
					/* set last modified */
					update.modified = (new Date());

					db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$set": update}, "new": true}, function (err, doc) {
						if (err) return callback(err);
						/* update cache */
						cache[id] = doc;
						/* update elastic search */
						documents.index(doc.id, function (err) {
							if (err) {
								console.log('[update] error updating index for topics or organisation', err);
								return cb(err);
							}
							l.prepareDoc(doc, callback);
						});
					});
				});
			});
		});
	};

	/* delete a document */
	documents.delete = function (id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		callback(new Error("not implemented yet"));
	};

	/* get by id */
	documents.get = function (id, callback) {
		if (!documents.checkid(id)) return callback(new Error("invalid id"));
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("documents").findOne({id: id}, function (err, doc) {
			if (err) return callback(err);
			if (doc === null) return callback(new Error("document does not exist"));
			cache[id] = doc;
			l.prepareDoc(doc, callback);
		});
	};

	/* get complete documents by stage */
	documents.all = function (callback) {
		db.collection("documents").find({}, function (err, result) {
			if (err) return callback(err);
			if (result.length === 0) return callback(null, []);
			var documents = [];
			result.forEach(function (r) {
				/* add to result set */
				documents.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			l.prepareDocs(documents, function (err, docs) {
				callback(err, docs);
			});
		});
	};

	/* get latest topics */
	documents.latest = function (num, callback) {
		if (typeof num === "function") {
			var callback = num;
			var num = 1;
		}
		db.collection("documents").find().sort({"created": -1}).limit(num, function (err, result) {
			if (err) return callback(err);
			if (result.length === 0) return callback(null, []);
			result.forEach(function (r) {
				cache[r.id] = r;
			});
			l.prepareDocs(result, callback);
		});
	};

	/* get documents for user */
	documents.by_user = function (user_id, callback) {
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
		db.collection("documents").find(find, function (err, result) {
			if (err) return callback(err);
			if (result.length === 0) return callback(null, []);
			var list = [];
			result.forEach(function (r) {
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			l.prepareDocs(list, callback);
		});
	};

	/* get documents for topic */
	documents.by_topic = function (topic_id, callback) {
		/* devise statement according to query */
		if (topic_id instanceof Array) {
			/* get all stages */
			var find = {"topics": {"$in": topic_id}};
		} else if (typeof topic_id === "string") {
			/* get particular stage */
			var find = {"topics": topic_id};
		} else {
			/* nope */
			return callback(new Error("no topic specified"));
		}
		/* get from collection */
		db.collection("documents").find(find, function (err, result) {
			if (err) return callback(err);
			if (result.length === 0) return callback(null, []);
			var list = [];
			result.forEach(function (r) {
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});
			l.prepareDocs(list, callback);
		});
	};

	/* get documents for organisation */
	documents.by_organisation = function (organisation_id, callback) {

		/* devise statement according to query */
		if (organisation_id instanceof Array) {
			var find = {"organisations": {"$in": organisation_id}};
		} else if (typeof organisation_id === "string") {
			var find = {"organisations": organisation_id};
		} else {
			return callback(new Error("no organisation specified"));
		}

		/* get from collection */
		db.collection("documents").find(find, function (err, result) {
			if (err) return callback(err);
			if (result.length === 0) return callback(null, []);

			var list = [];
			result.forEach(function (r) {
				/* add to result set */
				list.push(r);
				/* add to cache */
				cache[r.id] = r;
			});

			l.prepareDocs(list, callback);
		});
	};

	/* add organisation data to an array of documents */
	documents.add_organisations = function (list, callback) {
		if (list.length === 0) return callback(null, list);
		var _completed = 0;
		var _total = 0;
		list.forEach(function (item) {
			_total += item.organisations.length;
		});
		list.forEach(function (item) {
			item.organisations_data = [];
			item.organisations.forEach(function (organisation) {
				l.organisations.get(organisation, function (err, organisation_data) {
					/* be fault tolerant */
					if (!err) item.organisations_data.push(organisation_data);
					_completed++;
					if (_completed === _total) {
						callback(null, list);
					}
				});
			});
		});
	};

	/* increments stats.views by one */
	documents.count_view = function (id) {
		db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$inc": {"stats.views": 1}}, "new": true}, function (err, doc) {
			if (err) return console.error("[document]", "count view", err);
			cache[id] = doc;
		});
	};

	/* increments stats.downloads by one */
	documents.count_download = function (id) {
		db.collection("documents").findAndModify({"query": {"id": id}, "update": {"$inc": {"stats.downloads": 1}}, "new": true}, function (err, doc) {
			if (err) return console.error("[document]", "count view", err);
			cache[id] = doc;
		});
	};

	/* returns a list of documents by ids */
	documents.list = function (ids, callback) {
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
			l.prepareDocs(list, callback);
		});
	};

	/* search documents */
	documents.search = function (q, callback) {
		l.elastic.search('document', q, 'text', function (err, hits) {
			if (err) return callback(err);
			var _hits = {};
			var ids = hits.map(function (hit) {
				_hits[hit.id] = hit;
				return hit.id;
			});
			if (ids.length === 0) return callback(null, []);
			documents.list(ids, function (err, result) {
				if (err) return callback(err);
				/* add score & highlights to result */
				result.map(function (r) {
					r.score = _hits[r.id].score;
					r.highlights = _hits[r.id].highlights;
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
