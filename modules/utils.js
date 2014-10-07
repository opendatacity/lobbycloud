var async = require("async");

module.exports = {

	queue: function (list, exec, final, concurrency) {
		var q = async.queue(exec, concurrency || 1);
		q.drain = final;
		q.push(list);
	}

};
