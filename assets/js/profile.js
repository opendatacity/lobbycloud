$(document).ready(function (e) {
	var reqmail = false;

	var $resultdisplay = $("#action-info-result");

	var display = function (alertclass, html) {
		reqmail = false;
		$('#action-info-progress').addClass('hidden');
		$resultdisplay.removeClass('alert-success');
		$resultdisplay.removeClass('alert-danger');
		$resultdisplay.addClass(alertclass);
		$resultdisplay.html(html);
		$resultdisplay.removeClass('hidden');
	};

	$('#btn-request-validation').click(function () {
		if (reqmail) return;
		reqmail = true;
		$('#action-info-progress').removeClass('hidden');
		$resultdisplay.addClass('hidden');
		$('#action-info').removeClass('hidden');
		$.post("/users/verification/request", function (data) {
			display('alert-success', data);
		})
			.fail(function (err) {
				display('alert-danger', err.responseText);
			});
	});

});