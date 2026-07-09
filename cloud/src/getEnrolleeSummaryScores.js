const { calculateFrailty } = require("./frailtySummary.js");
const { dataAccessScopeForRole } = require("./roleAccess.js");

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
	const accessScope = dataAccessScopeForRole(currentUser.get("role"));
	const query = new Parse.Query("Enrollee");
	query.include("survey");

	const enrollee = await query.get(enrolleeId, { useMasterKey: true });
	const survey = enrollee.get("survey");

	if (accessScope !== "all") {
		const institution = currentUser.get("institution");

		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution to view enrollee summary scores.");
		}

		const sameInstitution = enrollee.get("institution") && enrollee.get("institution").id === institution.id;

		if (!sameInstitution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only view enrollees in your institution.");
		}

		if (accessScope === "institution_specialty") {
			const specialty = currentUser.get("specialty");
			if (!specialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have a specialty to view enrollee summary scores.");
			}

			const sameSpecialty = enrollee.get("specialty") && enrollee.get("specialty").id === specialty.id;
			if (!sameSpecialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only view enrollees in your institution and specialty.");
			}
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
