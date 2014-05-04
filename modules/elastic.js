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
//		console.log(type, config.index, id, obj);
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
					if (callback) callback(err);
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

	/* fuzzy & wildcard search by type, text in the specified es search entry properties */
	me.suggest = function (type, query, fields, callback) {
		es.search(
			{
				index: config.index,
				type: type,
				body: {
					"query": {
						"query_string": {
							"fields": fields,
							"query": query + '*~',
							"fuzzy_prefix_length": 3,
							analyze_wildcard: true
						}
					}
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

	me.search = function (type, query, field, callback) {


		var highlight = {"fields": {}};
		highlight.fields[field] = {"number_of_fragments": 3};

		es.search(
			{
				index: config.index,
				type: type,
				body: {
					"query": {
						"query_string": {
							"fields": [field],
							"query": query
						}
					},
					"highlight": highlight
				}
			},
			function (err, result) {
				if (err) return callback(err);

				result = result.hits;

				if (result.total === 0) return callback(null, []);

				var r = result.hits.map(function (hit) {
					return {
						id: hit._id,
						score: hit._score,
						highlights: hit.highlight[field]
					};
				});
				callback(err, r);
			}
		);
	};

	return me;
};