#!/usr/bin/env node

/* get node modules */
var nodemailer = require("nodemailer");
var path = require("path");
var async = require("async");
var fs = require("fs");
var crypto = require("crypto");
var mustache = require("mustache");
var i18n = require("i18n");

module.exports = mailqueue = function (config, url) {

	var transport = nodemailer.createTransport(config.transport.name, config.transport);

	var mailqueue = this;
	var tasks = [];

	fs.exists(config.dbfile, function (ex) {
		if (ex) {
			try {
				tasks = JSON.parse(fs.readFileSync(config.dbfile));
			} catch (e) {
				tasks = [];
				console.error("could not load mailqueue");
			}
		}
	});

	if (tasks.length === 0) fs.exists(config.dbfile + ".backup", function (ex) {
		if (ex) {
			try {
				tasks = JSON.parse(fs.readFileSync(config.dbfile + ".backup"));
			} catch (e) {
				tasks = [];
				console.error("could not load mailqueue from backup");
			}
		}
	});

	//TODO: start all not sent email tasks #FIXME

	var exeeds = function (date, period) {
		if (!date) return false;
		return ((new Date()) - date > period);
	};

	var loadBody = function (settings, cb) {
		var lang = i18n.getLocale();
		var tmplpath = path.resolve(__dirname, '../assets/mails');
		var filename = tmplpath + '/' + settings.mailview + '-' + lang + '.mustache';
		console.log();
		fs.exists(filename, function (exists) {
			if (!exists) {
				console.log('mail template "' + filename + '" is missing');
				filename = tmplpath + '/' + settings.mailview + '-en.mustache';
			}
			fs.exists(filename, function (exists) {
				if (!exists) {
					console.log('mail template "' + filename + '" is missing');
					return cb('');
				}
				fs.readFile(filename, function (err, data) {
					if (err) {
						console.log('error loading mail template', filename);
						return cb('');
					}
					cb(data.toString());
				});
			});
		});
	};

	var sendmail = function (task, settings, cb) {
		var linkurl = url + settings.urlpath + task.linkkey;
		loadBody(settings, function (emailbody) {

			var mailOptions = {
				from: config.from, // sender address
				to: task.email,
				subject: i18n.__(settings.title.txt, task[settings.title.propname]),
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
		});
	};

	var queue = async.queue(function (task, callback) {
		task.sent = new Date();
		mailqueue.save(function () {
			if (!config.mails.templates.hasOwnProperty(task.type)) {
				console.log("[mailqueue] invalid type", task.type)
				return callback();
			}
			var settings = config.mails.templates[task.type];
			if (!settings) return callback();
			sendmail(task, settings, function (err) {
				//TODO: try resend and then give up FIXME:
				callback();
			});
		});
	}, config.maxqueueworker);

	mailqueue.cleanup = function () {
		tasks = tasks.filter(function (t) {
			return (!exeeds(t.sent, config.expiredperiod));
		});
	};

	mailqueue.save = function (callback) {
		fs.rename(config.dbfile, config.dbfile + ".backup", function (err) {
//			if (err) return callback(err); //ignore if not exists
			fs.writeFile(config.dbfile, JSON.stringify(tasks), function (err) {
				if (err) return callback(err);
				fs.unlink(config.dbfile + ".backup", callback)
			});
		});
	};

	mailqueue.send = function (user, type, cb) {
		if (!cb) cb = function () {
		};
		//if there is no email for the user, just report success
		if (!user.email)
			return cb(null, true);
		var task = tasks.filter(function (t) {
			return ((t.id === user.id) && (t.type === type));
		})[0];
		if (task) {
			if (!task.sent) {
				return cb(null, true);
			} else {
				if (!exeeds(task.sent, config.waitperiod)) {
					return cb(null, false);
				}
				tasks.remove(tasks.indexOf(task));
			}
		} else {
			task = {email: user.email, id: user.id, type: type};
		}
		task.sent = false;
		task.linkkey = crypto.randomBytes(23).toString("hex");
		queue.push(task);
		tasks.push(task);
		mailqueue.save(function () {
			cb(null, true);
		});
	};

	/*	gets a task by link key and removes it from the task list */

	mailqueue.pop = function (linkkey, cb) {
		mailqueue.cleanup();
		for (var i = 0; i < tasks.length; i++) {
			var t = tasks[i];
			if (t.linkkey === linkkey) {
				tasks.splice(i, 1);
				mailqueue.save(function () {
					cb(t);
				});
				return;
			}
		}
		cb(null);
	};


	return mailqueue;

};