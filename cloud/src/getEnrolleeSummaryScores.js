const { calculateFrailty } = require("./frailtySummary.js");

async function userHasRole(user, roleName) {
	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(user.id, { useMasterKey: true });
	return fullUser.get("role") === roleName;
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	return query.get(user.id, { useMasterKey: true });
}

Parse.Cloud.define("getEnrolleeSummaryScores", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to view enrollee summary scores.");
	}

	const enrolleeId = request.params && request.params.enrolleeId;
	if (!enrolleeId || typeof enrolleeId !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Enrollee id is required.");
	}

	const currentUser = await getCurrentUser(request.user);
	const isSuperAdmin = await userHasRole(request.user, "super_admin");
	const query = new Parse.Query("Enrollee");
	query.include("survey");

	const enrollee = await query.get(enrolleeId, { useMasterKey: true });
	const survey = enrollee.get("survey");

	if (!isSuperAdmin) {
		const institution = currentUser.get("institution");
		const specialty = currentUser.get("specialty");

		if (!institution || !specialty) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution and specialty to view enrollee summary scores.");
		}

		const sameInstitution = enrollee.get("institution") && enrollee.get("institution").id === institution.id;
		const sameSpecialty = enrollee.get("specialty") && enrollee.get("specialty").id === specialty.id;

		if (!sameInstitution || !sameSpecialty) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only view enrollees in your institution and specialty.");
		}
	}

	if (!survey) {
		return {
			enrolleeId: enrollee.id,
			surveyDate: null,
			scores: null,
			message: "No linked survey."
		};
	}

	return {
		enrolleeId: enrollee.id,
		surveyDate: survey.createdAt ? survey.createdAt.toISOString() : null,
		scores: calculateFrailty(enrollee, survey)
	};
});
