#!/usr/bin/env node

module.exports = function (es) {
	var me = this;

	me.create = function (type, obj, columns, callback) {
		var doc = obj;
		if (columns) {
			doc = {};
			columns.forEach(function (c) {
				doc[c] = obj[c];
			});
		}
		es.create({
			index: config.index,
			type: type,
			id: obj.id,
			body: doc
		}, function (err, resp) {
			if (err) console.log(err);
			if (callback) callback(err, resp);
		});
	};

	me.update = function (type, id, obj, columns, callback) {
		var doc = obj;
		if (columns) {
			doc = {};
			columns.forEach(function (c) {
				doc[c] = obj[c];
			});
		}
		es.update({
			index: config.index,
			type: type,
			id: id,
			body: obj
		}, function (err, resp) {
			if (err) console.log(err);
			if (callback) callback(err, resp);
		});
	};

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