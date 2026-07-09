const { dataAccessScopeForRole } = require("./roleAccess.js");

function serializePointer(pointer) {
	if (!pointer) return null;

	return {
		className: pointer.className,
		objectId: pointer.id,
		enrolleeNumber: pointer.get ? (pointer.get("enrolleeNumber") || pointer.get("number") || null) : null
	};
}

function serializeSurvey(survey) {
	return {
		objectId: survey.id,
		createdAt: survey.createdAt ? survey.createdAt.toISOString() : null,
		updatedAt: survey.updatedAt ? survey.updatedAt.toISOString() : null,
		enrollee: serializePointer(survey.get("enrollee"))
	};
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	return query.get(user.id, { useMasterKey: true });
}

Parse.Cloud.define("listSurveys", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list surveys.");
	}

	const limit = Math.min(Math.max(Number(request.params.limit) || 100, 1), 1000);
	const skip = Math.max(Number(request.params.skip) || 0, 0);
	const currentUser = await getCurrentUser(request.user);
	const accessScope = dataAccessScopeForRole(currentUser.get("role"));

	let query;

	if (accessScope === "all") {
		query = new Parse.Query("Survey");
	} else {
		const institution = currentUser.get("institution");

		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution to view surveys.");
		}

		const enrolleeQuery = new Parse.Query("Enrollee");
		enrolleeQuery.equalTo("institution", institution);

		const scopedSurveyQuery = new Parse.Query("Survey");
		scopedSurveyQuery.equalTo("institution", institution);
		scopedSurveyQuery.doesNotExist("enrollee");

		if (accessScope === "institution_specialty") {
			const specialty = currentUser.get("specialty");
			if (!specialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have a specialty to view surveys.");
			}

			enrolleeQuery.equalTo("specialty", specialty);
			scopedSurveyQuery.equalTo("specialty", specialty);
		}

		const linkedSurveyQuery = new Parse.Query("Survey");
		linkedSurveyQuery.matchesQuery("enrollee", enrolleeQuery);
		query = Parse.Query.or(linkedSurveyQuery, scopedSurveyQuery);
	}

	query.include("enrollee");
	query.descending("createdAt");
	query.limit(limit);
	query.skip(skip);

	const surveys = await query.find({ useMasterKey: true });
	const total = await query.count({ useMasterKey: true });

	return {
		results: surveys.map(serializeSurvey),
		count: surveys.length,
		total,
		limit,
		skip
	};
});
