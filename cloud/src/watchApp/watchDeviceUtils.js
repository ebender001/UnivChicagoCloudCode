const crypto = require("crypto");

function normalizeString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function hashDeviceToken(deviceToken) {
	return crypto
		.createHash("sha256")
		.update(deviceToken)
		.digest("hex");
}

function getWatchIdentifier(source, fallback, fieldName) {
	return normalizeString(source && source[fieldName]) || normalizeString(fallback && fallback[fieldName]);
}

async function findActiveWatchDevice(source, fallback) {
	const watchNumber = getWatchIdentifier(source, fallback, "watchNumber");
	const deviceUUID = getWatchIdentifier(source, fallback, "deviceUUID");
	const deviceTokenSource = getWatchIdentifier(source, fallback, "deviceToken");

	if (!watchNumber) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "watchNumber is required.");
	}

	if (!deviceUUID) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "deviceUUID is required.");
	}

	if (!deviceTokenSource) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "deviceToken is required.");
	}

	const WatchDevice = Parse.Object.extend("WatchDevice");
	const query = new Parse.Query(WatchDevice);
	query.equalTo("watchNumber", watchNumber);
	query.equalTo("deviceUUID", deviceUUID);
	query.equalTo("deviceToken", hashDeviceToken(deviceTokenSource));
	query.equalTo("isActive", true);

	const watchDevice = await query.first({ useMasterKey: true });
	if (!watchDevice) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Active watch device was not recognized.");
	}

	return watchDevice;
}

module.exports = {
	hashDeviceToken,
	normalizeString,
	findActiveWatchDevice
};
