#!/usr/bin/env node

/* require npm modules */
var elasticsearch = require("elasticsearch");
var validator = require("validator");
var mongojs = require("mongojs");
var _ = require("underscore");

/* require local modules */
var slugmaker = require("./slugmaker");

module.exports = orgs = function(opts, db, es){

	var organisations = this;

	var cache = {};

	db.collection("organisations").ensureIndex("id", {"unique": true, "background": true, "dropDups": true});
	db.collection("organisations").ensureIndex("created", {"background": true});

	/* check if organisation exists */
	organisations.check = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, true);
		db.collection("organisations").find({id: id}, {_id: 1}).limit(1, function(err, result){
			if (err) return callback(err);
			callback(null, (result.length > 0), id);
		});
	};
	
	/* add an organisation */
	organisations.add = function(data, callback){

		/* organisation object: id, name, fullname, description, url, logo, created */

		/* check if name was specified */
		if (!data.hasOwnProperty("name") || typeof data.name !== "string" || data.name === "") return callback(new Error("Organisation has no name"));
		
		/* check supplied url */
		if (data.url && !data.url.match(/^(http|https):\/\//)) data.url = "http://"+data.url;
		if (data.url && !validator.isURL(data.url, {
			protocols: ['http','https'],
			require_tld: true,
			require_protocol: true
		})) data.url = false;

		/* check supplied logo url */
		if (data.logo && !data.url.match(/^(http|https):\/\//)) data.logo = "http://"+data.logo;
		if (data.logo && !validator.isURL(data.logo, {
			protocols: ['http','https'],
			require_tld: true,
			require_protocol: true
		})) data.logo = false;
		
		var org = {
			id: slugmaker(data.name),
			name: data.name,
			fullname: (data.fullname || data.name),
			description: (data.description || ""),
			url: data.url,
			logo: data.logo,
			created: (new Date())
		}
		
		organisations.check(org.id, function(err, exists){
			if (err) return callback(err);
			if (exists) return callback(new Error("Organisation already exists"));
			
			/* insert organisation to database */
			db.collection("organisations").save(org, function(err, result){
				if (err) return callback(err);

				/* cache it */
				cache[org.id] = result;

				/* add to elasticsearch */
				es.create({
					index: opts.elasticsearch.index,
					type: 'organisation',
					id: org.id,
					body: {
						name: data.name,
						fullname: data.fullname
					}
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null, result);
				});
			});
		});
	};

	/* delete an organisation */
	organisations.delete = function(id, callback){
		id = slugmaker(id);

		/* check if organisation exists */
		organisations.check(id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(null); // be graceful
		

			db.collection("organisations").remove({id: id}, true, function(err, res){
				if (err) return callback(err);

				/* remove from cache */
				if (cache.hasOwnProperty(id)) delete cache[id];

				/* remove from elasticsearch */
				es.delete({
					index: opts.elasticsearch.index,
					type: 'organisation',
					id: id,
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null);
				});
			});
		});
	};

	/* update an organisation */
	organisations.update = function(id, data, callback){

		id = slugmaker(id);

		var update = {};
		if (data.hasOwnProperty("name")) update.name = data.name;
		if (data.hasOwnProperty("fullname")) update.fullname = data.fullname;
		if (data.hasOwnProperty("description")) update.description = data.description;
		if (data.hasOwnProperty("url") && validator.isURL(data.url, {protocols: ['http','https'], require_tld: true, require_protocol: true})) update.url = data.url;
		if (data.hasOwnProperty("logo") && validator.isURL(data.url, {protocols: ['http','https'], require_tld: true, require_protocol: true})) update.logo = data.logo;

		/* check if nothing to update */
		if (Object.keys(update).length === 0) return callback(null);
		
		/* check if organisation exists */
		organisations.check(org.id, function(err, exists){
			if (err) return callback(err);
			if (!exists) return callback(new Error("Organisation does not exists"));
		
			/* update database */
			db.collection("organisations").findAndModify({"query":{"id":id},"update":{"$set":update},"new":true}, function(err, doc){
				if (err) return callback(err);

				/* update cache */
				cache[id] = doc;
				
				/* check if elasticsearch doesn't need an update */
				if (!update.hasOwnProperty("name") && !update.hasOwnProperty("fullname")) return callback(null, doc);
				
				/* update elasticsearch index */
				es.update({
					index: opts.elasticsearch.index,
					type: 'organisation',
					id: org.id,
					body: {
						doc: {
							name: update.name,
							fullname: update.fullname
						}
					}
				}, function (err, resp) {
					if (err) return callback(err);
					callback(null, doc);
				});
			});
		});
		
	};

	/* get an organisation by id */
	organisations.get = function(id, callback){
		id = slugmaker(id);
		if (cache.hasOwnProperty(id)) return callback(null, cache[id]);
		db.collection("organisations").findOne({id: id}, function(err, result){
			if (err) return callback(err);
			if (result === null) return callback(new Error("Organisation does not exist"));
			cache[id] = result;
			callback(null, result);
		});
	};

	/* get organisations by an array of ids */
	organisations.list = function(ids, callback){
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
		db.collection("organisations").find({id: {"$in": query}}, function(err, result){
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

	/* get all organisations — rather don't use this */
	organisations.all = function(callback) {
		db.collection("organisations").find(function(err,results){
			if (err) return callback(err);
			results.forEach(function(user){
				cache[user.id] = user;
			});
			callback(null, results);
		});
	};

	/* find organisations by a query on name and fullname */
	organisations.find = function(q, callback){
		es.search({
			q: q,
			index: opts.elasticsearch.index,
			type: 'organisation',
		}, function (err, result) {
			if (err) return callback(err);
			if (result.hits.total === 0) return callback(null, []);

			var hits = {};
			result.hits.hits.forEach(function(hit){
				hits[hit._id] = hit._score;
			});
			
			organisations.list(Object.keys(hits), function(err, result){

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

	return organisations;

};
