module.exports = function (grunt) {

	grunt.initConfig({

		uglify: {
			my_target: {
				files: {
					'assets/libs/components.min.js': [
						'assets/libs/jquery/dist/jquery.min.js',
						'assets/libs/moment/min/moment.min.js',
						'assets/libs/moment/lang/de.js',
						'assets/libs/bootstrap/dist/js/bootstrap.min.js',
						'assets/libs/bootstrap-daterangepicker/daterangepicker.js',
						'assets/libs/angular/angular.min.js',
						'assets/libs/angular-gettext/dist/angular-gettext.min.js',
						'assets/libs/angular-sanitize/angular-sanitize.min.js',
						'assets/libs/angular-ui-router/release/angular-ui-router.min.js',
						'assets/libs/angular-resource/angular-resource.min.js',
						'assets/libs/angular-moment/angular-moment.min.js',
						'assets/libs/ng-table/ng-table.js',
						'assets/libs/angular-cookies/angular-cookies.min.js'
					]
				}
			},
			options: {
				compress: {
					drop_console: true
				}
			}
		},

		nggettext_extract: {
			pot: {
				files: {
					'po/template.pot': ['assets/index.html', 'assets/partials/*.html', 'assets/partials/admin/*.html', 'assets/js/*.js']
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
	grunt.registerTask('default', ['uglify', 'nggettext_extract', 'nggettext_compile']);

};