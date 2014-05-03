#!/usr/bin/env node

/* require node modules */
var fs = require("fs");
var path = require("path");

/* require npm modules */
var hashfile = require("hash_file");
var filedump = require("filedump");
var pdfinfo = require("pdfinfojs");
var pdftxt = require("pdftxt");
var moment = require("moment");
var stream = require("stream");
var async = require("async");
var gm = require("gm").subClass({ imageMagick: true });

module.exports = extractor = function(store, debug){

	if (typeof debug === "undefined") var debug = false;

	var t = this;
		
	/* storage path */
	t.store = path.resolve(store);

	/* local instance of filedump */
	t.filedump = new filedump(t.store);
	
	/* queue */
	t.queue = async.queue(function(task, callback){
		if (debug) console.log("[extract]", "starting extraction", task.file);
		t._extract(task.file, function(err, data){
			/* log */
			if (debug) console.log("[extract]", "extraction finished", task.file);
			/* extraction callback */
			task.callback(err, data);
			/* queue callback */
			callback();
		});
	}, 1);
	
	t.queue.drain = function(){
		if (debug) console.log("[extract]", "extraction queue is empty.")
	};
	
	/* extract pdf info */
	t.info = function(file, callback) {
		new pdfinfo(file).add_options(["-rawdates", "-enc UTF-8"]).getInfo(function(err, info, params) {
			if (err) return callback(err);
			callback(null, {
				title: (info.hasOwnProperty("title")) ? info.title : null, 
				subject: (info.hasOwnProperty("subject")) ? info.subject : null, 
				author: (info.hasOwnProperty("author")) ? info.author : null, 
				keywords: (info.hasOwnProperty("keywords")) ? info.keywords : null, 
				creationdate: moment(info.creationdate, "_:YYYYMMDDHHmmssZ").format("YYYY-MM-DDTHH:mm:ssZ"), 
				moddate: moment(info.moddate, "_:YYYYMMDDHHmmssZ").format("YYYY-MM-DDTHH:mm:ssZ"), 
				pages: parseInt(info.pages), 
				encrypted: (info.encrypted === "no") ? false : true, 
				width: parseFloat(info.page_size.replace(/^([0-9\.]+) x ([0-9\.]+) pts.*$/, "$1")), 
				height: parseFloat(info.page_size.replace(/^([0-9\.]+) x ([0-9\.]+) pts.*$/, "$2")), 
				size: parseInt(info.file_size.replace(/^([0-9]+) bytes$/, "$1"),10)
			});
		});
	};

	/* make sha1 checksum */
	t.hash = function(file, callback) {
		hashfile(file, "sha1", function(err, h){
			if (err) return callback(err);
			callback(null, h);
		});
	};
	
	/* extract pdf text */
	t.text = function(file, callback) {
		pdftxt(file, function(err, data){
			if (err) return callback(err);
			callback(null, data);
		});
	};

	/* hashable thumbnails */
	t.hashthumb = function(file, pages, callback) {
		var file = path.resolve(file);
		if (typeof pages !== "number") return callback(new Error("invalid argument: pages."));
		/* hint: if a pdf has just one page, imagemagick fails on bracket notation */
		if (pages === 1) {
			var hash = gm(file);
		} else {
			var hash = gm(file+"["+0+"]");
			for (var i = 1; i < pages; i++) {
				hash.append(file+"["+i+"]");
			}
		}
		t.filedump.save(hash.resize(50).stream("png"), "png", callback);
	};
	
	/* thumbnails */
	t.thumb = function(file, pages, page, dim, callback) {
		var file = path.resolve(file);
		
		/* check for pages argument since it is crucial due to imagemagick behaviour */
		if (typeof pages !== "number") return callback(new Error("invalid argument: pages."));

		/* set page 1 as default */
		if (typeof page === "function") {
			var callback = page;
			var page = 1;
		} else if (typeof page !== "number") {
			var page = 1;
		}

		/* hint: if a pdf has just one page, imagemagick fails on bracket notation */
		if (page > pages) return callback(new Error("page out of range"));

		var page = (pages === 1) ? "" : "["+(page-1)+"]";

		t.filedump.prepare("png", function(err, filename){
			if (err) return callback(err);
			gm(file+page).resize(dim,dim).write(path.resolve(t.store, filename), function(err){
				if (err) return callback(err);
				callback(null, filename);
			});
		});
	};
	
	/* thumbnail queue */
	t.thumbq = function(file, pages, dim, callback) {
		
		var thumbs = [];
		var errs = [];
		
		/* queue thumbnail generation */
		var _queue = async.queue(function(task, _callback){
			if (debug) console.log("[extract]", "generating thumbnail", task.page+"/"+pages, "from", file);
			t.thumb(file, pages, task.page, dim, function(err, data){
				if (debug) console.log("[extract]", "generated thumbnail", task.page+"/"+pages, "from", file);
				_callback(err, data);
			});
		}, 1);
		
		/* call back if queue is empty */
		_queue.drain = function(){
			if (errs.length > 0) callback(errs.shift());
			callback(null, thumbs);
		};

		/* queue thubnail generation for every page */
		for (var p = 1; p <= pages; p++) {
			(function(p){
				_queue.push({"page":p}, function(err, file){
					if (err) return err
					thumbs.push({
						page: p,
						file: file
					});
				});
			})(p);
		}

	};
	
	/* resize */
	t.resize = function(file, pages, page, dim, callback) {
		var file = path.resolve(file);
		
		/* check for pages argument since it is crucial due to imagemagick behaviour */
		if (typeof pages !== "number") return callback(new Error("invalid argument: pages."));

		/* set page 1 as default */
		if (typeof page === "function") {
			var callback = page;
			var page = 1;
		} else if (typeof page !== "number") {
			var page = 1;
		}

		/* hint: if a pdf has just one page, imagemagick fails on bracket notation */
		if (page > pages) return callback(new Error("page out of range"));

		var page = (pages === 1) ? "" : "["+(page-1)+"]";

		t.filedump.prepare("png", function(err, filename){
			if (err) return callback(err);
			gm(file+page).density(300, 300).background('white').resize(dim,dim,"^").write(path.resolve(t.store, filename), function(err){
				if (err) return callback(err);
				callback(null, filename);
			});
		});
	};

	/* resize queue */
	t.resizeq = function(file, pages, dim, callback) {
		
		var images = [];
		var errs = [];
		
		/* queue image generation */
		var _queue = async.queue(function(task, _callback){
			if (debug) console.log("[extract]", "generating image", task.page+"/"+pages, "from", file);
			t.resize(file, pages, task.page, dim, function(err, data){
				if (debug) console.log("[extract]", "generated image", task.page+"/"+pages, "from", file);
				_callback(err, data);
			});
		}, 1);
		
		/* call back if queue is empty */
		_queue.drain = function(){
			if (errs.length > 0) callback(errs.shift());
			callback(null, images);
		};

		/* queue image generation for every page */
		for (var p = 1; p <= pages; p++) {
			(function(p){
				_queue.push({"page":p}, function(err, file){
					if (err) return err
					images.push({
						page: p,
						file: file
					});
				});
			})(p);
		}

	};

	/* everything */
	t.extract = function(file, callback) {
		t.queue.push({
			file: file,
			callback: callback
		}, function(err){
			if (err) console.log("[extract]", "error extracting", file, err);
		});
	};
	
	t._extract = function(file, callback) {

		/* FIXME: check if file exists */

		/* FIXME: make this async and way more solid */

		var e = {};
		e.data = {};

		t.info(file, function(err, data){
			if (err) return callback(err);
			e.data.info = data;
			t.hash(file, function(err, filehash){
				if (err) return callback(err);
				e.data.hash = filehash;
				t.text(file, function(err, particles){
					if (err) return callback(err);
					e.data.particles = particles;
					e.data.text = [];
					e.data.particles.forEach(function(pages){
						pages.blocks.forEach(function(blocks){
							e.data.text.push(blocks.lines.join(" "));
						});
					});
					e.data.text = e.data.text.join("\n");
					t.hashthumb(file, e.data.info.pages, function(err, hashthumb){
						if (err) return callback(err);
						e.data.hashthumb = hashthumb;
						e.data.thumbs = [];
						e.data.images = [];
						
						t.thumbq(file, e.data.info.pages, 300, function(err, thumbs){
							if (err) return callback(err);
							e.data.thumbs = thumbs;
							t.resizeq(file, e.data.info.pages, 800, function(err, images){
								if (err) return callback(err);
								e.data.images = images;
								/* sort */
								e.data.images = e.data.images.sort(function(a,b){
									return (a.page - b.page);
								});
								e.data.thumbs = e.data.thumbs.sort(function(a,b){
									return (a.page - b.page);
								});
								/* images are done */
								callback(null, e.data);
							});
						});
					});
				});
			});
		});
	};
	
	return t;
	
};
