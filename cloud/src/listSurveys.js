function serializePointer(pointer) {
	if (!pointer) return null;

	return {
		className: pointer.className,
		objectId: pointer.id
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

Parse.Cloud.define("listSurveys", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list surveys.");
	}

	if (!(await userHasRole(request.user, "super_admin"))) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can list surveys.");
	}

	const limit = Math.min(Math.max(Number(request.params.limit) || 100, 1), 1000);
	const skip = Math.max(Number(request.params.skip) || 0, 0);

	const query = new Parse.Query("Survey");
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
