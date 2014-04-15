#!/usr/bin/env node

/* get node modules */
var nodemailer = require("nodemailer");
var path = require("path");
var async = require("async");
var fs = require("fs");
var crypto = require("crypto");
var mustache = require("mustache");

module.exports = registration = function (users, config, url, i18n) {

	var transport = nodemailer.createTransport(config.transport.name, config.transport);

	var registration = this;
	var tasks = [];

	fs.exists(config.dbfile, function (ex) {
		if (ex) tasks = JSON.parse(fs.readFileSync(config.dbfile));
	});

	var emailbodies = {
		en: fs.readFileSync(path.resolve(__dirname, '../assets/views/validationmail.mustache')).toString(),
		de: fs.readFileSync(path.resolve(__dirname, '../assets/views/validationmail-de.mustache')).toString()
	};

	//TODO: start all not sent email tasks

	var exeeds = function (date, period) {
		if (!date) return false;
		return ((new Date()) - date > period);
	};

	var sendmail = function (task, cb) {
		var linkurl = url + "/users/emails/confirm_verification/" + task.linkkey;
		var emailbody = emailbodies[i18n.getLocale()] || url;

		var mailOptions = {
			from: config.from, // sender address
			to: task.email,
			subject: i18n.__("[LobbyCloud] Please verify your email '%s'", task.email),
			text: mustache.render(emailbody, {html: false, task: task, url: linkurl}),
			html: mustache.render(emailbody, {html: true, task: task, url: linkurl})
		};

		transport.sendMail(mailOptions, function (error, response) {
			if (error) { //FIXME: logging
				console.log("Message NOT sent:", error);
			} else {
				console.log("Message sent:", task.email, response);
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
			return t.id === user.id;
		})[0];
		if (task) {
			if (!task.sent) {
				return cb(null, i18n.__("Validation mail is in queue, please wait."));
			} else {
				if (!exeeds(task.sent, config.waitperiod)) {
					return cb(null, i18n.__("Last validation Mail sent too soon, please wait.")); //TODO: notify how long?
				}
				tasks.remove(tasks.indexOf(task));
			}
		} else {
			task = {email: user.email, id: user.id};
		}
		task.sent = false;
		task.linkkey = crypto.randomBytes(23).toString("hex");
		queue.push(task);
		tasks.push(task);
		registration.save();
		cb(null, i18n.__("Mail queued. Please wait a moment and check your e-mail inbox."));
	};

	registration.verify = function (linkkey, cb) {
		registration.cleanup();
		var task = tasks.filter(function (t) {
			return t.linkkey === linkkey;
		})[0];
		if (!task) {
			return cb(new Error(i18n.__("Link expired, invalid or does not exists.")));
		}
		users.get(task.id, function (err, user) {
			if (err || (!user)) return cb(new Error(i18n.__("Link invalid, did you change your email adress?")));
			users.verified(user, function (err, user) {
				if (err) return cb(new Error(i18n.__("Internal Error :(")));
				tasks.splice(tasks.indexOf(task), 1);
				registration.save();
				cb(null, user);
			});
		});
	};

	return registration;

};