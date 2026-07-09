const { dataAccessScopeForRole } = require("./roleAccess.js");

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

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include(["institution", "specialty"]);
	return query.get(user.id, { useMasterKey: true });
}

Parse.Cloud.define("getEnrolleeDetails", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to view enrollee details.");
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
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have an institution to view enrollee details.");
		}

		const sameInstitution = enrollee.get("institution") && enrollee.get("institution").id === institution.id;

		if (!sameInstitution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only view enrollees in your institution.");
		}

		if (accessScope === "institution_specialty") {
			const specialty = currentUser.get("specialty");
			if (!specialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account must have a specialty to view enrollee details.");
			}

			const sameSpecialty = enrollee.get("specialty") && enrollee.get("specialty").id === specialty.id;
			if (!sameSpecialty) {
				throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "You can only view enrollees in your institution and specialty.");
			}
		}
	}

	return {
		enrollee: serializeObject(enrollee),
		survey: survey ? serializeObject(survey) : null
	};
});
