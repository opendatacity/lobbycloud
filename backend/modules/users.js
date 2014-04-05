var userRoles = require('../assets/js/roles').userRoles;

var groups = ['Team Berlin', 'Team Archive'];

var mockupusers = [
	{
		id: 1,
		username: "user",
		password: "123",
		group: groups[1],
		role: userRoles.user
	},
	{
		id: 2,
		username: "admin",
		password: "123",
		superuser: true,
		group: groups[0],
		role: userRoles.admin
	},
	{
		id: 3,
		username: "user3",
		password: "123",
		group: groups[1],
		role: userRoles.user
	}
];

var Users = function () {
	var me = this;

	me.getGroups = function (cb) {
		cb(groups);
	};

	me.getUsers = function (cb) {
		var list = mockupusers.map(function (user) {
			return me.getUser(user);
		});
		cb(list);
	};

	var getUnusedID = function () {
		var id = 1;
		mockupusers.forEach(function (user) {
			if (id < user.id)
				id = user.id + 1;
		});
		return id;
	};

	me.addUser = function (edit_user, cb) {
		var user = {id: getUnusedID()};
		user.username = edit_user.username;
		user.group = edit_user.group;
		user.role = userRoles[edit_user.role];
		user.password = edit_user.password;
		console.log(user);
		mockupusers.push(user);
		cb(null, me.getUser(user));
	};

	me.editUser = function (edit_user, cb) {
		me.getUserById(edit_user.id, function (err, user) {
			if (!user)
				cb('Invalid User');
			else {
				user.username = edit_user.username;
				user.group = edit_user.group;
				if (edit_user.role)
					user.role = userRoles[edit_user.role.title];
				if (edit_user.password)
					user.password = edit_user.password;
				console.log(user);
				cb(null, me.getUser(user));
			}
		});
	};

	me.getUser = function (request_user) {
		return {
			id: request_user.id,
			username: request_user.username,
			role: request_user.role,
			group: request_user.group
		};
	};
	me.deleteUser = function (id, cb) {
		id = parseInt(id);
		me.getUserById(id, function (err, user) {
			if (!user)
				cb('Invalid User ID');
			else if (user.superuser) {
				cb('Un-de-le-table!');
			} else {
				mockupusers = mockupusers.filter(function (u) {
					return u.id !== user.id;
				});
				cb();
			}
		});
	};


	me.getUserById = function (id, cb) {
		var result = mockupusers.filter(function (user) {
			return (user.id === id);
		})[0];
		cb(null, result);
	};

	me.validateUser = function (username, password, cb) {
		var result = mockupusers.filter(function (user) {
			return (user.username === username) && (user.password === password);
		})[0];
		cb(null, result);
	};

};


module.exports = {
	Users: Users
};