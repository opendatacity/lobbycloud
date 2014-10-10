#!/usr/bin/env node

/* require node modules */
var path = require("path");

/* require npm modules */
var elasticsearch = require("elasticsearch");
var mongojs = require("mongojs");
var clone = require("clone");
var i18n = require("i18n");

var utils = require("./utils");

/* require local modules */
var modules = {
	organisations: require("./organisations"),
	backendapi: require("./backendapi"),
	mailqueue: require("./mailqueue"),
	documents: require("./documents"),
	invites: require("./invites"),
	elastic: require("./elastic"),
	topics: require("./topics"),
	users: require("./users"),
	queue: require("./queue"),
	lang: require("./lang")
};

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

/* the almighty lobbycloud module */
var Lobbycloud = function (config) {

	var l = this;

	l.stages = {
		UPLOADED: 0,
		PROCESSED: 1,
		FAILED: 2,
		ACCEPTED: 3,
		DECLINED: 4,
		CANCELLED: 5,
		canUpdate: function (stage) {
			return (stage <= 1)
		},
		canCancel: function (stage) {
			return (stage < 4);
		},
		canAccept: function (stage) {
			return (stage == 1);
		},
		canDecline: function (stage) {
			return (stage < 3);
		},
		isProcessed: function (stage) {
			return (stage === 1 || stage >= 3);
		}
	};

	/* set up mongodb connection */
	var db = new mongojs(config.db);

	/* set up elasticsearch connection */
	var es = new elasticsearch.Client(config.elasticsearch.connect);

	/* set up elasticsearch helper */
	l.elastic = new modules.elastic(config.elasticsearch, es);

	/* languages helper module */
	l.lang = new modules.lang();

	/* set up exported objects */
	l.invites = new modules.invites(path.resolve(__root, config.invitedb));
	l.mailqueue = new modules.mailqueue(config.mails, config.url);
	l.organisations = new modules.organisations(config, db, l.elastic);
	l.topics = new modules.topics(config, db, l.elastic);
	l.users = new modules.users(config, db, l.elastic, l.mailqueue, i18n);
	l.queue = new modules.queue(config, db, l);
	l.documents = new modules.documents(config, db, l);
	l.backendapi = new modules.backendapi(l, i18n);

	l.init = function (callback) {
		db.runCommand({ping: 1}, function (err, res) {
			if (!err && res.ok) {
				es.ping({
					// ping usually has a 100ms timeout
					requestTimeout: 1000
				}, function (error) {
					if (error) {
						callback("[Elasticsearch] " + error.toString());
					} else {
						//l.reindex(function(){});
						l.upgrade(callback)
					}
				});
			} else {
				callback("[MongoDB] " + (err ? err.toString() : null) || 'mongodb refused connection');
			}
		});
	};

	l.upgrade = function (callback) {
		l.documents.upgrade(function (err) {
			if (err) return callback(err);
			l.queue.upgrade(callback);
		});
	};

	l.reindex = function (callback) {
		l.documents.reindex(function () {
			l.organisations.reindex(function () {
				l.topics.reindex(callback);
			});
		});
	};

	l.prepareDoc = function (d, callback) {
		var doc = clone(d, false);
		l.topics.list(doc.topics, function (err, topics_data) {
			if (err) return callback(err);
			doc.topics = (doc.topics || []).filter(function (t) {
				return ((typeof t === "object") && (!t.hasOwnProperty("id") && t.hasOwnProperty("label")));
			});
			doc.topics = doc.topics.concat(topics_data);
			l.organisations.list(doc.organisations, function (err, organisations_data) {
				if (err) return callback(err);
				doc.organisations = (doc.organisations || []).filter(function (t) {
					return ((typeof t === "object") && (!t.hasOwnProperty("id") && t.hasOwnProperty("label")));
				});
				doc.organisations = doc.organisations.concat(organisations_data);
				callback(null, doc);
			});
		});
	};

	l.prepareDocs = function (docs, callback) {
		var result = [];
		utils.queue(docs, function (d, callback) {
			l.prepareDoc(d, function (err, doc) {
				if (err) return callback(err);
				result.push(doc);
				callback();
			});
		}, function () {
			callback(null, result);
		});
	};

	return l;

};

/* always return new instance of Lobbycloud */
module.exports = function (config) {
	return (new Lobbycloud(config));
};
