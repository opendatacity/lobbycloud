#!/usr/bin/env node

/* get node modules */
var fs = require("fs");

/* get local modules */
var keygen = require("./invitekeygen");

module.exports = invites = function(invitefile) {
		
	var invites = this;
	var codes = {};
	
	fs.exists(invitefile, function(ex){
		if (ex) codes = JSON.parse(fs.readFileSync(invitefile));
	});
	
	invites.save = function(callback){
		fs.writeFile(invitefile, JSON.stringify(codes), callback);
	};
	
	invites.create = function(num) {
		var num = (isNaN(parseInt(num,10)) || num < 1 || num > 1000) ? 1 : parseInt(num,10);
		var code = null;
		var created = [];
		for (var i = 0; i < num; i++) {
			do {
				code = keygen();
			} while(codes.hasOwnProperty(code));
			codes[code] = true;
			created.push(code);
		}
		invites.save();
		return created;
	};
	
	invites.check = function(code) {
		return (codes.hasOwnProperty(code) && codes[code]);
	};

	invites.spend = function(code) {
		if (invites.check(code)) {
			codes[code] = false;
			invites.save();
			return true;
		}
		return false;
	};

	invites.all = function() {
		return codes;
	};
	
	return invites;
	
}