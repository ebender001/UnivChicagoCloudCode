const { verifyPin } = require("../pinUtils.js");
const { hashDeviceToken, normalizeString } = require("./watchDeviceUtils.js");

async function findUserByPin(pin) {
	const query = new Parse.Query(Parse.User);
	query.exists("hashedPIN");
	query.include(["institution", "specialty"]);
	query.limit(1000);

	const users = await query.find({ useMasterKey: true });
	return users.find((user) => verifyPin(pin, user.get("hashedPIN")));
}

Parse.Cloud.define("watchAppProvisionDevice", async (request) => {
	const payload = request.params || {};
	const pin = normalizeString(payload.PIN || payload.pin);
	const deviceUUID = normalizeString(payload.deviceUUID);
	const deviceTokenSource = normalizeString(payload.deviceToken);
	const watchNumber = normalizeString(payload.watchNumber);

	if (!/^\d{5}$/.test(pin)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "PIN must be a 5 digit string.");
	}

	if (!deviceUUID) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "deviceUUID is required.");
	}

	if (!deviceTokenSource) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "deviceToken is required.");
	}

	if (!watchNumber) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "watchNumber is required.");
	}

	const user = await findUserByPin(pin);

	if (!user) {
		throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "PIN was not recognized.");
	}

	if (user.get("isActive") !== true) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "User associated with this PIN is inactive.");
	}

	const institution = user.get("institution");
	const specialty = user.get("specialty");
	const deviceToken = hashDeviceToken(deviceTokenSource);
	const WatchDevice = Parse.Object.extend("WatchDevice");
	const query = new Parse.Query(WatchDevice);
	query.equalTo("deviceUUID", deviceUUID);

	let watchDevice = await query.first({ useMasterKey: true });
	const created = !watchDevice;

	if (!watchDevice) {
		watchDevice = new WatchDevice();
	}

	watchDevice.set("watchNumber", watchNumber);
	watchDevice.set("deviceUUID", deviceUUID);
	watchDevice.set("deviceToken", deviceToken);
	watchDevice.set("institution", institution || null);
	watchDevice.set("specialty", specialty || null);
	watchDevice.set("provisionedBy", user);
	watchDevice.set("isActive", true);

	const savedDevice = await watchDevice.save(null, { useMasterKey: true });

	return {
		success: true,
		created,
		objectId: savedDevice.id,
		watchNumber: savedDevice.get("watchNumber"),
		deviceUUID: savedDevice.get("deviceUUID"),
		institution: institution
			? {
				objectId: institution.id,
				name: institution.get("name") || null
			}
			: null,
		specialty: specialty
			? {
				objectId: specialty.id,
				name: specialty.get("name") || null
			}
			: null,
		provisionedBy: {
			objectId: user.id,
			username: user.get("username") || null,
			email: user.get("email") || null
		}
	};
});
