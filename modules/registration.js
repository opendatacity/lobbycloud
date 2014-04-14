#!/usr/bin/env node

/* get node modules */
var nodemailer = require("nodemailer");
var path = require("path");
var async = require("async");
var fs = require("fs");
var crypto = require("crypto");
var mustache = require("mustache");

module.exports = registration = function (users, config) {

	var transport = nodemailer.createTransport(config.transport.name, config.transport);

	var registration = this;
	var tasks = [];

	fs.exists(config.dbfile, function (ex) {
		if (ex) codes = JSON.parse(fs.readFileSync(config.dbfile));
	});

	var emailbody = fs.readFileSync(path.resolve(__dirname, '../assets/views/validationmail.mustache')).toString();

	//TODO: start all not sent email tasks

	var exeeds = function (date, period) {
		if (!date) return false;
		return ((new Date()) - date > period);
	};

	var sendmail = function (task, cb) {
		var mailOptions = {
			from: config.senderadress, // sender address
			to: config.debug ? config.from : task.email,
			subject: "[LobbyCloud] Please verify your email '" + task.email + "'", //FIXME: Translate Subject line
			text: mustache.render(emailbody, {html: false, key: task.linkkey, email: task.email}),
			html: mustache.render(emailbody, {html: true, key: task.linkkey, email: task.email})
		};

		transport.sendMail(mailOptions, function (error, response) {
			if (error) { //FIXME: logging
				console.log("Message NOT sent:", error);
			} else {
				console.log("Message sent:", response);
			}
			cb(error);
		});
	};

	var queue = async.queue(function (task, callback) {
		task.sent = new Date();
		registration.save();
		sendmail(task, function (err) {
			//TODO: try resend and then give up
			callback();
		});
	}, config.maxqueueworker);

	registration.cleanup = function () {
		tasks = tasks.filter(function (t) {
			return (!exeeds(t.sent, config.expiredperiod));
		});
	};

	registration.save = function (callback) {
		fs.writeFile(config.dbfile, JSON.stringify(tasks), callback);
	};

	registration.send = function (user, cb) {
		if (!cb) cb = function () {
		};
		var task = tasks.filter(function (t) {
			return t.email === user.email;
		})[0];
		if (task) {
			if (!task.sent) {
				return cb(null, 'Validation Mail is in queue, please wait.'); //FIXME: Better Text & Translate
			} else {
				if (!exeeds(task.sent, config.waitperiod)) {
					return cb(null, 'Last Validation Mail sent too soon, please wait.'); //TODO: notify how long? /FIXME: Better Text & Translate
				}
				tasks.remove(tasks.indexOf(task));
			}
		} else {
			task = {email: user.email};
		}
		task.sent = false;
		task.linkkey = crypto.randomBytes(23).toString("hex");
		queue.push(task);
		tasks.push(task);
		registration.save();
		cb(null, 'Mail queued');//FIXME: Better Text & Translate
	};

	registration.pull = function (linkkey, cb) {
		registration.cleanup();
		var task = tasks.filter(function (t) {
			return t.linkkey === linkkey;
		})[0];
		if (!task) {
			return cb(new Error('Link expired, invalid or does not exists.'));//FIXME: Better Text & Translate
		}
		tasks.remove(tasks.indexOf(task));
		users.email(task.email, function (err, user) {
			if (err || (!user)) return cb(new Error('Link invalid, did you change your email adress?'));//FIXME: Better Text & Translate
			users.verified(user, function (err) {
				cb(err); //FIXME: Better Text & Translate
			});
		});
	};

	return registration;

};