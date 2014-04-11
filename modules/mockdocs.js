module.exports = function () {
	var me = this;

	var mockupDocs = [];
	for (var i = 0; i < 500; i++) {
		mockupDocs.push(
			{
				id: i,
				title: 'Title ' + i,
				abstract: 'Abstract ' + i,
				uploaded: (new Date()).valueOf() - Math.round( Math.random() * 1000 * 60 * 60 * 60 * 60),
				tags: [
					'untagged'
				]
			}
		);
	}

	me.listDocs = function (cb) {
		cb(null, mockupDocs);
	};

	return me;
};