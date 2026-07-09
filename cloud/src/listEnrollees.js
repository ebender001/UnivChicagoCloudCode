const { dataAccessScopeForRole } = require("./roleAccess.js");

function serializeValue(value) {
	if (value instanceof Date) return value.toISOString();

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

function serializeEnrollee(enrollee) {
	const fields = {};

	Object.keys(enrollee.attributes || {}).forEach((key) => {
		fields[key] = serializeValue(enrollee.get(key));
	});

	return {
		objectId: enrollee.id,
		createdAt: enrollee.createdAt ? enrollee.createdAt.toISOString() : null,
		updatedAt: enrollee.updatedAt ? enrollee.updatedAt.toISOString() : null,
		enrolleeNumber: enrollee.get("enrolleeNumber") || enrollee.get("number") || null,
		startDate: serializeValue(enrollee.get("startDate")),
		stopDate: serializeValue(enrollee.get("stopDate")),
		fields
	};
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	return query.get(user.id, { useMasterKey: true });
}

Parse.Cloud.define("listEnrollees", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to list enrollees.");
	}

	const limit = Math.min(Math.max(Number(request.params.limit) || 100, 1), 1000);
	const skip = Math.max(Number(request.params.skip) || 0, 0);
	const currentUser = await getCurrentUser(request.user);
	const accessScope = dataAccessScopeForRole(currentUser.get("role"));

	const query = new Parse.Query("Enrollee");
	query.descending("createdAt");
	query.limit(limit);
	query.skip(skip);

	if (accessScope !== "all") {
		const institution = currentUser.get("institution");

		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution to view enrollees.");
		}

		query.equalTo("institution", institution);

		if (accessScope === "institution_specialty") {
			const specialty = currentUser.get("specialty");
			if (!specialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have a specialty to view enrollees.");
			}

			query.equalTo("specialty", specialty);
		}
	}

	const enrollees = await query.find({ useMasterKey: true });
	const total = await query.count({ useMasterKey: true });

	return {
		results: enrollees.map(serializeEnrollee),
		count: enrollees.length,
		total,
		limit,
		skip
	};
});
