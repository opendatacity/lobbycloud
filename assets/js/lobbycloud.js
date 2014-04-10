$(document).ready(function(e){
	$('#main').css('min-height', $(window).innerHeight()-($('header').outerHeight()+$('footer').outerHeight()));
	
	$("input[type=password].strengthometer").each(function(idx,e){
		var $i = $(e);
		var $m = $('<div class="progress password-progress"><div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="5" style="width: 0%;"><span class="sr-only">0% Complete</span></div></div>');
		var $b = $(".progress-bar", $m);
		$i.before($m);
		$i.keyup(function(evt){
			var $res = (zxcvbn($i.val()));
			$b.css("width", (1+($res.score)*24.75)+"%"); //.html('<span class="progress-label">Password crack time: '+$res.crack_time_display+'</span>');
			if ($res.score < 2) {
				$b.attr("class", "progress-bar progress-bar-danger");
			} else if ($res.score < 3) {
				$b.attr("class", "progress-bar progress-bar-warning");
			} else {
				$b.attr("class", "progress-bar progress-bar-success");
			}
		});
	});
	
});

$(window).resize(function(e){
	$('#main').css('min-height', $(window).innerHeight()-($('header').outerHeight()+$('footer').outerHeight()));
});