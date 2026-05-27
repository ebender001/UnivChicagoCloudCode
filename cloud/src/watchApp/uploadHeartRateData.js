const { findActiveWatchDevice } = require("./watchDeviceUtils.js");

function parseRequiredDate(value, fieldName) {
	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} must be a valid date.`);
	}

	return date;
}

function parseHrVariability(value) {
	const hrVariability = Number(value);

	if (!Number.isFinite(hrVariability)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "hrVariability must be a number.");
	}

	return hrVariability;
}

function getHeartRateRecords(params) {
	if (Array.isArray(params && params.heartRates)) return params.heartRates;
	if (Array.isArray(params && params.heartRate)) return params.heartRate;
	if (params && params.heartRate) return [params.heartRate];
	return [params || {}];
}

async function saveHeartRateRecord(source, fallback) {
	const watchDevice = await findActiveWatchDevice(source, fallback);
	const startDate = parseRequiredDate(source.startDate, "startDate");
	const endDate = parseRequiredDate(source.endDate, "endDate");

	if (endDate < startDate) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "endDate must be after startDate.");
	}

	const hrVariability = parseHrVariability(source.hrVariability);

	// The client app sends watch heart-rate summary data; CloudCode owns the HeartRate row creation.
	const HeartRate = Parse.Object.extend("HeartRate");

	// Duplicate uploads are skipped by matching the watch device, time window, and metric value.
	const duplicateQuery = new Parse.Query(HeartRate);
	duplicateQuery.equalTo("watchDevice", watchDevice);
	duplicateQuery.equalTo("startDate", startDate);
	duplicateQuery.equalTo("endDate", endDate);
	duplicateQuery.equalTo("hrVariability", hrVariability);

	const duplicate = await duplicateQuery.first({ useMasterKey: true });

	if (duplicate) {
		// Return the existing row so the client knows this upload was already stored.
		return {
			objectId: duplicate.id,
			watchDevice: watchDevice.id,
			startDate: duplicate.get("startDate"),
			endDate: duplicate.get("endDate"),
			hrVariability: duplicate.get("hrVariability"),
			duplicate: true
		};
	}

	const heartRate = new HeartRate();

	heartRate.set("watchDevice", watchDevice);
	heartRate.set("startDate", startDate);
	heartRate.set("endDate", endDate);
	heartRate.set("hrVariability", hrVariability);

	await heartRate.save(null, { useMasterKey: true });

	return {
		objectId: heartRate.id,
		watchDevice: watchDevice.id,
		startDate: heartRate.get("startDate"),
		endDate: heartRate.get("endDate"),
		hrVariability: heartRate.get("hrVariability"),
		duplicate: false
	};
}

Parse.Cloud.define("watchAppUploadHeartRateData", async (request) => {
	const records = getHeartRateRecords(request.params);
	const results = [];

	for (const record of records) {
		results.push(await saveHeartRateRecord(record || {}, request.params));
	}

	return {
		saved: results.filter((result) => !result.duplicate).length,
		duplicates: results.filter((result) => result.duplicate).length,
		results
	};
});
