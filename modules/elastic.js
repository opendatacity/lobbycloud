#!/usr/bin/env node

module.exports = function (config, es) {
	var me = this;

	me.es = es;

	/* strips down an obj to the specified properties */
	me.prepareFieldsObj = function (obj, fields) {
		var doc = obj;
		if (fields) {
			doc = {};
			fields.forEach(function (c) {
				doc[c] = obj[c];
			});
		}
		return doc;
	};

	/* checks if obj has min one field for the search */
	me.hasUpdateField = function (obj, fields) {
		for (var i = 0; i < fields.length; i++) {
			if (obj.hasOwnProperty(fields[i]))
				return true;
		}
		return false;
	};

	/* creates an es search entry */
	me.create = function (type, id, obj, callback) {
		es.create({
			index: config.index,
			type: type,
			id: id,
			body: obj
		}, function (err, resp) {
			if (err) console.log(err);
			if (callback) callback(err, resp);
		});
	};

	/* upserts the properties of an es search entry */
	/* data is ONLY inserted if no entry exists. no updating fields is performed */
	me.upsert = function (type, id, obj, callback) {
		console.log(type, config.index, id, obj);
		es.update({
			index: config.index,
			type: type,
			id: id,
			body: {upsert: obj}
		}, function (err, resp) {
			if (err) console.log(err);
			if (callback) callback(err, resp);
		});
	};

	/* updates the properties of an es search entry, if the entry does not exists, one will be created */
	me.update = function (type, id, obj, callback) {
		es.update({
			index: config.index,
			type: type,
			id: id,
			body: {doc: obj}
		}, function (err, resp) {
			if (err) {
				if (err.status == 404) {
					me.create(type, id, obj, callback);
				} else {
					console.log(err);
					callback(err);
				}
			} else if (callback) {
				callback(err, resp);
			}
		});
	};

	/* deletes an es search entry */
	me.delete = function (type, id, callback) {
		/* remove from elasticsearch */
		es.delete({
			index: config.index,
			type: type,
			id: id,
		}, function (err, resp) {
			if (err) console.log(err);
			if (callback) callback(err, resp);
		});
	};

	/* fuzzy search by type, text in the specified es search entry properties */
	me.search = function (type, query, fields, callback) {

		var queries = [
			{
				"fuzzy_like_this": {
					"fields": fields.map(function (f) {
						return type + '.' + f
					}), //A list of the fields to run the more like this query against. Defaults to the _all field.
					"like_text": query, //The text to find documents like it, required.
					"ignore_tf": false, //Should term frequency be ignored. Defaults to false.
					"max_query_terms": 25, //The maximum number of query terms that will be included in any generated query. Defaults to 25.
					"fuzziness": 0.5, //The minimum similarity of the term variants. Defaults to 0.5
					"prefix_length": 0, // Length of required common prefix on variant terms. Defaults to 0.
					"boost": 1.0 // Sets the boost value of the query. Defaults to 1.0.
				}
			}
		];

		es.search(
			{
				index: config.index,
				type: type,
				body: {
					"query": {
						"bool": {
							"must": [],
							"must_not": [],
							"should": queries
						}
					}//,
//						"from":0,
//						"size":10,
//						"sort":[],
//						"facets":{}
				}
			},
			function (err, result) {
				if (err) return callback(err);

				result = result.hits;

				if (result.total === 0) return callback(null, []);

				var searchresult = {};

				result.hits.forEach(function (hit) {
					searchresult[hit._id] = hit._score;
				});

				callback(err, searchresult);
			}
		);
	};

	return me;
};