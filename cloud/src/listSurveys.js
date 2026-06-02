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

async function userHasRole(user, roleName) {
	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(user.id, { useMasterKey: true });
	const role = fullUser.get("role");

	if (role === roleName) return true;

	console.log("User role does not allow all survey list access.", {
		userId: user.id,
		requiredRole: roleName,
		actualRole: role || null
	});

	return false;
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
	const isSuperAdmin = await userHasRole(request.user, "super_admin");

	let query;

	if (isSuperAdmin) {
		query = new Parse.Query("Survey");
	} else {
		const institution = currentUser.get("institution");
		const specialty = currentUser.get("specialty");

		if (!institution || !specialty) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution and specialty to view surveys.");
		}

		const enrolleeQuery = new Parse.Query("Enrollee");
		enrolleeQuery.equalTo("institution", institution);
		enrolleeQuery.equalTo("specialty", specialty);

		const scopedSurveyQuery = new Parse.Query("Survey");
		scopedSurveyQuery.equalTo("institution", institution);
		scopedSurveyQuery.equalTo("specialty", specialty);
		scopedSurveyQuery.doesNotExist("enrollee");

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
