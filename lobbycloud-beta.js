#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var path = require("path");

/* require npm modules */
var express = require("express");
var sqlite3 = require("sqlite3").verbose();
var mustache_express = require("mustache-express");

/* require config */
var config = require(path.resolve(__dirname, "config.js"));

/* sugnup database */
var signupdb = new sqlite3.Database(path.resolve(__dirname, config.signupdb));

/* launche express */
var app = express();

/* configure */
app.engine('mustache', mustache_express());

app.use(express.bodyParser());

app.set('view engine', 'mustache');
app.set('views', path.resolve(__dirname, 'assets/views'));

/* serve assets */
app.use('/assets', express.static(__dirname + '/assets'));

/* routes */
app.get('/', function(req, res){
	res.render('beta', {
		"url": "http://localhost:3000",
		"invite": true
	});
});

app.post('/signup-beta', function(req, res){
	signupdb.run("INSERT INTO signup (date, name, email, motivation) VALUES (?, ?, ?, ?);", [
		parseInt((new Date()).getTime()/1000,10),
		req.body.name,
		req.body.email,
		req.body.motivation
	], function(err){
		res.render('beta', {
			"url": "http://localhost:3000",
			"thankyou": (err === null),
			"error": (err !== null)
		});
	});
});

app.all('*', function(req, res){
	res.redirect('/');
});

/* listen */
if (config.listen.hasOwnProperty("socket")) {

	var mask = process.umask(0);

	if (fs.existsSync(config.listen.socket)) {
		console.log("unlinking old socket");
		fs.unlinkSync(config.listen.socket);
	};
	
	app.listen(config.listen.socket, function(){
      if (mask) { process.umask(mask); mask = null; }
		console.log("server listening on socket", config.listen.socket);
	});
	
	/* gracefully shutdown on exit */
	process.on("exit", function(){
		app.close(function(){
			console.log("socket closed. bye.")
		});
	});
	
} else if (config.listen.hasOwnProperty("host")){
	app.listen(config.listen.host, config.listen.port, function(){
		console.log("server listening on", [config.listen.host, config.listen.port].join(":"));
	});	
} else {
	app.listen(config.listen.port, function(){
		console.log("server listening on", ["*", config.listen.port].join(":"));
	});
}
