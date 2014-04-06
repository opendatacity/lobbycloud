var Docs = function () {
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
					'unchecked'
				]
			}
		);
	}

	me.getDocs = function (cb) {
		cb(null, mockupDocs);
	};
};

module.exports = {
	Docs: Docs
};