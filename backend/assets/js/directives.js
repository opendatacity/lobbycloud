'use strict';

/* Directives */

app.directive('input', function ($compile, $parse, gettextCatalog) {
	return {
		restrict: 'E',
		require: '?ngModel',
		link: function ($scope, $element, $attributes, ngModel) {
			/**
			 * @license ng-bs-daterangepicker v0.0.1
			 * (c) 2013 Luis Farzati http://github.com/luisfarzati/ng-bs-daterangepicker
			 * License: MIT
			 */

			if ($attributes.type !== 'daterange' || ngModel === null) return;

			var options = {};
			options.format = $attributes.format || 'YYYY-MM-DD';
			options.separator = $attributes.separator || ' - ';
			options.minDate = $attributes.minDate && moment($attributes.minDate);
			options.maxDate = $attributes.maxDate && moment($attributes.maxDate);
			options.dateLimit = $attributes.limit && moment.duration.apply(this, $attributes.limit.split(' ').map(function (elem, index) {
				return index === 0 && parseInt(elem, 10) || elem;
			}));
			options.ranges = $attributes.ranges && $parse($attributes.ranges)($scope);

			options.locale = {
				applyLabel: gettextCatalog.getString('Apply'),
				cancelLabel: gettextCatalog.getString('Cancel'),
				fromLabel: gettextCatalog.getString('From'),
				toLabel: gettextCatalog.getString('To')
			};

			function format(date) {
				return date.format(options.format);
			}

			function formatted(dates) {
				return [format(dates.startDate), format(dates.endDate)].join(options.separator);
			}

			ngModel.$formatters.unshift(function (modelValue) {
				if (!modelValue) return '';
				return modelValue;
			});

			ngModel.$parsers.unshift(function (viewValue) {
				return viewValue;
			});

			ngModel.$render = function () {
				if (!ngModel.$viewValue || !ngModel.$viewValue.startDate) return;
				$element.val(formatted(ngModel.$viewValue));
			};

			$scope.$watch($attributes.ngModel, function (modelValue) {
				if (!modelValue || (!modelValue.startDate)) {
					ngModel.$setViewValue({startDate: moment().startOf('day'), endDate: moment().startOf('day')});
					return;
				}
				$element.data('daterangepicker').startDate = modelValue.startDate;
				$element.data('daterangepicker').endDate = modelValue.endDate;
				$element.data('daterangepicker').updateView();
				$element.data('daterangepicker').updateCalendars();
				$element.data('daterangepicker').updateInputText();
			});

			$element.daterangepicker(options, function (start, end) {
				$scope.$apply(function () {
					ngModel.$setViewValue({startDate: start, endDate: end});
					ngModel.$render();
				});
			});
		}
	};
});

app.directive('ngtypeahead', function () {
	return {
		restrict: 'AC',       // Only apply on an attribute or class
		require: '?ngModel',  // The two-way data bound value that is returned by the directive
		scope: {
			options: '=',       // The typeahead configuration options (https://github.com/twitter/typeahead.js/blob/master/doc/jquery_typeahead.md#options)
			datasets: '='       // The typeahead datasets to use (https://github.com/twitter/typeahead.js/blob/master/doc/jquery_typeahead.md#datasets)
		},
		link: function (scope, element, attrs, ngModel) {
			// Flag if user is selecting or not
			var selecting = false;
			// Create the typeahead on the element
			element.typeahead(scope.options, scope.datasets);

			element.keypress(function (e) {
				if (e.which == 13) {
					scope.$apply(function () {
						scope.$emit('typeahead:enter', e, element.val(), scope.datasets);
					});
					return true;
				}
			});

			// Parses what is going to be set to model
			ngModel.$parsers.push(function (fromView) {
				var _ref = null;
				if (((_ref = scope.options) != null ? _ref.editable : void 0) === false) {
					ngModel.$setValidity('typeahead', !selecting);
					if (selecting) {
						return undefined;
					}
				}
				return fromView;
			});


			function getCursorPosition(element) {
				var position = 0;
				element = element[0];

				// IE Support.
				if (document.selection) {
					var range = document.selection.createRange();
					range.moveStart('character', -element.value.length);
					position = range.text.length;
				}
				// Other browsers.
				else if (typeof element.selectionStart === 'number') {
					position = element.selectionStart;
				}
				return position;
			}

			function setCursorPosition(element, position) {
				element = element[0];
				if (document.selection) {
					var range = element.createTextRange();
					range.move('character', position);
					range.select();
				}
				else if (typeof element.selectionStart === 'number') {
					element.focus();
					element.setSelectionRange(position, position);
				}
			}

			function updateScope(event, object, suggestion, dataset) {
				// for some reason $apply will place [Object] into element, this hacks around it
				//var preserveVal = element.val();
				scope.$apply(function () {
					selecting = false;
					ngModel.$setViewValue(suggestion[scope.datasets.displayKey]);
					scope.$emit(event, object, suggestion, scope.datasets);
				});
				//element.val(preserveVal);
			}

			// Update the value binding when a value is manually selected from the dropdown.
			element.bind('typeahead:selected', function (object, suggestion, dataset) {
				updateScope('typeahead:selected', object, suggestion, dataset);
			});

			// Update the value binding when a query is autocompleted.
			element.bind('typeahead:autocompleted', function (object, suggestion, dataset) {
				updateScope('typeahead:autocompleted', object, suggestion, dataset);
			});

			// Propagate the opened event
			element.bind('typeahead:opened', function () {
				scope.$emit('typeahead:opened');
			});

			// Propagate the closed event
			element.bind('typeahead:closed', function () {
				element.typeahead('val', ngModel.$viewValue);
				//element.val(ngModel.$viewValue);
				scope.$emit('typeahead:closed');
			});

			// Propagate the cursorchanged event
			element.bind('typeahead:cursorchanged', function (event, suggestion, dataset) {
				scope.$emit('typeahead:cursorchanged', event, suggestion, dataset);
			});

			// Update the value binding when the user manually enters some text
			element.bind('input',
				function () {
					var preservePos = getCursorPosition(element);
					scope.$apply(function () {
						var value = element.val();
						selecting = true;
						ngModel.$setViewValue(value);
					});
					setCursorPosition(element, preservePos);
					scope.$emit('typeahead:changed', element.val(), scope.datasets);
				}
			);
		}
	};
});

app.directive('eatClick', function () {
	return function (scope, element, attrs) {
		$(element).click(function (event) {
			event.preventDefault();
			return true;
		});
	}
});

app.filter('listLabels', function () {
	return function (value, format, preprocess) {
		if (!value) return '';
		return value.map(function (o) {
			return o.label;
		}).join(", ");
	};
});

app.filter('join', function () {
	return function (value, format, preprocess) {
		if (!value) return '';
		return value.join(", ");
	};
});

app.filter('linesToHTML', function () {
	return function (value, format, preprocess) {
		if (!value) return '';
		return value.replace("\n", "<br/>");
	};
});


app.constant('keyCodes', {
	esc: 27,
	space: 32,
	enter: 13,
	tab: 9,
	backspace: 8,
	shift: 16,
	ctrl: 17,
	alt: 18,
	capslock: 20,
	numlock: 144
})
	.directive('keyBind', ['keyCodes', function (keyCodes) {
		function map(obj) {
			var mapped = {};
			for (var key in obj) {
				var action = obj[key];
				if (keyCodes.hasOwnProperty(key)) {
					mapped[keyCodes[key]] = action;
				}
			}
			return mapped;
		}

		return function (scope, element, attrs) {
			var bindings = map(scope.$eval(attrs.keyBind));
			element.bind("keypress", function (event) {
				if (bindings.hasOwnProperty(event.which)) {
					scope.$apply(function () {
						scope.$eval(bindings[event.which]);
					});
				}
			});
		};
	}]);