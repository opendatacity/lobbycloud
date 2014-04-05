var Docs = function () {
	var me = this;

	var mockupDocs = [];
	for (var i = 0; i < 500; i++) {
		mockupDocs.push(
			{
				id: i,
				title: 'Title ' + i,
				abstract: 'Abstract ' + i,
				uploaded: (new Date()).valueOf(),
				flags: [
					'unchecked'
				]
			}
		);
	}

	me.getDocs = function () {
		return mockupDocs;
	};
};

module.exports = {
	Docs: Docs
};