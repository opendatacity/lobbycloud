#!/usr/bin/env node

/* get node modules */
var crypto = require("crypto");

/* generate a fairly pronouncable invite key */
var invitekeygen = module.exports = function(len) {
	len = len || 10;
	var key = [];
	var chrs = ["bcdfghjklmnprstvwxz","aeiou"];
	var rnd = crypto.randomBytes(len);
   while (key.length < len) key.push(chrs[(key.length%2)][rnd[key.length]%chrs[(key.length%2)].length]);
	return key.join("");
};
