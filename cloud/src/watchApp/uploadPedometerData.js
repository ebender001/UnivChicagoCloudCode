function parseRequiredDate(value, fieldName) {
	const date = value instanceof Date ? value : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} must be a valid date.`);
	}

	return date;
}

function parseDouble(value, fieldName) {
	const parsed = Number(value);

	if (!Number.isFinite(parsed)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} must be a number.`);
	}

	return parsed;
}

function parseInt32(value, fieldName) {
	const parsed = Number(value);

	if (!Number.isInteger(parsed)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} must be an integer.`);
	}

	if (parsed < -2147483648 || parsed > 2147483647) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} exceeds Int32 range.`);
	}

	return parsed;
}

function getPedometerRecords(params) {
	if (Array.isArray(params && params.pedometers)) return params.pedometers;
	if (Array.isArray(params && params.pedometer)) return params.pedometer;
	if (params && params.pedometer) return [params.pedometer];
	return [params || {}];
}

async function savePedometerRecord(source) {
	const patientId = typeof source.patientId === "string" ? source.patientId.trim() : "";

	if (!patientId) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "patientId is required.");
	}

	const startDate = parseRequiredDate(source.startDate, "startDate");
	const endDate = parseRequiredDate(source.endDate, "endDate");

	if (endDate < startDate) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "endDate must be after startDate.");
	}

	const distance = parseDouble(source.distance, "distance");
	const flightsClimbed = parseDouble(source.flightsClimbed, "flightsClimbed");
	const numberOfSteps = parseInt32(source.numberOfSteps, "numberOfSteps");
	const standMinutes = parseDouble(source.standMinutes, "standMinutes");
	const walkingSpeed = parseDouble(source.walkingSpeed, "walkingSpeed");
	const walkingStepLength = parseDouble(source.walkingStepLength, "walkingStepLength");

	// The client app sends watch pedometer metrics; CloudCode owns the Pedometer row creation.
	const Pedometer = Parse.Object.extend("Pedometer");

	// Duplicate uploads are skipped by matching the patient, time window, and all metric values.
	const duplicateQuery = new Parse.Query(Pedometer);
	duplicateQuery.equalTo("patientId", patientId);
	duplicateQuery.equalTo("startDate", startDate);
	duplicateQuery.equalTo("endDate", endDate);
	duplicateQuery.equalTo("distance", distance);
	duplicateQuery.equalTo("flightsClimbed", flightsClimbed);
	duplicateQuery.equalTo("numberOfSteps", numberOfSteps);
	duplicateQuery.equalTo("standMinutes", standMinutes);
	duplicateQuery.equalTo("walkingSpeed", walkingSpeed);
	duplicateQuery.equalTo("walkingStepLength", walkingStepLength);

	const duplicate = await duplicateQuery.first({ useMasterKey: true });

	if (duplicate) {
		// Return the existing row so the client knows this upload was already stored.
		return {
			objectId: duplicate.id,
			patientId: duplicate.get("patientId"),
			startDate: duplicate.get("startDate"),
			endDate: duplicate.get("endDate"),
			distance: duplicate.get("distance"),
			flightsClimbed: duplicate.get("flightsClimbed"),
			numberOfSteps: duplicate.get("numberOfSteps"),
			standMinutes: duplicate.get("standMinutes"),
			walkingSpeed: duplicate.get("walkingSpeed"),
			walkingStepLength: duplicate.get("walkingStepLength"),
			duplicate: true
		};
	}

	const pedometer = new Pedometer();

	pedometer.set("patientId", patientId);
	pedometer.set("startDate", startDate);
	pedometer.set("endDate", endDate);
	pedometer.set("distance", distance);
	pedometer.set("flightsClimbed", flightsClimbed);
	pedometer.set("numberOfSteps", numberOfSteps);
	pedometer.set("standMinutes", standMinutes);
	pedometer.set("walkingSpeed", walkingSpeed);
	pedometer.set("walkingStepLength", walkingStepLength);

	await pedometer.save(null, { useMasterKey: true });

	return {
		objectId: pedometer.id,
		patientId: pedometer.get("patientId"),
		startDate: pedometer.get("startDate"),
		endDate: pedometer.get("endDate"),
		distance: pedometer.get("distance"),
		flightsClimbed: pedometer.get("flightsClimbed"),
		numberOfSteps: pedometer.get("numberOfSteps"),
		standMinutes: pedometer.get("standMinutes"),
		walkingSpeed: pedometer.get("walkingSpeed"),
		walkingStepLength: pedometer.get("walkingStepLength"),
		duplicate: false
	};
}

Parse.Cloud.define("watchAppUploadPedometerData", async (request) => {
	const records = getPedometerRecords(request.params);
	const results = [];

	for (const record of records) {
		results.push(await savePedometerRecord(record || {}));
	}

	return {
		saved: results.filter((result) => !result.duplicate).length,
		duplicates: results.filter((result) => result.duplicate).length,
		results
	};
});
