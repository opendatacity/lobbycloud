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
var gm = require("gm").subClass({ imageMagick: true });

module.exports = extractor = function(store){

	var t = this;
	
	/* storage path */
	t.store = path.resolve(store);

	/* local instance of filedump */
	t.filedump = new filedump(t.store);
	
	/* extract pdf info */
	t.info = function(file, callback) {
		new pdfinfo(file).add_options(["-rawdates"]).getInfo(function(err, info, params) {
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
			gm(file+page).resize(dim,dim).write(path.resolve(t.store, filename), function(err){
				if (err) return callback(err);
				callback(null, filename);
			});
		});
	};

	/* everything */
	t.extract = function(file, callback) {

		/* FIXME: check if file exists */

		/* FIXME: make this async and way more solid*/

		var e = this;
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
						for (var p = 1; p <= e.data.info.pages; p++) {
							(function(p){
								t.thumb(file, e.data.info.pages, p, 300, function(err, thumb){
									if (err) return callback(err);
									e.data.thumbs.push({
										"page": p,
										"file": thumb
									});
									if (e.data.thumbs.length === e.data.info.pages) {
										/* thumbs are done */
										for (var pp = 1; pp <= e.data.info.pages; pp++) {
											(function(p){
												t.thumb(file, e.data.info.pages, p, 1024, function(err, image){
													if (err) return callback(err);
													e.data.images.push({
														"page": p,
														"file": image
													});
													if (e.data.images.length === e.data.info.pages) {
														e.data.images = e.data.images.sort(function(a,b){
															return (a.page - b.page);
														});
														e.data.thumbs = e.data.thumbs.sort(function(a,b){
															return (a.page - b.page);
														});
														/* images are done */
														callback(null, e.data);
													}
												});
											})(pp);
										}
									}
								});
							})(p);
						}
					});
				})
				
			});
			
		});
		
	}
	
	return t;
	
};
