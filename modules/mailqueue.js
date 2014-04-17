#!/usr/bin/env node

/* get node modules */
var nodemailer = require("nodemailer");
var path = require("path");
var async = require("async");
var fs = require("fs");
var crypto = require("crypto");
var mustache = require("mustache");

module.exports = mailqueue = function (config, url, emails) {

	var transport = nodemailer.createTransport(config.transport.name, config.transport);

	var mailqueue = this;
	var tasks = [];

	fs.exists(config.dbfile, function (ex) {
		if (ex) tasks = JSON.parse(fs.readFileSync(config.dbfile));
	});

	//TODO: start all not sent email tasks

	var exeeds = function (date, period) {
		if (!date) return false;
		return ((new Date()) - date > period);
	};

	var sendmail = function (task, settings, cb) {
		var linkurl = url + settings.urlpath + task.linkkey;
		var emailbody = settings.body() || url;

		var mailOptions = {
			from: config.from, // sender address
			to: task.email,
			subject: settings.title(task),
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
		mailqueue.save();
		var settings = emails[task.type];
		if (!settings) return callback();
		sendmail(task, settings, function (err) {
			//TODO: try resend and then give up
			callback();
		});
	}, config.maxqueueworker);

	mailqueue.cleanup = function () {
		tasks = tasks.filter(function (t) {
			return (!exeeds(t.sent, config.expiredperiod));
		});
	};

	mailqueue.save = function (callback) {
		fs.rename(config.dbfile, config.dbfile+".backup", function(err){
			if (err) return callback(err);
			fs.writeFile(config.dbfile, JSON.stringify(tasks), function(err){
				if (err) return callback(err);
				fs.unlink(config.dbfile+".backup", callback)
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
		mailqueue.save();
		cb(null, true);
	};

	/*	gets a task by link key and removes it from the task list */

	mailqueue.pop = function (linkkey) {
		mailqueue.cleanup();
		for (var i = 0; i < tasks.length; i++) {
			var t = tasks[i];
			if (t.linkkey === linkkey) {
				tasks.splice(i, 1);
				mailqueue.save();
				return t;
			}
		}
		return null;
	};


	return mailqueue;

};