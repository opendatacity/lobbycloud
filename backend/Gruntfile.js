module.exports = function (grunt) {

	grunt.initConfig({

		uglify: {
			my_target: {
				files: {
					'assets/libs/components.min.js': [
						'../assets/js/jquery.knob.js',
						'../assets/js/jquery.ui.widget.js',
						'../assets/js/jquery.iframe-transport.js',
						'../assets/js/jquery.fileupload.js',

						'assets/libs/moment/min/moment.min.js',
						'assets/libs/moment/lang/de.js',
						'assets/libs/bootstrap-daterangepicker/daterangepicker.js',
						'assets/libs/ng-file-upload/angular-file-upload-shim.min.js', //must be included BEFOR angular.js
						'assets/libs/angular/angular.min.js',
						'assets/libs/ng-file-upload/angular-file-upload.min.js',
						'assets/libs/angular-gettext/dist/angular-gettext.min.js',
						'assets/libs/angular-sanitize/angular-sanitize.min.js',
						'assets/libs/angular-ui-router/release/angular-ui-router.min.js',
						'assets/libs/angular-bootstrap/ui-bootstrap-tpls.min.js',
						'assets/libs/angular-resource/angular-resource.min.js',
						'assets/libs/angular-moment/angular-moment.min.js',
						'assets/libs/ng-table/ng-table.js',
						'assets/libs/angular-cookies/angular-cookies.min.js'
					]
				}
			},
			options: {
				mangle: false,
				compress: {
					drop_console: true
				}
			}
		},

		concat: {
			options: {
				separator: ''
			},
			dist: {
				src: [
					'assets/libs/ng-table/ng-table.css',
					'assets/libs/bootstrap-daterangepicker/daterangepicker-bs3.css'
				],
				dest: 'assets/libs/components.min.css'
			}
		},

		nggettext_extract: {
			pot: {
				files: {
					'po/template.pot': ['assets/index.html', 'assets/partials/*.html', 'assets/partials/admin/*.html', 'assets/partials/docs/*.html', 'assets/js/*.js']
				}
			}
		},

		nggettext_compile: {
			all: {
				files: {
					'assets/js/translations.js': ['po/*.po']
				}
			}
		}
	});
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-angular-gettext');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.registerTask('default', ['uglify', 'concat', 'nggettext_extract', 'nggettext_compile']);

};