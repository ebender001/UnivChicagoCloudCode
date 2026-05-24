function serializeValue(value) {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(serializeValue);

	if (value && typeof value === "object") {
		if (value.className && value.id) {
			return {
				className: value.className,
				objectId: value.id
			};
		}

		return null;
	}

	return value;
}

function serializeObject(object) {
	const fields = {};

	Object.keys(object.attributes || {}).forEach((key) => {
		fields[key] = serializeValue(object.get(key));
	});

	return {
		objectId: object.id,
		createdAt: object.createdAt ? object.createdAt.toISOString() : null,
		updatedAt: object.updatedAt ? object.updatedAt.toISOString() : null,
		fields
	};
}

async function userHasRole(user, roleName) {
	const userQuery = new Parse.Query(Parse.User);
	const fullUser = await userQuery.get(user.id, { useMasterKey: true });
	return fullUser.get("role") === roleName;
}

Parse.Cloud.define("getEnrolleeDetails", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to view enrollee details.");
	}

	if (!(await userHasRole(request.user, "super_admin"))) {
		throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Only super_admin users can view enrollee details.");
	}

	const enrolleeId = request.params && request.params.enrolleeId;
	if (!enrolleeId || typeof enrolleeId !== "string") {
		throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Enrollee id is required.");
	}

	const query = new Parse.Query("Enrollee");
	query.include("survey");

	const enrollee = await query.get(enrolleeId, { useMasterKey: true });
	const survey = enrollee.get("survey");

	return {
		enrollee: serializeObject(enrollee),
		survey: survey ? serializeObject(survey) : null
	};
});
