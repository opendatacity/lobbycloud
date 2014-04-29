#!/usr/bin/env node

/* require node modules */
var path = require("path");

/* require npm modules */
var mongojs = require("mongojs");
var i18n = require("i18n");

/* require local modules */
var modules = {
	organisations: require("./organisations"),
	backendapi: require("./backendapi"),
	mockupdocs: require("./mockdocs"),
	mailqueue: require("./mailqueue"),
	invites: require("./invites"),
	topics: require("./topics"),
	users: require("./users"),
	queue: require("./queue"),
	lang: require("./lang"),
	elastic: require("./elastic")
};

/* get dirname of main module */
var __root = path.dirname(process.mainModule.filename);

/* the almighty lobbycloud module */
var Lobbycloud = function(config){

	var l = this;
		
	/* set up mongodb connection */
	var db = new mongojs(config.db);

	/* set up elasticsearch helper */
	this.elastic = new modules.elastic(config.elasticsearch);

	/* languages helper module */
	this.lang = new modules.lang();
	
	/* set up exported objects */
	this.invites = new modules.invites(path.resolve(__root, config.invitedb));
	this.mailqueue = new modules.mailqueue(config.mails, config.url);
	this.mockupdocs = new modules.mockupdocs();

	/* FIXME: this is a bit ridiculous, future plan: pass this and use that. */

	this.organisations = new modules.organisations(config, db, this.elastic);
	this.topics = new modules.topics(config, db, this.elastic);
	this.users = new modules.users(config, db, this.elastic, this.mailqueue, i18n);
	this.queue = new modules.queue(config, db, this.elastic, this.organisations, this.topics, this.users);

	this.backendapi = new modules.backendapi(this, i18n);

	return l;
	
};

/* always return new instance of Lobbycloud */
module.exports = function(config) {
	return (new Lobbycloud(config));
};
