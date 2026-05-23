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
	const enrollee = new Enrollee();

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
		enrollee.set("gait", cleanArray(payload.gait));
	}

	if (typeof payload.surveyId === "string" && payload.surveyId.trim()) {
		enrollee.set("survey", Parse.Object.extend("Survey").createWithoutData(payload.surveyId.trim()));
	}

	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(request.user.id, { useMasterKey: true });
	const institution = fullUser.get("institution");
	const specialty = fullUser.get("specialty");

	if (institution) enrollee.set("institution", institution);
	if (specialty) enrollee.set("specialty", specialty);

	setIfPresent(enrollee, "enrollmentComplete", true);
	setIfPresent(enrollee, "enrolledInStudy", true);

	const acl = new Parse.ACL(request.user);
	acl.setPublicReadAccess(false);
	acl.setPublicWriteAccess(false);
	enrollee.setACL(acl);

	const savedEnrollee = await enrollee.save(null, { useMasterKey: true });

	return {
		objectId: savedEnrollee.id,
		enrolleeNumber: savedEnrollee.get("enrolleeNumber"),
		createdAt: savedEnrollee.createdAt
	};
});
