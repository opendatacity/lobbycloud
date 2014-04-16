$(document).ready(function (e) {
	var reqmail = false;

	var setActiveRequesting = function(active){
		reqmail = active;
		$('#btn-request-validation i').toggle(active);
	};

	$('#btn-request-validation').click(function () {
		if (reqmail) return;
		setActiveRequesting(true);

		$.post("/users/verification/request", function (data) {
			setActiveRequesting(false);
			$("#div-request-validation").html(data);
		})
			.fail(function (err) {
				setActiveRequesting(false);
				$("#div-request-validation").html(err);
			});
	});

});