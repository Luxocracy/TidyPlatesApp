var ActiveDB = 'TidyPlates';
var db = {};
var dbVersion = 1;
Database = {};

var requestDatabase = function(callback) {
	openRequest = indexedDB.open(ActiveDB, dbVersion);
	openRequest.onupgradeneeded = function(e) {
		console.log('Upgrading Database...');
		var thisDB = e.target.result;
		var tx = e.target.transaction;
		var store;

		if (!thisDB.objectStoreNames.contains('Main')) {
			store = thisDB.createObjectStore('Main');
		}
	};

	openRequest.onsuccess = function(e) {
		console.log('Successfully opened link with database!');
		db = e.target.result;

		// Call Restoring functions
		if (callback) {
			callback();
		} else {
			if(typeof onLaunch === "function") onLaunch();
		}
	};

	openRequest.onerror = function(e) {
		console.log('Error');
		console.dir(e);
	};
};
requestDatabase();

Database.store = function(object) {
	this.status = 'working';
	if (!object) return "Usage: ...({database:'Database Name', object: 'Object to be stored', key:'Key Name' *Optional}).then().catch()";
	if (!object.database) object.database = "Main";
	return new Promise(function(resolve, reject) {
		var store = db.transaction([object.database], 'readwrite').objectStore(object.database);
		var request;

		if (object.key) {
			request = store.put(object.object, object.key);
		} else {
			request = store.put(object.object);
		}

		request.onsuccess = function(e) {
			this.status = 'idle';
			var keyPath = e.target.result;
			resolve(keyPath);
		};

		request.onerror = function(e) {
			this.status = 'idle';
			console.error('Error', e.target.error.name, object);
			console.dir(e);
			reject(e);
		};
	});
};

Database.set = Database.store;

Database.get = function(object) {
	if (!object) return "Usage: ...({database:'Database Name', key:'Key Name'}).then().catch()";
	if (!object.database) object.database = "Main";
	return new Promise(function(resolve, reject) {
		var request = db
			.transaction([object.database], 'readonly')
			.objectStore(object.database)
			.get(object.key);

		request.onsuccess = function(e) {
			var result = e.target.result || false;
			resolve(result);
		};

		request.onerror = function(e) {
			reject(e);
		};
	});
};

// Removal functions
Database.clear = function(database) {
	return new Promise(function(resolve, reject) {
		var request = db
			.transaction(database, 'readwrite')
			.objectStore(database)
			.clear();

		request.onsuccess = function() {
			console.log('Deleted object successfully', database);
			resolve();
		};
		request.onerror = function() {
			console.log("Couldn't delete object", database);
			reject();
		};
		request.onblocked = function() {
			console.log("Couldn't delete object due to the operation being blocked", database);
		};
	});
};

Database.remove = function(object) {
	if (!object) return "Usage: ...({database:'Database Name', key: Key Value}).then().catch()";
	return new Promise(function(resolvePromise, rejectPromise) {
		var resolve = function(e) {
			resolvePromise(e);
		};

		var reject = function(e) {
			rejectPromise(e);
		};

		var request = db
			.transaction([object.database], 'readwrite')
			.objectStore(object.database)
			.delete(object.key);

		request.onsuccess = function() {
			console.log('Deleted object successfully', object);
			resolve(true);
		};
		request.onerror = function() {
			console.log("Couldn't delete object", object);
			reject(false);
		};
		request.onblocked = function() {
			console.log("Couldn't delete object due to the operation being blocked", object);
			reject(false);
		};
	});
};

Database.removeDB = function(name) {
	return new Promise(function(resolve, reject) {
		var request = indexedDB.deleteDatabase(name);

		request.onsuccess = function() {
			console.log('Deleted database successfully', name);
			resolve();
		};
		request.onerror = function() {
			console.log("Couldn't delete database", name);
			reject();
		};
		request.onblocked = function() {
			console.log("Couldn't delete database due to the operation being blocked", name);
			reject();
		};
	});
};

Database.close = function() {
	return new Promise(function(resolve, reject) {
		db.close();
		requestDatabase(function() {
			console.log('Callback from database.close was triggered!');
			resolve();
		});
	});
};
