function serializeSurvey(survey) {
	return {
		objectId: survey.id,
		createdAt: survey.createdAt ? survey.createdAt.toISOString() : null,
		updatedAt: survey.updatedAt ? survey.updatedAt.toISOString() : null
	};
}

async function userHasRole(user, roleName) {
	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(user.id, { useMasterKey: true });
	const role = fullUser.get("role");

	if (role === roleName) return true;

	console.log("User role does not allow survey list access.", {
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

Parse.Cloud.define("listUnenrolledSurveys", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list surveys.");
	}

	const limit = Math.min(Math.max(Number(request.params.limit) || 100, 1), 1000);
	const skip = Math.max(Number(request.params.skip) || 0, 0);
	const currentUser = await getCurrentUser(request.user);
	const isSuperAdmin = await userHasRole(request.user, "super_admin");

	const query = new Parse.Query("Survey");
	query.doesNotExist("enrollee");
	query.descending("createdAt");
	query.limit(limit);
	query.skip(skip);

	if (!isSuperAdmin) {
		const institution = currentUser.get("institution");
		const specialty = currentUser.get("specialty");

		if (!institution || !specialty) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution and specialty to view surveys.");
		}

		query.equalTo("institution", institution);
		query.equalTo("specialty", specialty);
	}

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
