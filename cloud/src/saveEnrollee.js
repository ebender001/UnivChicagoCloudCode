function isPresent(value) {
	return value !== undefined && value !== null && value !== "";
}

function toBoolean(value) {
	if (typeof value === "boolean") return value;
	if (typeof value !== "string") return null;

	const normalized = value.trim().toLowerCase();
	if (["yes", "true", "1"].includes(normalized)) return true;
	if (["no", "false", "0"].includes(normalized)) return false;
	return null;
}

function toDate(value) {
	if (!isPresent(value)) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function cleanArray(values) {
	if (!Array.isArray(values)) return [];

	return values
		.map((value) => typeof value === "string" ? value.trim() : value)
		.filter(isPresent);
}

function cleanNumberArray(values) {
	if (!Array.isArray(values)) return [];

	return values
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value))
		.map((value) => Number(value.toPrecision(2)));
}

function setIfPresent(object, field, value) {
	if (value !== null && value !== undefined) {
		object.set(field, value);
	}
}

Parse.Cloud.define("saveEnrollee", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to save enrollee registration.");
	}

	const payload = request.params && (request.params.enrollee || request.params);
	if (!payload || typeof payload !== "object") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Enrollee payload is required.");
	}

	const enrolleeNumber = typeof payload.enrolleeNumber === "string" ? payload.enrolleeNumber.trim() : "";
	if (!/^\d{8}$/.test(enrolleeNumber)) {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "An 8 digit enrollee number is required.");
	}

	const Enrollee = Parse.Object.extend("Enrollee");
	let enrollee = new Enrollee();
	if (typeof payload.enrolleeId === "string" && payload.enrolleeId.trim()) {
		// Edit mode updates the existing Enrollee rather than creating a duplicate.
		const enrolleeQuery = new Parse.Query("Enrollee");
		enrollee = await enrolleeQuery.get(payload.enrolleeId.trim(), { useMasterKey: true });
	}

	setIfPresent(enrollee, "enrolleeNumber", enrolleeNumber);
	setIfPresent(enrollee, "startDate", toDate(payload.startDate));
	setIfPresent(enrollee, "stopDate", toDate(payload.stopDate));

	const gripCompleted = toBoolean(payload.canCompleteGripTest);
	const gaitCompleted = toBoolean(payload.canCompleteGaitTest);
	setIfPresent(enrollee, "gripCompleted", gripCompleted);
	setIfPresent(enrollee, "gaitCompleted", gaitCompleted);

	if (gripCompleted) {
		enrollee.set("grip", cleanArray(payload.grip));
	}

	if (gaitCompleted) {
		enrollee.set("gait", cleanNumberArray(payload.gait));
	}

	let survey = enrollee.get("survey") || null;
	if (typeof payload.surveyId === "string" && payload.surveyId.trim()) {
		// Continue Enrollment links a previously submitted survey to the new/updated enrollee.
		const surveyQuery = new Parse.Query("Survey");
		survey = await surveyQuery.get(payload.surveyId.trim(), { useMasterKey: true });
		enrollee.set("survey", survey);
	}

	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(request.user.id, { useMasterKey: true });
	const institution = fullUser.get("institution");
	const specialty = fullUser.get("specialty");

	if (institution) enrollee.set("institution", institution);
	if (specialty) enrollee.set("specialty", specialty);

	setIfPresent(enrollee, "enrollmentComplete", Boolean(survey));
	if (!isPresent(enrollee.get("enrolledInStudy"))) {
		setIfPresent(enrollee, "enrolledInStudy", false);
	}

	const acl = new Parse.ACL(request.user);
	acl.setPublicReadAccess(false);
	acl.setPublicWriteAccess(false);
	enrollee.setACL(acl);

	const savedEnrollee = await enrollee.save(null, { useMasterKey: true });

	if (survey) {
		// Keep the relationship bidirectional for list/detail queries.
		survey.set("enrollee", savedEnrollee);
		await survey.save(null, { useMasterKey: true });
	}

	return {
		objectId: savedEnrollee.id,
		enrolleeNumber: savedEnrollee.get("enrolleeNumber"),
		createdAt: savedEnrollee.createdAt
	};
});
