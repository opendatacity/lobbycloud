$(document).ready(function(e){

	$('#main').css('min-height', $(window).innerHeight()-($('header').outerHeight()+$('footer').outerHeight()));
	
	/* strengthometer */
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
	
	/* prop-select */
	$('.prop-select').each(function(idx,e){
		var $e = $(this);
		var $prop = $e.attr("data-prop");
		var $v = $("input[name="+$prop+"]", $e);
		var $q = $("input[name="+$prop+"-query]", $e);
		$q.typeahead({
		  minLength: 3,
		  highlight: true
		},{
			displayKey: "label",
			source: function(query, callback) {
				$.get("/api/"+$prop+"/suggest", {q: query}, callback, "json");
			}
		});
		var _activate = function(o,v){
			$q.typeahead("close");
			$v.val(v.id);
			$q.attr("readonly","readonly").addClass("fixed").one("click", function(evt){
				$q.val("").removeAttr("readonly").removeClass("fixed");
				$v.val("");
			});
		};
		$q.on("typeahead:selected", _activate);
		$q.on("typeahead:autocompleted", _activate);
		
		var _select = function($f){
			/* show text on dropdown button */
			$(".dropdown-label", $e).text($f.text());
			
			/* do magic */
			switch ($f.attr("data-action")) {
				case "disabled":
					$q.attr("type","hidden");
					$v.val("").attr("disabled", "disabled").attr("type","text");
				break;
				case "select":
					$q.val("").removeAttr("readonly").removeClass("fixed").attr("type","text");
					$v.val("").removeAttr("disabled").attr("type","hidden");
				break;
				case "suggest":
					$q.attr("type","hidden");
					$v.val("").removeAttr("disabled").attr("type","text").focus();
				break;
			}
		}
		
		$(".dropdown-action .dropdown-menu li a", $e).each(function(idx,f){
			var $f = $(this);
			$f.click(function(evt){
				evt.preventDefault();
				_select($f);
			});
		});
		
		_select($(".dropdown-menu li:first a", $e));
		
	});
	
});

$(window).resize(function(e){
	$('#main').css('min-height', $(window).innerHeight()-($('header').outerHeight()+$('footer').outerHeight()));
});