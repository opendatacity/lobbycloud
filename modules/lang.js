#!/usr/bin/env node
module.exports = function(){
	var lang = this;
	var langs = {
		"en": "English",
		"de": "Deutsch",
		"fr": "Français",
		"es": "Español",
		"bg": "български",
		"cs": "Čeština",
		"da": "Dansk",
		"el": "Ελληνικά",
		"et": "Eesti",
		"fi": "Suomi",
		"ga": "Gaeilge",
		"hu": "Magyar",
		"it": "Italiano",
		"lt": "Lietuvių",
		"lv": "Latviešu",
		"mt": "Malti",
		"nl": "Nederlands",
		"pl": "Polski",
		"pt": "Português",
		"ro": "Română",
		"sk": "Slovenčina",
		"sl": "Slovenščina",
		"sv": "Svenska"
	};
	
	lang.codes = function(){
		return Object.keys(langs);
	};
	
	lang.check = function(l) {
		return langs.hasOwnProperty(l);
	};

	lang.get = function(l) {
		return langs[l];
	};

	lang.all = function() {
		var result= [];
		for (var key in langs) {
			if (langs.hasOwnProperty(key)) {
				result.push({id: key, label: langs[key]});
			}
		}
		return result;
	};

	return this;
}
