// On install event
chrome.runtime.onInstalled.addListener(function() {
	// Fires on installation or when updated, use to create first time settings needed and so on...
	//chrome.storage.local.set(object items, function callback);
});

// On launch event
chrome.app.runtime.onLaunched.addListener(function() {
	var width = window.screen.availWidth;
	var height = window.screen.availHeight;

	if (width < 1920 && height < 1080) {
		width = 670;
		height = 475;
	} else {
		width = 870;
		height = 675;
	}

	chrome.app.window.create('main.html', {
		id: 'TidyPlatesApp',
		outerBounds: {
			width: width,
			height: height,
		},
		frame: {
			type: 'chrome',
			color: '#19191F',
		},
	});
});
