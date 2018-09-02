_Debug = []; //Debug

// Define Global Variables
zip.workerScriptsPath = '/libs/zip-js/';

Settings = {
	update: function(object, callback) {
		if (!object) return 'Usage: ...({key:value}, callback)';
		if (typeof object === 'function') {
			callback = object;
			object = null;
		}

		chrome.storage.local.get(function(localStorage) {
			if (!localStorage.settings) localStorage.settings = {}; // For first time launch

			if (object) {
				for (var key in object) {
					if(key === "path") continue;
					Settings[key] = object[key];
					localStorage.settings[key] = object[key];
				}
				chrome.storage.local.set({ settings: localStorage.settings }, function() {
					// Loop through and check if there are any onChange we need to trigger
					for (var key in object) {
						if(key === "path") continue;
						let setting = Settings.manifest[key] || Settings.manifest;
						for(let i=0; i < object.path.length; i++) setting = setting[object.path[i]].options; // Loop through our path variable to determine which onChange should be called.
						if(!Settings.manifest[key]) setting = setting[key];
						if(setting.onChange) setting.onChange(object[key]);
					}
				});
			} else {
				// Define settings as global variable and add settings from localstorage.
				Settings = {
					manifest: Settings.manifest, // Manifest of the various settings.
					update: Settings.update, // This update function
					autoStartup: localStorage.settings.autoStartup || false,
					automaticUpdates: localStorage.settings.automaticUpdates || false,
					updateWaitTime: localStorage.settings.updateWaitTime || 60,	// In
				};
			}

			if (typeof callback === 'function') callback();
		});
	},
	manifest: {
		Main: {
			title: 'Main',
			type: 'category',
			options: {
				automaticUpdates: {
					title: 'Automatically check for updates.',
					type: 'checkbox',
					options: null,
					description: "If this application should check for updates automatically or not."
				},
				updateWaitTime: {
					title: 'Time between update checks(in minutes)',
					type: 'slider',
					options: {min: 5, max: 120, step: 5},
					description: 'The amount of time the application will wait betweeen checking for updates.'
				},
				autoStartup: {
					title: 'Launch Application when Windows starts.',
					type: 'checkbox',
					options: null,
					description: "If this application should autostart with windows or not."
				},
			}
		},
	}
};

// Functions to run on launch, triggered from database.onsuccess
function onLaunch() {

	nwTray.init(true);	// Set up tray function
	disableURLs();	// Disable URLs
	attachListeners();

	Settings.update(function() {
		buildReleaseList();	// Build release list
		updateChecker();	// Check for updates
		// General.settingsGenerate();
	});
}

var attachListeners = function() {
	// Version URls
	$('.app-container')
	.off('mouseup.versionURL')
	.on('mouseup.versionURL', '.version a', function(e) {
		e.preventDefault();
		e.stopPropagation();
		var data = $(this).attr('data-src');
		nwOpen(data);
	});

	// Refresh Button
	$('.app-container')
	.off('click.refresh')
	.on('click.refresh', '.app-header .refresh button', function(e) {
		var _this = this;
		var icon = this.querySelector('i');
		icon.classList.add("spin");
		_this.classList.add("active");

		getReleaseList().then(function() {
			icon.classList.remove("spin");
			_this.classList.remove("active");
			buildReleaseList();
		});
	});

	// Download Button
	$('.app-container')
	.off('click.download')
	.on('click.download', '.releases .download button', function(e) {
		var _this = this;
		var data = $(_this).attr('data-src');
		var icon = _this.querySelector('i');

		if(!data || data == "" || _this.classList.contains('disabled')) return;

		icon.classList.add("float");
		_this.classList.add("active");
		_this.classList.add("disabled");

		// Download latest release
		downloadRelease(data).then(function() {
			icon.classList.remove("float");
			_this.classList.remove("active");
			Database.store({object: data, key:"installedVersion"}).then(function() {
				updateDownloadButtons(_this);
			});
		});
	});
};

var disableURLs = function() {
	// Disables urls, they should be called using the 'nwOpen' function to avoid issues.
	var gui = require('nw.gui');
	var win = gui.Window.get();
	win.on('new-win-policy', function(frame, url, policy) {
		// gui.Shell.openExternal(url);
		policy.ignore();
	});
};

var updateDownloadButtons = function(active) {
	var buttons = document.querySelectorAll('.releases .download button');
	for(let i=0; i < buttons.length; i++) {
		let button = buttons[i];
		if(button == active) {
			button.classList.add('active');
			button.classList.add('disabled');
			button.innerHTML = '<i class="fas fa-check"></i>Installed';
		} else {
			button.classList.remove('active');
			button.classList.remove('disabled');
			button.innerHTML = '<i class="fas fa-download"></i>Download';
		}
	}
};

// Normal Functions //

function resetWindowSize() {
	var appWindow = chrome.app.window.get('TidyPlatesApp');
	var width = window.screen.availWidth;
	var height = window.screen.availHeight;

	if (width < 1920 && height < 1050) {
		width = 670;
		height = 475;
	} else {
		width = 870;
		height = 675;
	}

	appWindow.outerBounds.width = width;
	appWindow.outerBounds.height = height;
}

function updateChecker(wait) {
	// if (!Settings.automaticUpdates) return;
	chrome.storage.local.get(function(localStorage) {
		var timeout,
			lastUpdate = localStorage.lastUpdate || 0,
			currentUpdate = new Date().getTime(),
			timeSince = Math.abs((lastUpdate - currentUpdate) / 1000 / 60); //Convert timestamp to minutes(Converted into seconds before converting into days)
		if (timeSince >= Settings.updateWaitTime) {
			timeout = Settings.updateWaitTime * 60 * 1000; //Convert from minutes to milliseconds
			wait = wait * 1000 || 0;
			setTimeout(function() {
				getReleaseList().then(function() {
					let button = document.querySelector('.app-header .refresh button');
					let icon = button.querySelector('i');
					icon.classList.remove("spin");
					button.classList.remove("active");
					buildReleaseList();
				});
				console.info('Updating..., next update in', (timeout / 60 / 1000).toFixed(1), 'minutes');
			}, wait);
		} else {
			timeout = Math.abs(timeSince - Settings.updateWaitTime) * 60 * 1000; //Convert from minutes to milliseconds
			console.info('Did not update..., next update in', (timeout / 60 / 1000).toFixed(1), 'minutes');
		}
		setTimeout(updateChecker, timeout);
	});
}

function nwOpen(url) {
	if(!url || url == "") return;
	var gui = require('nw.gui');
	// gui.Window.open(url);
	gui.Shell.openExternal(url);
}

var nwTray = {
	tray: null,
	win: null,
	isHidden: false,
	icon: 'assets/icons/32.png',
	alticon: 'assets/icons/32dot.png',
	hasNotification: false,
	init: function(enabled) {
		var _this = this;
	  // Load library
	  var gui = require('nw.gui');
	  
	  // Reference to window and tray
	  this.win = gui.Window.get();
	  this.tray = new gui.Tray({ icon: this.icon });
	  this.isHidden = false;

	  var trayHandler = function() {
	    if(_this.isHidden) {
	    	_this.win.show();
	    	_this.isHidden = !_this.isHidden;
	    } else {
	    	_this.win.hide();
	    	_this.isHidden = !_this.isHidden;
	    }
	  };

	  // Get the minimize event
	  if(enabled) {
	  	this.win.on.call(this.win, 'minimize', trayHandler);
	  	this.tray.on('click', trayHandler);
	  } else {
	  	this.win.show();
	  	this.win.removeAllListeners('minimize');
	  	this.tray.remove();
	  	this.tray = null;
	  }
	  
	},
	notification: function(updateAvailable) {
		if(updateAvailable) {
			this.tray.icon = this.alticon;
			this.hasNotification = true;
			this.win.on.call(this.win, 'focus', function() {
				nwTray.notification(false);
			});
		} else {
			this.tray.icon = this.icon;
			this.hasNotification = false;
			this.win.removeAllListeners('focus');
		}
	}
};

function xhrRequest(url, type) {
	if(!url) return "Usage: url, type(optional)";
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url);
		xhr.responseType = type || 'json';
		xhr.onload = function(e) {
			resolve(xhr.response);
		};
		xhr.onerror = function(e) {
			reject(e);
		};

		// Make sure we don't get a cached version
		xhr.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
		xhr.setRequestHeader('cache-control', 'max-age=0');
		xhr.setRequestHeader('expires', '0');
		xhr.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
		xhr.setRequestHeader('pragma', 'no-cache');

		xhr.send();
	});
}
// xhrRequest("https://api.github.com/repos/Luxocracy/TidyPlatesContinued/releases", "json");

var FileHandler = {
	read: {
		meta: function(file) {
			return new Promise(function(resolve, reject) {
				zip.createReader(new zip.BlobReader(file), function(zipReader) {
					zipReader.getEntries(function(entries) {
						resolve(entries);
					});
				}, function(err) {
					console.log(err);
					reject(err);
				});
			});
		},
		data: function(entry) {
			return new Promise(function(resolve, reject) {
				var writer = new zip.BlobWriter();
				entry.getData(writer, function(blob) {
					resolve(blob);
				});
			});
		},
	},
	write: function(blob, filename, storedDir) {
		return new Promise(function(resolve, reject) {
			var processFile = function(entry) {
				entry.getFile(filename, { create: true }, function(entry) {
					entry.createWriter(function(fileWriter) {
					  var truncated = false;

					  fileWriter.onwriteend = function(e) {
					    if (!truncated) {
					      truncated = true;
					      // You need to explicitly set the file size to truncate
					      // any content that might have been there before
					      this.truncate(blob.size);
					      return;
					    }
					    // console.log('Succesfully wrote file.');
					    resolve(entry.filename);
					  };

					  fileWriter.onerror = function(e) {
					   	console.error('Failed in writing file.');
					  };

					  fileWriter.write(blob);
					});
				}, function(error) {
					console.error(error);
				});
			};

			var processDir = function(entry) {
				entry.getDirectory(filename, { create: true }, function(entry) {
					// console.log('Succesfully Created Directory.');
					resolve(entry.filename);
				}, function(error) {
					console.error(error);
				});
			};

			chrome.fileSystem.getWritableEntry(storedDir, function(entry) {
				if(!blob.size || blob.size === 0) {
					processDir(entry);
				} else {
					processFile(entry);
				}
			});
		});

	},
};

var WTFFolder = function(newLocation) {
	return new Promise(function(resolve, reject) {
		chrome.storage.local.get(function(localStorage) {
			if (!localStorage.WTFFolder) localStorage.WTFFolder = 'none'; // Because 'isRestorable' throws an error if this is 'undefined'
			chrome.fileSystem.isRestorable(localStorage.WTFFolder, function(dirIsRestorable) {
				if (dirIsRestorable && !newLocation) {
					chrome.fileSystem.restoreEntry(localStorage.WTFFolder, function(dir) {
						// Verify the dirctory exists
						if(dir) {
							resolve(dir);
						} else {
							WTFFolder(true).then(resolve); // Set a new directory if it doesn't exist.
						}
					});
				} else if (newLocation !== false) {
					chrome.fileSystem.chooseEntry({
							type: 'openDirectory',
						},
						function(dir) {
							if (chrome.runtime.lastError) {
								console.warn('Something went wrong while choosingEntry:', chrome.runtime.lastError.message);
								return;
							}
							var storedDir = chrome.fileSystem.retainEntry(dir);
							chrome.storage.local.set({ WTFFolder: storedDir });

							resolve(dir);
						}
					);
				} else {
					reject(false);
				}
			});
		});
	});
};

var getReleaseList = function() {
	return new Promise(function(resolve, reject) {
		Database.get({key: "releases"}).then(function(oldReleases) {
			xhrRequest("https://api.github.com/repos/Luxocracy/TidyPlatesContinued/releases", "json").then(function(releases) {
				Database.store({object: releases, key: "releases"}).then(function() {
					chrome.storage.local.set({ lastUpdate: new Date().getTime() });
					if(releases.length > oldReleases.length) nwTray.notification(true);	// Indicate that there is a new update available.
					resolve(releases);
				});
			});
		});
	});
};

// Function that extracts the downloaded release file
var extractRelease = function(release) {
	return new Promise(function(resolve, reject) {
		// Function that gets the directory names.
		var getDirs = function(entries) {
			let dirs = [];
			let dirRegex = new RegExp(entries[0].filename.match(/.*?\//) + '([^\/]*?)\/$', 'i');
			let dirNameRegex = new RegExp(entries[0].filename.match(/.*?\//) + '([^\/]*?)\/', 'i');

			for(let i=0; i < entries.length; i++) {
				if(entries[i].directory && entries[i].filename.match(dirRegex)) dirs.push(entries[i].filename.match(dirNameRegex)[1]);
			}
			return dirs;
		};

		if(!release) return;

		// Download the release from the given URL
		xhrRequest(release.zipball_url, "blob").then(function(blob) {
			// Read the metadata/filelist of the zip file.
			FileHandler.read.meta(blob).then(function(entries) {
				let dirs = getDirs(entries);
				let manifest = [];
				
				// Function that filters any unwanted files. In this case, filter anything that isn't a folder.
				let isAllowed = function(filename) {
					let regexString = "";
					let allowedFiles;

					for(let i=0; i < dirs.length; i++) {
						regexString += dirs[i] + '\/|';
					}
					allowedFiles = new RegExp(regexString.slice(0, -1), 'i');

					return filename.match(allowedFiles);
				};

				// Get the WTF folder, if it isn't set, set it so that we are allowed to write to it.
				WTFFolder().then(function(storedDir) {
					// Loop through all files.
					for(let i=0; i < entries.length; i++) {
						let entry = entries[i];
						if(isAllowed(entry.filename)) {
							let filename = entry.filename.replace(/[^\/]*?\//i, "");
							manifest.push(filename);
							// Get file Blob and write it.
							FileHandler.read.data(entry).then(function(blob) {
								FileHandler.write(blob, filename, storedDir).then(function(name) {
									manifest.splice(manifest.indexOf(name), 1);	// Remove file from manifest
									if(manifest.length == 0) {
										console.log("Finished writing files.");
										resolve();	// If we have no more files left to write, resolve
									}
								});
							});
						}
					}
				});
				// console.log(dirs, entries);
			});
			// console.log(blob);
		});
	});
};

var downloadRelease = function(version, forceUpdate) {
	return new Promise(function (resolve, reject) {
		version = version || "latest";

		// Function that tries to match the requested version
		var getRelease = function(releases) {
			let release;
			if(version !== "latest") {
				for(let i=0; i < releases.length; i++) {
					if(releases[i].tag_name === version) {
						release = releases[i];
						break;
					}
				}
			} else {
				release = releases[0];
			}

			if(release) {
				return release;
			} else {
				console.error("Could not find release:", version);
				return false;
			}
		};

		// Check database for release list
		Database.get({key: "releases"}).then(function(releases) {
			if(releases && !forceUpdate) {
				// If release list exists and we aren't forced to get a new one
				extractRelease(getRelease(releases)).then(resolve);
			} else {
				// Get the release list from the GitHub API
				// This really shouldn't happen, but...
				getReleaseList().then(function(releases) {
					extractRelease(getRelease(releases)).then(resolve);
				});
			}
		});	
	});
};

var buildReleaseList = function() {
	Database.get({key: "releases"}).then(function(releases) {
		var table = document.querySelector('.releases tbody');
				table.innerHTML = "";
		for(let i=0; i < releases.length; i++) {
			let release = releases[i];
			let date = new Date(release.published_at);
			let description = release.name == "" ? "Could not find description...":release.name;
			let tr = document.createElement('tr');
					tr.className = "section";
					tr.data = release.tag_name;
					tr.innerHTML = `
						<td class="version"><a href="#" target="_blank" data-src="`+ release.html_url +`">`+ release.tag_name +`</a></td>
						<td class="date"><span class="date">`+ date.toLocaleDateString() +'</span><span class="time">'+ date.toLocaleTimeString() +`</span></td>
						<td class="description" title="`+ release.body +`">`+ description +`</td>
						<td class="download"><button data-src="`+ release.tag_name +`"><i class="fas fa-download"></i>Download</button></td>
					`;
			table.append(tr);
		}

		// Update download buttons with installed version.
		// Should add proper installed detection later on.
		Database.get({key: "installedVersion"}).then(function(version) {
			var button = document.querySelector('button[data-src="'+ version +'"]');
			updateDownloadButtons(button);
		});
	});
};


$(window).on('new-win-policy', newWinPolicyHandler);

function newWinPolicyHandler(frame, url, policy) {
	policy.ignore(); //ignore policy first to prevent popup
}