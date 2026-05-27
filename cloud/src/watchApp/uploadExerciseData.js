const { findActiveWatchDevice } = require("./watchDeviceUtils.js");

function parseRequiredDate(value, fieldName) {
	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} must be a valid date.`);
	}

	return date;
}

function parseExerciseMinutes(value) {
	const minutes = Number(value);

	if (!Number.isInteger(minutes) || minutes < 0) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "exerciseMinutes must be a non-negative integer.");
	}

	if (minutes > 2147483647) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "exerciseMinutes exceeds Int32 range.");
	}

	return minutes;
}

function getExerciseRecords(params) {
	if (Array.isArray(params && params.exercises)) return params.exercises;
	if (Array.isArray(params && params.exercise)) return params.exercise;
	if (params && params.exercise) return [params.exercise];
	return [params || {}];
}

async function saveExerciseRecord(source, fallback) {
	const watchDevice = await findActiveWatchDevice(source, fallback);
	const startDate = parseRequiredDate(source.startDate, "startDate");
	const endDate = parseRequiredDate(source.endDate, "endDate");

	if (endDate < startDate) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "endDate must be after startDate.");
	}

	const exerciseMinutes = parseExerciseMinutes(source.exerciseMinutes);

	// The client app sends watch activity; CloudCode owns the Exercise row creation.
	const Exercise = Parse.Object.extend("Exercise");

	// Duplicate uploads are skipped by matching the watch device, time window, and metric value.
	const duplicateQuery = new Parse.Query(Exercise);
	duplicateQuery.equalTo("watchDevice", watchDevice);
	duplicateQuery.equalTo("startDate", startDate);
	duplicateQuery.equalTo("endDate", endDate);
	duplicateQuery.equalTo("exerciseMinutes", exerciseMinutes);

	const duplicate = await duplicateQuery.first({ useMasterKey: true });

	if (duplicate) {
		// Return the existing row so the client knows this upload was already stored.
		return {
			objectId: duplicate.id,
			watchDevice: watchDevice.id,
			startDate: duplicate.get("startDate"),
			endDate: duplicate.get("endDate"),
			exerciseMinutes: duplicate.get("exerciseMinutes"),
			duplicate: true
		};
	}

	const exercise = new Exercise();

	exercise.set("watchDevice", watchDevice);
	exercise.set("startDate", startDate);
	exercise.set("endDate", endDate);
	exercise.set("exerciseMinutes", exerciseMinutes);

	await exercise.save(null, { useMasterKey: true });

	return {
		objectId: exercise.id,
		watchDevice: watchDevice.id,
		startDate: exercise.get("startDate"),
		endDate: exercise.get("endDate"),
		exerciseMinutes: exercise.get("exerciseMinutes"),
		duplicate: false
	};
}

Parse.Cloud.define("watchAppUploadExerciseData", async (request) => {
	const records = getExerciseRecords(request.params);
	const results = [];

	for (const record of records) {
		results.push(await saveExerciseRecord(record || {}, request.params));
	}

	return {
		saved: results.filter((result) => !result.duplicate).length,
		duplicates: results.filter((result) => result.duplicate).length,
		results
	};
});
