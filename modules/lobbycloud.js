#!/usr/bin/env node

/* require node modules */
var path = require("path");

/* require npm modules */
var elasticsearch = require("elasticsearch");
var mongojs = require("mongojs");
var i18n = require("i18n");

/* require local modules */
var modules = {
	organisations: require("./organisations"),
	backendapi: require("./backendapi"),
	mockupdocs: require("./mockdocs"),
	mailqueue: require("./mailqueue"),
	documents: require("./documents"),
	invites: require("./invites"),
	elastic: require("./elastic"),
	topics: require("./topics"),
	users: require("./users"),
	queue: require("./queue"),
	lang: require("./lang"),
};

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

/* the almighty lobbycloud module */
var Lobbycloud = function(config){

	var l = this;
			
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
	l.mockupdocs = new modules.mockupdocs();
	l.organisations = new modules.organisations(config, db, l.elastic);
	l.topics = new modules.topics(config, db, l.elastic);
	l.users = new modules.users(config, db, l.elastic, l.mailqueue, i18n);
	l.queue = new modules.queue(config, db, l.elastic, l.organisations, l.topics, l.users);
	l.documents = new modules.documents(config, db, es, l);
	l.backendapi = new modules.backendapi(l, i18n);

	return l;
	
};

/* always return new instance of Lobbycloud */
module.exports = function(config) {
	return (new Lobbycloud(config));
};
