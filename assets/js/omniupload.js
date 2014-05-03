$(document).ready(function(){
	
	if ($('form#upload').length > 0) return;
	
	/* create upload drop overlay */
	$('body').append($('<div id="omniupload-drop"><span>Drop your files here.</span></div>'));

	/* create upload indicator pane */
	$('body').append($('<div id="omniupload-indicator"></div>'));
	
	/* create upload form */
	var $form = $('<form id="omniupload-form" action="/api/contribute" method="post" enctype="multipart/form-data" role="form"><input type="file" name="_upload" multiple /></form>');
	
	$form.fileupload({
		dataType: 'json',
		dropZone: $('#omniupload-drop'),
		limitConcurrentUploads: 3,
		acceptFileTypes: /(\.|\/)(pdf)$/i,
		add: function(event, data){

			/* don't show empty files on the indicator */
			if (data.files[0].size === 0) return;

			// FIXME: filesize limit, filetypes

			data.context = $('<div class="omniupload-indicator-item"><span class="file-label"><span class="filename">'+((data.files[0].name.length > 50) ? data.files[0].name.replace(/^(.{50}).*$/,"$1...") : data.files[0].name)+'</span><span class="filesize">'+(filesize(data.files[0].size))+'</span></span><div class="progress progress-striped active"><div class="progress-bar progress-bar-info" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%"><span class="sr-only">0%</span></div></div><a href="javascript:;" class="action"><i class="fa fa-times"></i></a></div>');
			
			data.context.appendTo($('#omniupload-indicator'));
			
			$('a.action', data.context).click(function(evt){
				evt.preventDefault();
				if (data.hasOwnProperty("_xhr")) data._xhr.abort();
				data.context.remove();
			});
			
			data._xhr = data.submit();
			
		},
		progress: function(event, data){
         var progress = ((data.loaded/data.total)*100);
			$(".progress-bar", data.context).attr("aria-valuenow", progress).css("width", progress+"%");
			$(".progress-bar .sr-only", data.context).text(progress+"%");
		},
		done: function(event, data) {
			switch (data.result.status) {
				case "success":
					$(".progress", data.context).removeClass("active").removeClass("progress-striped");
					$(".progress-bar", data.context).removeClass("progress-bar-info").addClass("progress-bar-success");
					$(".action", data.context).remove();
					setTimeout(function(){
						data.context.fadeOut('fast', function(){
							data.context.remove();
						});
					},5000);
				break;
				case "error":
					$(".progress", data.context).removeClass("active").removeClass("progress-striped");
					$(".progress-bar", data.context).removeClass("progress-bar-info").addClass("progress-bar-danger");
				break;
			}
		},
		fail: function(event, data){
			$(".progress", data.context).removeClass("active").removeClass("progress-striped");
			$(".progress-bar", data.context).removeClass("progress-bar-info").addClass("progress-bar-danger");
		}
	});
	
	$('body').append($form);
	
	$('body').on("dragover", function(event) {
		event.preventDefault();
		$("#omniupload-drop").addClass("active");
		return false;
	}).on("dragleave", function(event) {
		// $("#omniupload-drop").removeClass("active");
	}).on("drop", function(event){
		$("#omniupload-drop").removeClass("active");
	});
	
	/* prevent rhings from happening */
	/*
	$(document).on('drop dragover', function(event) {
		event.preventDefault();
		return false;
	});
	*/
	
	var filesize = function(b) {
		if (typeof b !== 'number') return '';
		if (b >= 1000000000) return ((b / 1000000000).toFixed(2)+' GB');
		if (b >= 1000000) return ((b / 1000000).toFixed(2)+' MB');
		if (b >= 1000) return ((b / 1000).toFixed(2)+' KB');
		return b.toString()+' KB';
	};

});